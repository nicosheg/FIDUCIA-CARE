let scanState = {
  stage: 'idle',       // idle | processing | complete | error
  jobId: null,
  scanningLine: false,
  results: null,
  revealedPeople: [],
  ariaMessages: [],
  summary: null,
  message: '',
};

export function getScanState() {
  return { ...scanState };
}

export function setScanState(newState) {
  scanState = { ...scanState, ...newState };
}

export function clearScanState() {
  // Don't clear if a job is still processing
  if (scanState.stage === 'processing') return;
  scanState = {
    stage: 'idle',
    jobId: null,
    scanningLine: false,
    results: null,
    revealedPeople: [],
    ariaMessages: [],
    summary: null,
    message: '',
  };
}
