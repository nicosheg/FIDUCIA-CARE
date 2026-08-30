// lib/aria/dailyIntelligence.js
import pool from'../db';
import{getPriorityQueue}from'./priorityQueue';

/*
 * DAILY ARIA INTELLIGENCE
 *
 * Purpose:
 * 1. Tell the leader what happened.
 * 2. Detect emerging patterns.
 * 3. Identify people who may be slipping.
 * 4. Give ONE clear next action.
 *
 * FACT = directly measured data.
 * PATTERN = repeated/change-over-time behavior.
 * HYPOTHESIS = possible interpretation.
 * UNKNOWN = ARIA does not have enough evidence.
 *
 * ARIA must never present a prediction as certainty.
 */

export async function getDailyIntelligence(orgId){
  if(!orgId)throw new Error('orgId required');

  const[
    peopleRes,
    sessionsRes,
    attendanceRes,
    observationsRes,
    actionsRes,
    participationRes
  ]=await Promise.all([

    pool.query(`
      SELECT COUNT(*)::int AS count
      FROM people
      WHERE organization_id=$1
        AND status='active'
    `,[orgId]),

    pool.query(`
      SELECT COUNT(*)::int AS count
      FROM sessions
      WHERE organization_id=$1
        AND created_at>=CURRENT_DATE
    `,[orgId]),

    pool.query(`
      SELECT
        COUNT(*) FILTER(WHERE present=true)::int AS present,
        COUNT(*) FILTER(WHERE present=false)::int AS absent,
        COUNT(*)::int AS total
      FROM attendance_records
      WHERE organization_id=$1
        AND attendance_date>=CURRENT_DATE-INTERVAL '30 days'
    `,[orgId]),

    pool.query(`
      SELECT
        COUNT(*) FILTER(
          WHERE status='active'
          AND(expires_at IS NULL OR expires_at>NOW())
        )::int AS active,
        COUNT(*) FILTER(
          WHERE detected_at>=CURRENT_DATE
        )::int AS today
      FROM aria_observations
      WHERE organization_id=$1
    `,[orgId]),

    pool.query(`
      SELECT
        COUNT(*) FILTER(
          WHERE status IN('proposed','approved','queued')
        )::int AS pending
      FROM aria_actions
      WHERE organization_id=$1
    `,[orgId]),

    pool.query(`
      SELECT COUNT(*)::int AS count
      FROM participation_records
      WHERE organization_id=$1
        AND occurred_at>=CURRENT_DATE-INTERVAL '30 days'
    `,[orgId])
  ]);

  const people=peopleRes.rows[0]?.count||0;
  const sessions=sessionsRes.rows[0]?.count||0;
  const attendance=attendanceRes.rows[0]||{};
  const observations=observationsRes.rows[0]||{};
  const actions=actionsRes.rows[0]||{};
  const participation=participationRes.rows[0]?.count||0;

  const priority=await getPriorityQueue(orgId,5);

  const slipping=priority.filter(
    p=>p.signal_type==='emerging_attendance_decline'||
       p.signal_type==='extended_absence'
  );

  let summary;

  if(slipping.length){
    summary=
      `ARIA found ${slipping.length} people showing an emerging attendance pattern that may deserve attention.`;
  }else if(Number(observations.active)>0){
    summary=
      `ARIA is monitoring ${observations.active} active signal${Number(observations.active)===1?'':'s'} across your organization.`;
  }else if(people===0){
    summary=
      'ARIA is ready. Your organization is just getting started.';
  }else{
    summary=
      'Nothing urgent is showing right now. ARIA is continuing to watch for meaningful changes.';
  }

  let nextAction={
    type:'NONE',
    title:'Nothing urgent today',
    description:'ARIA will continue monitoring attendance and participation patterns.',
    personId:null
  };

  if(priority.length){
    const p=priority[0];

    if(p.signal_type==='emerging_attendance_decline'){
      nextAction={
        type:'CHECK_IN',
        title:`Check in with ${p.first_name}`,
        description:`Attendance is showing a declining pattern. This is an emerging signal, not a prediction of what will happen.`,
        personId:p.person_id
      };
    }else if(p.signal_type==='extended_absence'){
      nextAction={
        type:'CHECK_IN',
        title:`Reach out to ${p.first_name}`,
        description:`${p.first_name} has been absent longer than their recent pattern suggests.`,
        personId:p.person_id
      };
    }else{
      nextAction={
        type:'REVIEW',
        title:`Review ${p.first_name}'s signal`,
        description:p.reason,
        personId:p.person_id
      };
    }
  }

  return{
    date:new Date().toISOString().slice(0,10),
    summary,
    facts:{
      activePeople:people,
      sessionsToday:sessions,
      attendanceLast30Days:{
        present:Number(attendance.present)||0,
        absent:Number(attendance.absent)||0,
        total:Number(attendance.total)||0
      },
      participationLast30Days:participation,
      activeObservations:Number(observations.active)||0,
      observationsToday:Number(observations.today)||0,
      pendingActions:Number(actions.pending)||0
    },
    patterns:priority.map(p=>({
      personId:p.person_id,
      name:[p.first_name,p.last_name].filter(Boolean).join(' '),
      type:p.signal_type,
      priorityScore:p.priority_score,
      reason:p.reason,
      evidence:{
        recentAttendance:p.recent_attendance,
        previousAttendance:p.previous_attendance,
        lastAttendance:p.last_attendance
      },
      confidenceType:'PATTERN'
    })),
    nextAction
  };
}
