// lib/aria/engagementIntelligence.js
import pool from '../db';
import { getOrgSettings } from './organizationSettings';
import { classifyEngagement } from './engagementClassifier';

const DAY=86400000;

function clamp(n,min,max){return Math.max(min,Math.min(max,n));}

function weeklyBuckets(dates,now){
  const buckets=new Set();
  for(const d of dates){
    const age=Math.floor((now-d)/DAY);
    if(age<0)continue;
    buckets.add(Math.floor(age/7));
  }
  return buckets;
}

function streakFromBuckets(buckets){
  let streak=0;
  while(buckets.has(streak)){
    streak++;
  }
  return streak;
}

function calculateMetrics(dates,now){
  if(!dates.length){
    return{
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
      lastMeaningfulEvent:null,
      confidence:0,
      engagementStatus:'first_time',
      evidence:{reason:'no_participation_data',sample_size:0}
    };
  }

  const firstSeen=dates[0];
  const lastSeen=dates[dates.length-1];

  const daysSinceLast=Math.max(0,(now-lastSeen)/DAY);
  const inactivityStreak=Math.floor(daysSinceLast/7);

  const recent28=dates.filter(d=>
    d>=new Date(now.getTime()-28*DAY)
  );

  const baseline84=dates.filter(d=>
    d>=new Date(now.getTime()-84*DAY)
  );

  const prior28=dates.filter(d=>
    d>=new Date(now.getTime()-56*DAY)&&
    d<new Date(now.getTime()-28*DAY)
  );

  const recentFrequency=recent28.length/4;
  const baselineFrequency=baseline84.length/12;
  const priorFrequency=prior28.length/4;

  const trend=priorFrequency===0
    ? recentFrequency>0?1:0
    : clamp((recentFrequency-priorFrequency)/priorFrequency,-1,1);

  const expected=Math.max(0.25,baselineFrequency);
  const deviation=clamp(
    (recentFrequency-expected)/expected,
    -1,
    1
  );

  const buckets=weeklyBuckets(dates,now);
  const participationStreak=streakFromBuckets(buckets);

  const observedWeeks=Math.min(
    12,
    Math.max(
      1,
      Math.ceil((now-firstSeen)/DAY/7)
    )
  );

  const participationRate=clamp(
    Math.round(
      (new Set(
        dates
          .filter(d=>
            d>=new Date(now.getTime()-84*DAY)
          )
          .map(d=>Math.floor((now-d)/DAY/7))
      ).size/observedWeeks)*100
    ),
    0,
    100
  );

  const confidence=clamp(
    dates.length/8,
    0,
    1
  );

  return{
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
    lastMeaningfulEvent:lastSeen,
    confidence,
    engagementStatus:null,
    evidence:{
      sample_size:dates.length,
      baseline_days:84,
      recent_days:28,
      days_since_last:Math.floor(daysSinceLast),
      baseline_frequency:baselineFrequency,
      recent_frequency:recentFrequency,
      prior_frequency:priorFrequency,
      trend,
      deviation,
      participation_streak:participationStreak,
      inactivity_streak:inactivityStreak
    }
  };
}

async function saveMetrics(orgId,personId,metrics,classification){
  await pool.query(`
    INSERT INTO engagement_metrics(
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
      last_meaningful_event,
      confidence,
      evidence,
      calculated_at,
      updated_at
    )
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW(),NOW())
    ON CONFLICT(organization_id,person_id)
    DO UPDATE SET
      participation_count=EXCLUDED.participation_count,
      participation_rate=EXCLUDED.participation_rate,
      participation_streak=EXCLUDED.participation_streak,
      inactivity_streak=EXCLUDED.inactivity_streak,
      baseline_frequency=EXCLUDED.baseline_frequency,
      recent_frequency=EXCLUDED.recent_frequency,
      trend=EXCLUDED.trend,
      deviation=EXCLUDED.deviation,
      first_seen=EXCLUDED.first_seen,
      last_seen=EXCLUDED.last_seen,
      last_meaningful_event=EXCLUDED.last_meaningful_event,
      confidence=EXCLUDED.confidence,
      evidence=EXCLUDED.evidence,
      calculated_at=NOW(),
      updated_at=NOW()
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
    metrics.lastMeaningfulEvent,
    metrics.confidence,
    JSON.stringify({
      ...metrics.evidence,
      classification
    })
  ]);
}

export async function updateEngagementMetricsForPerson(personId,orgId){
  if(!personId||!orgId)throw new Error('personId and orgId are required');

  const [partRes,settings]=await Promise.all([
    pool.query(`
      SELECT occurred_at
      FROM participation_records
      WHERE organization_id=$1
        AND person_id=$2
        AND occurred_at IS NOT NULL
      ORDER BY occurred_at ASC
    `,[orgId,personId]),
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

  metrics.engagementStatus=classification.engagementState;

  await saveMetrics(
    orgId,
    personId,
    metrics,
    classification
  );

  return{
    ...metrics,
    ...classification,
    personId,
    organizationId:orgId
  };
}

export async function updateEngagementMetrics(orgId,options={}){
  if(!orgId)throw new Error('orgId is required');

  const chunkSize=Math.max(
    1,
    Math.min(
      Number(options.chunkSize)||500,
      2000
    )
  );

  let lastId=null;
  let processed=0;

  while(true){
    const result=await pool.query(`
      SELECT id
      FROM people
      WHERE organization_id=$1
        AND status='active'
        AND ($2::uuid IS NULL OR id>$2::uuid)
      ORDER BY id
      LIMIT $3
    `,[orgId,lastId,chunkSize]);

    if(!result.rows.length)break;

    await Promise.all(
      result.rows.map(async person=>{
        await updateEngagementMetricsForPerson(
          person.id,
          orgId
        );
        processed++;
      })
    );

    lastId=result.rows[result.rows.length-1].id;
  }

  return processed;
}
