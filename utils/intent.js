export function detectIntent(speechText, digits) {
  if (digits === '1') return 'prayer_request';
  if (digits === '2') return 'visit_request';
  if (!speechText) return 'no_response';

  const lower = speechText.toLowerCase();
  if (lower.includes('sick') || lower.includes('ill') || lower.includes('hospital')) return 'sick';
  if (lower.includes('moved') || lower.includes('relocat') || lower.includes('new place')) return 'relocated';
  if (lower.includes('no longer') || lower.includes('stop') || lower.includes('leave church')) return 'no_longer_attending';
  if (lower.includes('pray') || lower.includes('prayer')) return 'prayer_request';
  if (lower.includes('visit') || lower.includes('come')) return 'visit_request';
  return 'other';
}
