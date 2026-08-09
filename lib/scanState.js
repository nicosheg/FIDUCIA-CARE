// lib/scanState.js – Canonical states and ARIA-friendly messages

export const INTERNAL_STATES = {
  QUEUED: 'queued',
  ANALYSING: 'analysing',
  EXTRACTING: 'extracting',
  VALIDATING: 'validating',
  MATCHING: 'matching',
  SAVING: 'saving',
  COMPLETED: 'completed',
  RETRYING: 'retrying',
  FAILED: 'failed',
  TIMED_OUT: 'timed_out',
  CANCELLED: 'cancelled',
};

export const PROGRESS_STAGES = {
  enhancing: 'enhancing',
  reading_handwriting: 'reading_handwriting',
  validating: 'validating',
  matching_community: 'matching_community',
  building_memory: 'building_memory',
  complete: 'complete',
};

// Maps internal states to ARIA‑friendly messages
export function ariaMessageForState(state, progress, elapsedSeconds) {
  const base = {
    queued: 'ARIA is preparing to read the register…',
    analysing: 'ARIA is looking at the register…',
    extracting: 'ARIA is separating names from phone numbers…',
    validating: 'ARIA is checking every entry carefully…',
    matching: 'ARIA is matching people with your community…',
    saving: 'ARIA is remembering the changes…',
    completed: 'ARIA has finished!',
    retrying: 'ARIA is taking a little longer than usual…',
    failed: 'ARIA could not complete this scan safely.',
    timed_out: 'ARIA took too long and has stopped. You can try again.',
    cancelled: 'Scan was cancelled.',
  };

  let msg = base[state] || 'ARIA is working…';

  // Add elapsed time if > 5 seconds
  if (elapsedSeconds > 5 && state !== 'completed' && state !== 'failed') {
    msg += ` (${Math.round(elapsedSeconds)}s)`;
    if (elapsedSeconds > 20) {
      msg = 'This is taking a little longer than usual. ' + msg;
    }
    if (elapsedSeconds > 45) {
      msg = 'ARIA is taking extra care with this register. ' + msg;
    }
  }

  // If progress stage is known, add detail
  if (progress === 'enhancing') msg = 'ARIA is enhancing the image clarity…';
  if (progress === 'reading_handwriting') msg = 'ARIA is reading the handwriting…';
  if (progress === 'validating') msg = 'ARIA is validating the extracted data…';
  if (progress === 'matching_community') msg = 'ARIA is comparing with your community…';
  if (progress === 'building_memory') msg = 'ARIA is saving the verified records…';

  return msg;
}

// Map internal state to database status string (for backward compatibility)
export function dbStatusFromInternal(state) {
  const map = {
    queued: 'pending',
    analysing: 'processing',
    extracting: 'processing',
    validating: 'processing',
    matching: 'processing',
    saving: 'processing',
    completed: 'complete',
    retrying: 'retrying',
    failed: 'failed',
    timed_out: 'failed',
    cancelled: 'failed',
  };
  return map[state] || 'processing';
  }
