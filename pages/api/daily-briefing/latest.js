// pages/api/daily-briefing/latest.js
import pool from '../../../lib/db';
import {withOrg} from '../../../lib/apiHelpers';

async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  const orgId=req.org.id;

  try{
    const [people,sessions,attendees,observations,actions,patterns]=await Promise.all([
      pool.query(`
        SELECT COUNT(*)::int AS count
        FROM people
        WHERE organization_id=$1 AND status='active'
      `,[orgId]),

      pool.query(`
        SELECT COUNT(*)::int AS count
        FROM sessions
        WHERE organization_id=$1
          AND started_at>=NOW()-INTERVAL '30 days'
      `,[orgId]),

      pool.query(`
        SELECT COUNT(DISTINCT people_id)::int AS count
        FROM attendance_records
        WHERE organization_id=$1
          AND present=true
          AND confirmed=true
          AND attendance_date>=CURRENT_DATE-INTERVAL '30 days'
      `,[orgId]),

      pool.query(`
        SELECT id,person_id,type,confidence,severity,urgency,
               attention_score,evidence,detected_at
        FROM aria_observations
        WHERE organization_id=$1
          AND status='active'
          AND (expires_at IS NULL OR expires_at>NOW())
        ORDER BY attention_score DESC,detected_at DESC
        LIMIT 5
      `,[orgId]),

      pool.query(`
        SELECT a.id,a.person_id,a.type,a.status,a.priority,
               a.action_metadata,a.proposed_at,
               p.first_name,p.last_name
        FROM aria_actions a
        LEFT JOIN people p
          ON p.id=a.person_id
         AND p.organization_id=a.organization_id
        WHERE a.organization_id=$1
          AND a.status IN('proposed','approved')
        ORDER BY
          CASE a.priority
            WHEN 'critical' THEN 4
            WHEN 'high' THEN 3
            WHEN 'medium' THEN 2
            ELSE 1
          END DESC,
          a.proposed_at ASC
        LIMIT 5
      `,[orgId]),

      pool.query(`
        WITH recent_sessions AS(
          SELECT id,started_at,
                 ROW_NUMBER() OVER(ORDER BY started_at DESC)::int AS rn
          FROM sessions
          WHERE organization_id=$1
            AND started_at IS NOT NULL
          ORDER BY started_at DESC
          LIMIT 4
        ),
        patterns AS(
          SELECT
            p.id,
            p.first_name,
            p.last_name,
            COUNT(*) FILTER(
              WHERE rs.rn BETWEEN 2 AND 4
                AND ar.present=true
            )::int AS previous_attendance,
            BOOL_OR(
              rs.rn=1 AND ar.present=true
            ) AS attended_latest
          FROM people p
          CROSS JOIN recent_sessions rs
          LEFT JOIN attendance_records ar
            ON ar.people_id=p.id
           AND ar.session_id=rs.id
           AND ar.organization_id=$1
          WHERE p.organization_id=$1
            AND p.status='active'
          GROUP BY p.id,p.first_name,p.last_name
        )
        SELECT id,first_name,last_name,
               previous_attendance
        FROM patterns
        WHERE previous_attendance>=2
          AND COALESCE(attended_latest,false)=false
        ORDER BY previous_attendance DESC
        LIMIT 5
      `,[orgId])
    ]);

    const peopleCount=people.rows[0].count;
    const sessionCount=sessions.rows[0].count;
    const activeAttendees=attendees.rows[0].count;
    const obs=observations.rows;
    const pending=actions.rows;
    const slipping=patterns.rows;

    let state='EMPTY';
    let summary='';
    let nextAction='';
    let nextActionType=null;

    if(peopleCount===0){
      state='EMPTY';
      summary='ARIA has no people to remember yet.';
      nextAction='Scan your first register to begin building your people memory.';
      nextActionType='SCAN';
    }else if(sessionCount===0){
      state='STARTING';
      summary=`ARIA remembers ${peopleCount} ${peopleCount===1?'person':'people'}.`;
      nextAction='Record your first session so ARIA can begin learning attendance patterns.';
      nextActionType='ATTENDANCE';
    }else if(pending.length){
      state='ACTION';
      const a=pending[0];
      summary=a.first_name
        ? `ARIA noticed something that may deserve attention around ${a.first_name}.`
        : 'ARIA has something that may deserve attention.';
      nextAction=a.type==='SEND_MESSAGE'
        ? `Review the suggested care action for ${a.first_name||'this person'}.`
        : 'Review ARIA’s suggested next action.';
      nextActionType='REVIEW';
    }else if(slipping.length){
      state='PATTERN';
      const p=slipping[0];
      summary=`ARIA noticed a change in ${p.first_name}'s attendance pattern.`;
      nextAction=`Review ${p.first_name}'s recent attendance before the pattern becomes a bigger concern.`;
      nextActionType='REVIEW';
    }else if(obs.length){
      state='OBSERVING';
      summary='ARIA has noticed meaningful signals and is continuing to watch them.';
      nextAction='Review the signals ARIA is currently observing.';
      nextActionType='REVIEW';
    }else{
      state='OBSERVING';
      summary=`ARIA is watching ${peopleCount} ${peopleCount===1?'person':'people'} and has not found a significant change requiring attention.`;
      nextAction='No action is required right now. Keep observing.';
      nextActionType=null;
    }

    return res.status(200).json({
      state,
      summary,
      nextAction,
      nextActionType,
      stats:{
        people:peopleCount,
        sessions30:sessionCount,
        activeAttendees30:activeAttendees
      },
      observations:obs,
      pendingActions:pending,
      patterns:slipping
    });
  }catch(err){
    console.error('[ARIA] Daily briefing error:',err);
    return res.status(500).json({error:'Unable to build ARIA Today.'});
  }
}

export default withOrg(handler);
