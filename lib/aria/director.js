// lib/aria/director.js
import pool from '../db';
import { resolveIdentities } from '../identityResolver';
import { generateDuplicatePhoneObservations } from './observers/duplicatePhoneObserver';
import { generateSimilarNameObservations } from './observers/similarNameObserver';
import { generatePhoneSimilarityObservations } from './observers/phoneSimilarityObserver';

const EVIDENCE_WEIGHTS = {
  duplicate_phone: 70,
  same_name: 40,
  similar_name: 25,
  similar_phone: 15,
  same_email: 80,
  same_member_id: 100,
};

const SCORE_CONFLICT = 70;
const SCORE_NEEDS_DECISION = 35;

export async function handleScanEvent(
  extractedPeople,
  orgId,
  scanJobId
) {
  console.log('[ARIA] Scan event received', {
    jobId: scanJobId,
    orgId,
    extractedCount: extractedPeople.length,
  });

  const decisions = await resolveIdentities(
    extractedPeople,
    orgId,
    scanJobId
  );

  console.log(
    '[ARIA] Identity decisions:',
    decisions.map((decision) => ({
      name: decision.extracted_name,
      status: decision.status,
      candidateIds: decision.candidate_ids,
      bestCandidate:
        decision.best_candidate_id,
    }))
  );

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const decision of decisions) {
      if (decision.status === 'new') {
        continue;
      }

      const livingTruth = {
        status: decision.status,
        extracted_name:
          decision.extracted_name,
        extracted_phone:
          decision.extracted_phone,
        confidence: decision.confidence,
        candidate_ids:
          decision.candidate_ids,
        best_candidate_id:
          decision.best_candidate_id,
        review_id: decision.review_id,
        updated_at:
          new Date().toISOString(),
      };

      const candidateIds =
        Array.isArray(decision.candidate_ids)
          ? decision.candidate_ids
          : [];

      if (
        decision.status === 'conflict' ||
        (
          decision.status === 'needs_decision' &&
          candidateIds.length > 1
        )
      ) {
        for (const candidateId of candidateIds) {
          await client.query(
            `UPDATE people
             SET living_truth = $1
             WHERE id = $2
               AND organization_id = $3`,
            [
              livingTruth,
              candidateId,
              orgId,
            ]
          );
        }
      } else if (
        decision.best_candidate_id
      ) {
        await client.query(
          `UPDATE people
           SET living_truth = $1
           WHERE id = $2
             AND organization_id = $3`,
          [
            livingTruth,
            decision.best_candidate_id,
            orgId,
          ]
        );
      } else if (
        candidateIds.length === 1
      ) {
        await client.query(
          `UPDATE people
           SET living_truth = $1
           WHERE id = $2
             AND organization_id = $3`,
          [
            livingTruth,
            candidateIds[0],
            orgId,
          ]
        );
      }
    }

    await client.query('COMMIT');

    console.log(
      '[ARIA] Living Truth persistence complete'
    );
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(
      '[ARIA] Director error:',
      err
    );
    throw err;
  } finally {
    client.release();
  }

  const resolvedPeople = [];
  const needsReview = [];

  for (const decision of decisions) {
    if (
      decision.status === 'alive' &&
      decision.best_candidate_id
    ) {
      resolvedPeople.push({
        name: decision.extracted_name,
        phone: decision.extracted_phone,
        resolved_person_id:
          decision.best_candidate_id,
        status: decision.status,
        confidence: decision.confidence,
      });
    }

    if (decision.status !== 'new') {
      needsReview.push({
        ...decision,
        resolved: false,
      });
    }
  }

  return {
    needsReview,
    resolvedPeople,
  };
}

export async function initializeCommunity(
  orgId
) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const canonicalRes = await client.query(
      `SELECT
         id,
         living_truth
       FROM people
       WHERE organization_id = $1
         AND status = 'active'
         AND living_truth IS NOT NULL
         AND living_truth->>'status' = 'canonical'`,
      [orgId]
    );

    for (const row of canonicalRes.rows) {
      const newTruth = {
        status: 'alive',
        confidence:
          row.living_truth?.confidence || 90,
        source: 'canonical_record',
        updated_at:
          new Date().toISOString(),
      };

      await client.query(
        `UPDATE people
         SET living_truth = $1
         WHERE id = $2
           AND organization_id = $3`,
        [
          newTruth,
          row.id,
          orgId,
        ]
      );
    }

    const nullRes = await client.query(
      `SELECT id
       FROM people
       WHERE organization_id = $1
         AND status = 'active'
         AND living_truth IS NULL`,
      [orgId]
    );

    if (nullRes.rows.length > 0) {
      const ids = nullRes.rows.map(
        (row) => row.id
      );

      const baselineTruth = JSON.stringify({
        status: 'alive',
        confidence: 90,
        source: 'canonical_record',
        updated_at:
          new Date().toISOString(),
      });

      await client.query(
        `UPDATE people
         SET living_truth = $1
         WHERE id = ANY($2)
           AND organization_id = $3`,
        [
          baselineTruth,
          ids,
          orgId,
        ]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(
      '[ARIA] initializeCommunity error:',
      err
    );
    throw err;
  } finally {
    client.release();
  }

  const duplicateObs =
    await generateDuplicatePhoneObservations(
      orgId
    );

  const similarNameObs =
    await generateSimilarNameObservations(
      orgId
    );

  const similarPhoneObs =
    await generatePhoneSimilarityObservations(
      orgId
    );

  const allObservations = [
    ...duplicateObs,
    ...similarNameObs,
    ...similarPhoneObs,
  ];

  await processPairObservations(
    orgId,
    allObservations
  );
}

async function processPairObservations(
  orgId,
  observations
) {
  if (observations.length === 0) {
    console.log(
      '[ARIA] No observations to process.'
    );
    return;
  }

  const pairMap = new Map();

  for (const observation of observations) {
    if (!observation.person_id) {
      continue;
    }

    let otherIds = [];

    if (
      observation.evidence?.matched_person_id
    ) {
      otherIds = [
        observation.evidence
          .matched_person_id,
      ];
    } else if (
      Array.isArray(
        observation.evidence?.other_person_ids
      )
    ) {
      otherIds =
        observation.evidence
          .other_person_ids;
    }

    for (const otherId of otherIds) {
      if (!otherId) {
        continue;
      }

      const a = observation.person_id;
      const b = otherId;

      const key =
        a < b
          ? `${a}:${b}`
          : `${b}:${a}`;

      if (!pairMap.has(key)) {
        pairMap.set(key, {
          person_a: a,
          person_b: b,
          observations: [],
        });
      }

      pairMap
        .get(key)
        .observations
        .push(observation);
    }
  }

  if (pairMap.size === 0) {
    console.log(
      '[ARIA] No pair evidence found.'
    );
    return;
  }

  const client = await pool.connect();
  const decisions = [];

  try {
    await client.query('BEGIN');

    for (const pair of pairMap.values()) {
      const {
        person_a,
        person_b,
        observations: pairObservations,
      } = pair;

      const peopleRes = await client.query(
        `SELECT
           id,
           living_truth
         FROM people
         WHERE id = ANY($1)
           AND organization_id = $2`,
        [
          [person_a, person_b],
          orgId,
        ]
      );

      if (peopleRes.rows.length !== 2) {
        continue;
      }

      const ltA =
        peopleRes.rows.find(
          (row) => row.id === person_a
        )?.living_truth;

      const ltB =
        peopleRes.rows.find(
          (row) => row.id === person_b
        )?.living_truth;

      if (!ltA || !ltB) {
        continue;
      }

      const isEligible = (truth) => {
        const status = truth?.status;
        const source = truth?.source;

        return (
          status === 'canonical' ||
          (
            status === 'alive' &&
            source === 'canonical_record'
          )
        );
      };

      if (
        !isEligible(ltA) ||
        !isEligible(ltB)
      ) {
        continue;
      }

      const typeSet = new Set();
      const evidenceArray = [];

      for (const observation of pairObservations) {
        evidenceArray.push(
          observation.evidence
        );

        typeSet.add(
          observation.type
        );
      }

      const uniqueTypes =
        Array.from(typeSet);

      const hasDuplicatePhone =
        typeSet.has(
          'duplicate_phone'
        );

      const hasSimilarName =
        typeSet.has(
          'similar_name'
        );

      const hasSimilarPhone =
        typeSet.has(
          'similar_phone'
        );

      if (
        hasSimilarPhone &&
        !hasDuplicatePhone &&
        !hasSimilarName
      ) {
        continue;
      }

      if (
        hasSimilarName &&
        !hasDuplicatePhone &&
        !hasSimilarPhone
      ) {
        continue;
      }

      let totalScore = 0;

      for (const type of uniqueTypes) {
        totalScore +=
          EVIDENCE_WEIGHTS[type] || 0;
      }

      if (
        hasDuplicatePhone &&
        totalScore < SCORE_CONFLICT
      ) {
        totalScore =
          SCORE_CONFLICT;
      }

      let status;

      if (
        totalScore >= SCORE_CONFLICT
      ) {
        status = 'conflict';
      } else if (
        totalScore >=
        SCORE_NEEDS_DECISION
      ) {
        status = 'needs_decision';
      } else {
        continue;
      }

      decisions.push({
        person_a,
        person_b,
        totalScore,
        reasons: uniqueTypes,
        decision: status,
      });

      const reviewDataA = {
        matched_person_id: person_b,
        evidence: evidenceArray,
        score: totalScore,
        reasons: uniqueTypes,
        decision: status,
        status: 'needs_review',
        updated_at:
          new Date().toISOString(),
      };

      const reviewDataB = {
        ...reviewDataA,
        matched_person_id: person_a,
      };

      const newTruthA = {
        status,
        confidence: totalScore,
        review: reviewDataA,
        source: 'community_observer',
        updated_at:
          new Date().toISOString(),
      };

      const newTruthB = {
        status,
        confidence: totalScore,
        review: reviewDataB,
        source: 'community_observer',
        updated_at:
          new Date().toISOString(),
      };

      await client.query(
        `UPDATE people
         SET living_truth = $1
         WHERE id = $2
           AND organization_id = $3`,
        [
          newTruthA,
          person_a,
          orgId,
        ]
      );

      await client.query(
        `UPDATE people
         SET living_truth = $1
         WHERE id = $2
           AND organization_id = $3`,
        [
          newTruthB,
          person_b,
          orgId,
        ]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(
      '[ARIA] processPairObservations error:',
      err
    );
    throw err;
  } finally {
    client.release();
  }

  if (decisions.length > 0) {
    console.log(
      `[ARIA] Total pairs flagged: ${decisions.length}`
    );
  }
    }
