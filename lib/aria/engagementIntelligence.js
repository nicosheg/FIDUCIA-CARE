// lib/aria/engagementIntelligence.js
import pool from'../db';

const DAY=86400000;
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));

function calculate(dates,now){
 if(!dates.length)return{participationCount:0,participationRate:0,participationStreak:0,inactivityStreak:0,baselineFrequency:0,recentFrequency:0,trend:0,deviation:0,firstSeen:null,lastSeen:null,lastMeaningfulEvent:null,confidence:0,engagementStatus:'first_time',evidence:{sample_size:0}};
 const firstSeen=dates[0],lastSeen=dates[dates.length-1];
 const daysSinceLast=Math.max(0,(now-lastSeen)/DAY);
 const inactivityStreak=Math.floor(daysSinceLast/7);
 const recent=dates.filter(d=>d>=new Date(now.getTime()-28*DAY));
 const prior=dates.filter(d=>d>=new Date(now.getTime()-56*DAY)&&d<new Date(now.getTime()-28*DAY));
 const baseline=dates.filter(d=>d>=new Date(now.getTime()-84*DAY));
 const recentFrequency=recent.length/4,baselineFrequency=baseline.length/12,priorFrequency=prior.length/4;
 const trend=priorFrequency===0?(recentFrequency?1:0):clamp((recentFrequency-priorFrequency)/priorFrequency,-1,1);
 const expected=Math.max(.25,baselineFrequency);
 const deviation=clamp((recentFrequency-expected)/expected,-1,1);
 const weeks=new Set(baseline.map(d=>Math.floor((now-d)/DAY/7))).size;
 const participationStreak=(()=>{const s=new Set(dates.map(d=>Math.floor((now-d)/DAY/7)));let n=0;while(s.has(n))n++;return n})();
 const participationRate=clamp(Math.round((weeks/Math.min(12,Math.max(1,Math.ceil((now-firstSeen)/DAY/7))))*100),0,100);
 return{participationCount:dates.length,participationRate,participationStreak,inactivityStreak,baselineFrequency,recentFrequency,trend,deviation,firstSeen,lastSeen,lastMeaningfulEvent:lastSeen,confidence:clamp(dates.length/8,0,1),engagementStatus:null,evidence:{sample_size:dates.length,baseline_days:84,recent_days:28,days_since_last:Math.floor(daysSinceLast),baseline_frequency:baselineFrequency,recent_frequency:recentFrequency,prior_frequency:priorFrequency,trend,deviation,participation_streak:participationStreak,inactivity_streak:inactivityStreak}};
}

export async function updateEngagementMetricsForPerson(personId,orgId){
 if(!personId||!orgId)throw new Error('personId and orgId are required');
 const r=await pool.query(`SELECT occurred_at FROM participation_records WHERE organization_id=$1 AND person_id=$2 AND occurred_at IS NOT NULL ORDER BY occurred_at ASC`,[orgId,personId]);
 const dates=r.rows.map(x=>new Date(x.occurred_at)).filter(x=>!Number.isNaN(x.getTime()));
 const m=calculate(dates,new Date());
 m.engagementStatus=m.participationCount===0?'first_time':m.inactivityStreak===0?(m.participationCount===1?'returning':'regular'):m.inactivityStreak<4?'less_recent':'quiet';
 await pool.query(`INSERT INTO engagement_metrics(organization_id,person_id,participation_count,participation_rate,participation_streak,inactivity_streak,baseline_frequency,recent_frequency,trend,deviation,first_seen,last_seen,last_meaningful_event,confidence,evidence,calculated_at,updated_at)VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW(),NOW()) ON CONFLICT(organization_id,person_id) DO UPDATE SET participation_count=EXCLUDED.participation_count,participation_rate=EXCLUDED.participation_rate,participation_streak=EXCLUDED.participation_streak,inactivity_streak=EXCLUDED.inactivity_streak,baseline_frequency=EXCLUDED.baseline_frequency,recent_frequency=EXCLUDED.recent_frequency,trend=EXCLUDED.trend,deviation=EXCLUDED.deviation,first_seen=EXCLUDED.first_seen,last_seen=EXCLUDED.last_seen,last_meaningful_event=EXCLUDED.last_meaningful_event,confidence=EXCLUDED.confidence,evidence=EXCLUDED.evidence,calculated_at=NOW(),updated_at=NOW()`,[orgId,personId,m.participationCount,m.participationRate,m.participationStreak,m.inactivityStreak,m.baselineFrequency,m.recentFrequency,m.trend,m.deviation,m.firstSeen,m.lastSeen,m.lastMeaningfulEvent,m.confidence,JSON.stringify(m.evidence)]);
 return{...m,personId,organizationId:orgId};
}

export async function updateEngagementMetrics(orgId,options={}){
 if(!orgId)throw new Error('orgId required');
 const limit=Math.max(1,Math.min(Number(options.chunkSize)||500,2000));
 const people=await pool.query(`SELECT id FROM people WHERE organization_id=$1 AND status='active' ORDER BY id LIMIT $2`,[orgId,limit]);
 await Promise.all(people.rows.map(p=>updateEngagementMetricsForPerson(p.id,orgId)));
 return people.rows.length;
                                }
