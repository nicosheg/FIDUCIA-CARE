// lib/aria/dailyIntelligence.js
import pool from '../db';
import{getPriorityQueue}from'./priorityQueue';

export async function getDailyIntelligence(orgId){
 if(!orgId)throw new Error('orgId required');

 const[peopleRes,sessionsRes,attendanceRes,observationsRes,actionsRes,participationRes]=await Promise.all([
  pool.query(`SELECT COUNT(*)::int AS count FROM people WHERE organization_id=$1 AND status='active'`,[orgId]),
  pool.query(`SELECT COUNT(*)::int AS count FROM sessions WHERE organization_id=$1 AND started_at>=CURRENT_DATE`,[orgId]),
  pool.query(`
   SELECT
    COUNT(*) FILTER(WHERE present=true)::int AS present,
    COUNT(*) FILTER(WHERE present=false)::int AS absent,
    COUNT(*)::int AS total
   FROM attendance_records
   WHERE organization_id=$1 AND attendance_date>=CURRENT_DATE-INTERVAL'30 days'
  `,[orgId]),
  pool.query(`
   SELECT
    COUNT(*) FILTER(WHERE status='active' AND(expires_at IS NULL OR expires_at>NOW()))::int AS active,
    COUNT(*) FILTER(WHERE detected_at>=CURRENT_DATE)::int AS today
   FROM aria_observations
   WHERE organization_id=$1
  `,[orgId]),
  pool.query(`
   SELECT COUNT(*) FILTER(WHERE status IN('proposed','approved'))::int AS pending
   FROM aria_actions
   WHERE organization_id=$1
  `,[orgId]),
  pool.query(`
   SELECT COUNT(*)::int AS count
   FROM participation_records
   WHERE organization_id=$1 AND occurred_at>=CURRENT_DATE-INTERVAL'30 days'
  `,[orgId])
 ]);

 const people=Number(peopleRes.rows[0]?.count)||0;
 const sessions=Number(sessionsRes.rows[0]?.count)||0;
 const attendance=attendanceRes.rows[0]||{};
 const observations=observationsRes.rows[0]||{};
 const actions=actionsRes.rows[0]||{};
 const participation=Number(participationRes.rows[0]?.count)||0;
 const priority=await getPriorityQueue(orgId,5);

 const slipping=priority.filter(p=>['emerging_attendance_decline','extended_absence'].includes(p.signal_type));

 const summary=
  slipping.length?
   `ARIA found ${slipping.length} people showing attendance patterns that may deserve attention.`:
  Number(observations.active)>0?
   `ARIA is monitoring ${observations.active} active signal${Number(observations.active)===1?'':'s'} across your organization.`:
  people===0?
   'ARIA is ready. Your organization is just getting started.':
   'Nothing urgent is showing right now. ARIA is continuing to watch for meaningful changes.';

 let nextAction={
  type:'NONE',
  title:'Nothing urgent today',
  description:'ARIA will continue monitoring people and participation patterns.',
  personId:null
 };

 if(priority.length){
  const p=priority[0];
  nextAction={
   type:['emerging_attendance_decline','extended_absence'].includes(p.signal_type)?'CHECK_IN':'REVIEW',
   title:['emerging_attendance_decline','extended_absence'].includes(p.signal_type)?`Check in with ${p.first_name}`:`Review ${p.first_name}'s signal`,
   description:p.reason,
   personId:p.person_id
  };
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
    recentAttendance:Number(p.recent_attendance)||0,
    previousAttendance:Number(p.previous_attendance)||0,
    lastAttendance:p.last_attendance
   },
   confidenceType:'PATTERN'
  })),
  nextAction
 };
    }
