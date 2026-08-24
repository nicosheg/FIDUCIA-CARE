// lib/aria/engagementClassifier.js

function normalizeThreshold(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

/**
 * Central engagement/care classification.
 *
 * Engagement state describes the person's relationship with participation.
 * Care state describes what the care system should do about inactivity.
 */
export function classifyEngagement({
  totalParticipation = 0,
  weeksSinceLast = 0,
  inactivityStreak = 0,
  settings = {},
}) {
  const riskThreshold1 = normalizeThreshold(settings.risk_threshold_1, 1);
  const riskThreshold2 = normalizeThreshold(settings.risk_threshold_2, 2);
  const riskThreshold3 = normalizeThreshold(settings.risk_threshold_3, 4);

  let engagementState;

  if (totalParticipation === 0) {
    engagementState = 'first_time';
  } else if (weeksSinceLast < 4 && totalParticipation >= 4) {
    engagementState = 'regular';
  } else if (weeksSinceLast < 4) {
    engagementState = totalParticipation === 1 ? 'first_time' : 'returning';
  } else if (weeksSinceLast < 8) {
    engagementState = 'at_risk';
  } else {
    engagementState = 'inactive';
  }

  let careState;

  if (inactivityStreak < riskThreshold1) {
    careState = 'active';
  } else if (inactivityStreak < riskThreshold2) {
    careState = 'needs_attention';
  } else if (inactivityStreak < riskThreshold3) {
    careState = 'at_risk';
  } else {
    careState = 'urgent_action_required';
  }

  const riskMap = {
    active: 'low',
    needs_attention: 'medium',
    at_risk: 'high',
    urgent_action_required: 'critical',
  };

  return {
    engagementState,
    careState,
    riskLevel: riskMap[careState] || 'low',
  };
}
