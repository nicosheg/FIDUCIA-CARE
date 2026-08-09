// lib/scanResult.js – Defines the canonical scan output

export function buildScanResult({
  scanId,
  orgId,
  extractedPeople = [],
  matchedPeople = [],
  newPeople = [],
  needsReview = [],
  attendanceChanges = [],
  warnings = [],
  providerUsed = 'unknown',
  durationMs = 0,
  attemptCount = 0,
  status = 'completed',
  error = null,
}) {
  const totalExtracted = extractedPeople.length;
  const totalMatched = matchedPeople.length;
  const totalNew = newPeople.length;
  const totalReview = needsReview.length;
  const totalAttended = attendanceChanges.filter(c => c.present).length;

  // Generate a human summary
  let summary = '';
  if (status === 'completed') {
    summary = `ARIA processed ${totalExtracted} people. `;
    if (totalMatched > 0) summary += `${totalMatched} already known. `;
    if (totalNew > 0) summary += `${totalNew} new people remembered. `;
    if (totalReview > 0) summary += `${totalReview} need your attention.`;
  } else if (status === 'failed') {
    summary = error || 'ARIA could not complete this scan.';
  } else {
    summary = 'ARIA is still working on this scan.';
  }

  return {
    scanId,
    orgId,
    status,
    providerUsed,
    durationMs,
    attemptCount,
    extractedPeople,
    matchedPeople,
    newPeople,
    needsReview,
    attendanceChanges,
    warnings,
    error,
    summary,
    stats: {
      totalExtracted,
      totalMatched,
      totalNew,
      totalReview,
      totalAttended,
    },
  };
    }
