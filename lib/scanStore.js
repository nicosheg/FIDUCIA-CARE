let scanState = {
  stage: 'idle',       // idle | enhancing | scanning | revealing | complete | error
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
  // Never clear while a scan is in progress
  if (scanState.stage === 'scanning' || scanState.stage === 'enhancing' || scanState.stage === 'revealing') {
    return;
  }
  scanState = {
    stage: 'idle',
    scanningLine: false,
    results: null,
    revealedPeople: [],
    ariaMessages: [],
    summary: null,
    message: '',
  };
}
