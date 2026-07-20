let currentScan = {
  status: 'idle',   // 'idle' | 'processing' | 'success' | 'error'
  message: '',
};

export function getScanState() {
  return { ...currentScan };
}

export function setScanState(newState) {
  currentScan = { ...currentScan, ...newState };
}

export function clearScanState() {
  currentScan = { status: 'idle', message: '' };
}
