// lib/aria/dailyIntelligence.js
import pool from'../db';
import{getPriorityQueue}from'./priorityQueue';

export async function getDailyIntelligence(orgId){
 if(!orgId)throw new Error('orgId required');
 const[peopleRes,sessionsRes,participationRes,memoryRes,relationshipRes,observationsRes,actionsRes,learningRes]=await Promise.all([
  pool.query(`SELECT COUNT(*)::int count FROM people WHERE organization_id=$1 AND status='active'`,[orgId]),
  pool.query(`SELECT COUNT(*)::int count FROM sessions WHERE organization_id=$1 AND started_at>=CURRENT_DATE`,[orgId]),
  pool.query(`SELECT COUNT(*)::int count FROM participation_records WHERE organization_id=$1 AND occurred_at>=CURRENT_DATE-INTERVAL'30 days'`,[orgId]),
  pool.query(`SELECT COUNT(*)::int count FROM person_memory WHERE organization_id=$1 AND active=true`,[orgId]),
  pool.query(`SELECT COUNT(*)::int count FROM relationship_scores WHERE organization_id=$1`,[orgId]),
  pool.query(`SELECT COUNT(*) FILTER(WHERE status='active' AND(expires_at IS NULL OR expires_at>NOW()))::int active,COUNT(*) FILTER(WHERE detected_at>=CURRENT_DATE)::int today FROM aria_observations WHERE organization_id=$1`,[orgId]),
  pool.query(`SELECT COUNT(*) FILTER(WHERE status IN('proposed','approved'))::int pending FROM aria_actions WHERE organization_id=$1`,[orgId]),
  pool.query(`SELECT COUNT(*)::int count FROM aria_learning WHERE organization_id=$1 AND active=true`,[orgId])
 ]);
 const people=Number(peopleRes.rows[0]?.count)||0;
 const priority=await getPriorityQueue(orgId,5);
 const observations=observationsRes.rows[0]||{};
 const actions=actionsRes.rows[0]||{};
 const summary=priority.length?`ARIA has ${priority.length} care opportunit${priority.length===1?'y':'ies'} worth reviewing.`:people?`ARIA is keeping relationship context current for your people.`:'ARIA is ready. Your organization is just getting started.';
 return{
  date:new Date().toISOString().slice(0,10),
  summary,
  facts:{
   activePeople:people,
   sessionsToday:Number(sessionsRes.rows[0]?.count)||0,
   participationLast30Days:Number(participationRes.rows[0]?.count)||0,
   rememberedPeople:Number(memoryRes.rows[0]?.count)||0,
   relationshipsReady:Number(relationshipRes.rows[0]?.count)||0,
   activeCareSignals:Number(observations.active)||0,
   careSignalsToday:Number(observations.today)||0,
   pendingActions:Number(actions.pending)||0,
   learnedSignals:Number(learningRes.rows[0]?.count)||0
  },
  patterns:priority.map(p=>({personId:p.person_id,name:[p.first_name,p.last_name].filter(Boolean).join(' '),type:p.signal_type,priorityScore:p.priority_score,reason:p.reason,confidenceType:'CARE'})),
  nextAction:priority.length?{type:'REVIEW',title:`Review ${priority[0].first_name}`,description:priority[0].reason,personId:priority[0].person_id}:{type:'NONE',title:'Nothing needs your attention',description:'ARIA is keeping the organization’s relationship context current.',personId:null}
 };
                                                                                             }
