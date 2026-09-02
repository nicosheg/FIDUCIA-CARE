// lib/aria/engagementIntelligence.js
import pool from '../db';
import { getOrgSettings } from './organizationSettings';
import { classifyEngagement } from './engagementClassifier';

const DAY=86400000;

function clamp(n,min,max){return Math.max(min,Math.min(max,n));}

function calculateTrend(dates,now){
  if(dates.length<2)return 0;
  const cutoff=new Date(now.getTime()-28*DAY);
  const previous=new Date(now.getTime()-56*DAY);
  const recent=dates.filter(d=>d>=cutoff).length;
  const prior=dates.filter(d=>d>=previous&&d<cutoff).length;
  if(prior===0)return recent>0?1:0;
  return clamp((recent-prior)/prior,-1,1);
}

function calculateFrequency(dates){
  if(dates.length<2)return dates.length?1:0;
  const first=dates[0].getTime();
  const last=dates[dates.length-1].getTime();
  const weeks=Math.max(1,(last-first)/DAY/7);
  return dates.length/weeks;
}

function calculateMetrics(dates,now){
  if(!dates.length){
    return {
      participationCount:0,
      participationRate:0,
      participationStreak:0,
      inactivityStreak:0,
      baselineFrequency:0,
      recentFrequency:0,
      trend:0,
      deviation:0,
      firstSeen:null,
      lastSeen:null,
      confidence:0,
      evidence:{reason:'no_participation_data'}
    };
  }

  const firstSeen=dates[0];
  const lastSeen=dates[dates.length-1];
  const daysSinceLast=Math.max(0,(now-lastSeen)/DAY);
  const inactivityStreak=Math.floor(daysSinceLast/7);
  const baselineDates=dates.filter(d=>d>=new Date(now.getTime()-84*DAY));
  const recentDates=dates.filter(d=>d>=new Date(now.getTime()-28*DAY));
  const baselineFrequency=calculateFrequency(baselineDates);
  const recentFrequency=calculateFrequency(recentDates);
  const trend=calculateTrend(dates,now);
  const expected=Math.max(1,baselineFrequency);
  const deviation=clamp((recentFrequency-expected)/expected,-1,1);
  const elapsedWeeks=Math.max(1,(now-firstSeen)/DAY/7);
  const participationRate=clamp(Math.round((dates.length/(elapsedWeeks+1))*100),0,100);
  const participationStreak=inactivityStreak===0?1:0;
  const confidence=clamp(Math.min(1,dates.length/8),0,1);

  return {
    participationCount:dates.length,
    participationRate,
    participationStreak,
    inactivityStreak,
    baselineFrequency,
    recentFrequency,
    trend,
    deviation,
    firstSeen,
    lastSeen,
    confidence,
    evidence:{
      sample_size:dates.length,
      baseline_days:84,
      recent_days:28,
      days_since_last:Math.floor(daysSinceLast),
      baseline_frequency:baselineFrequency,
      recent_frequency:recentFrequency,
      trend,
      deviation
    }
  };
}

export async function updateEngagementMetricsForPerson(personId,orgId){
  if(!personId||!orgId)throw new Error('personId and orgId are required');

  const [partRes,settings]=await Promise.all([
    pool.query(`
      select occurred_at
      from participation_records
      where person_id=$1
        and organization_id=$2
        and occurred_at is not null
      order by occurred_at asc
    `,[personId,orgId]),
    getOrgSettings(orgId)
  ]);

  const now=new Date();
  const dates=partRes.rows
    .map(r=>new Date(r.occurred_at))
    .filter(d=>!Number.isNaN(d.getTime()));

  const metrics=calculateMetrics(dates,now);

  const classification=classifyEngagement({
    totalParticipation:metrics.participationCount,
    weeksSinceLast:metrics.inactivityStreak,
    inactivityStreak:metrics.inactivityStreak,
    settings
  });

  await pool.query(`
    insert into engagement_metrics(
      organization_id,
      person_id,
      participation_count,
      participation_rate,
      participation_streak,
      inactivity_streak,
      baseline_frequency,
      recent_frequency,
      trend,
      deviation,
      first_seen,
      last_seen,
      confidence,
      evidence,
      calculated_at,
      updated_at
    )
    values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now(),now())
    on conflict(organization_id,person_id)
    do update set
      participation_count=excluded.participation_count,
      participation_rate=excluded.participation_rate,
      participation_streak=excluded.participation_streak,
      inactivity_streak=excluded.inactivity_streak,
      baseline_frequency=excluded.baseline_frequency,
      recent_frequency=excluded.recent_frequency,
      trend=excluded.trend,
      deviation=excluded.deviation,
      first_seen=excluded.first_seen,
      last_seen=excluded.last_seen,
      confidence=excluded.confidence,
      evidence=excluded.evidence,
      calculated_at=now(),
      updated_at=now()
  `,[
    orgId,
    personId,
    metrics.participationCount,
    metrics.participationRate,
    metrics.participationStreak,
    metrics.inactivityStreak,
    metrics.baselineFrequency,
    metrics.recentFrequency,
    metrics.trend,
    metrics.deviation,
    metrics.firstSeen,
    metrics.lastSeen,
    metrics.confidence,
    JSON.stringify(metrics.evidence)
  ]);

  return {
    ...metrics,
    engagementStatus:classification.engagementState,
    careState:classification.careState,
    riskLevel:classification.riskLevel,
    personId,
    organizationId:orgId
  };
}

export async function updateEngagementMetrics(orgId,options={}){
  if(!orgId)throw new Error('orgId is required');

  const chunkSize=Math.max(1,Math.min(Number(options.chunkSize)||500,2000));
  let lastId=null;
  let processed=0;

  while(true){
    const result=await pool.query(`
      select id
      from people
      where organization_id=$1
        and status='active'
        and ($2::uuid is null or id>$2::uuid)
      order by id
      limit $3
    `,[orgId,lastId,chunkSize]);

    if(!result.rows.length)break;

    for(const person of result.rows){
      await updateEngagementMetricsForPerson(person.id,orgId);
      processed++;
    }

    lastId=result.rows[result.rows.length-1].id;
  }

  return processed;
      }
