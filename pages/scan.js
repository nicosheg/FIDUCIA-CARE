import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import { getScanState, setScanState, clearScanState } from '../lib/scanStore';

export default function ScanPage() {
  const router = useRouter();
  const fileInputRef = useRef(null);
  const [scanState, setScanStateLocal] = useState(getScanState());
  const [programName, setProgramName] = useState('GIBEON');
  const [results, setResults] = useState(null);
  const [scanningLine, setScanningLine] = useState(false);

  useEffect(() => {
    const state = getScanState();
    setScanStateLocal(state);
  }, []);

  const updateState = (newState) => {
    setScanState(newState);
    setScanStateLocal(prev => ({ ...prev, ...newState }));
  };

  // ---------- PREPROCESSING (grayscale, contrast, sharpen) ----------
  const preprocessImage = (file) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.src = objectUrl;
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);

        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;
        if (width > MAX_WIDTH) {
          height = (height * MAX_WIDTH) / width;
          width = MAX_WIDTH;
        }
        if (height > MAX_HEIGHT) {
          width = (width * MAX_HEIGHT) / height;
          height = MAX_HEIGHT;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Apply image processing
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        // 1. Grayscale + contrast boost
        for (let i = 0; i < data.length; i += 4) {
          let gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
          gray = ((gray - 128) * 1.4) + 128;
          gray = Math.min(255, Math.max(0, gray));
          data[i] = data[i + 1] = data[i + 2] = gray;
        }
        ctx.putImageData(imageData, 0, 0);

        // 2. Sharpen using convolution
        const sharpenKernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
        const sharpenedData = ctx.getImageData(0, 0, width, height);
        const outputData = new Uint8ClampedArray(sharpenedData.data);
        for (let y = 1; y < height - 1; y++) {
          for (let x = 1; x < width - 1; x++) {
            let r = 0, g = 0, b = 0;
            for (let ky = -1; ky <= 1; ky++) {
              for (let kx = -1; kx <= 1; kx++) {
                const idx = ((y + ky) * width + (x + kx)) * 4;
                const weight = sharpenKernel[(ky + 1) * 3 + (kx + 1)];
                r += sharpenedData.data[idx] * weight;
                g += sharpenedData.data[idx + 1] * weight;
                b += sharpenedData.data[idx + 2] * weight;
              }
            }
            const i = (y * width + x) * 4;
            outputData[i] = Math.min(255, Math.max(0, r));
            outputData[i + 1] = Math.min(255, Math.max(0, g));
            outputData[i + 2] = Math.min(255, Math.max(0, b));
          }
        }
        const sharpImageData = new ImageData(outputData, width, height);
        ctx.putImageData(sharpImageData, 0, 0);

        // Convert to base64 JPEG
        canvas.toBlob(
          (blob) => {
            if (!blob) { reject(new Error('Canvas toBlob failed')); return; }
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64 = reader.result.split(',')[1];
              canvas.width = 0;
              canvas.height = 0;
              resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          },
          'image/jpeg',
          0.7
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Image loading failed'));
      };
    });
  };

  // ---------- SCAN HANDLER (vision first, fallback OCR) ----------
  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = null;

    updateState({ status: 'processing', message: 'Enhancing image...' });
    setScanningLine(true);

    try {
      const base64 = await preprocessImage(file);

      // Try vision model first
      let data;
      try {
        const visionRes = await fetch('/api/ai/vision-scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_base64: base64,
            church_id: 'demo-org',
            program_name: programName.trim() || 'GIBEON',
          }),
        });
        if (visionRes.ok) {
          const visionData = await visionRes.json();
          if (visionData.status === 'ok' && visionData.people && visionData.people.length > 0) {
            data = visionData;
            console.log('Used vision model');
          }
        }
      } catch (visionErr) {
        console.log('Vision model failed, falling back to OCR+Groq');
      }

      // Fallback to OCR + correction if vision didn't work
      if (!data) {
        const ocrRes = await fetch('/api/attendance/scan-base64', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            church_id: 'demo-org',
            program_name: programName.trim() || 'GIBEON',
            image_base64: base64,
          }),
        });
        data = await ocrRes.json();
      }

      if (data && data.status === 'ok') {
        setResults(data);
        updateState({
          status: 'success',
          message: `✅ Scan complete! ${data.present_count} present (${data.new_members} new).`,
        });
        setTimeout(() => {
          clearScanState();
          router.push('/community');
        }, 2000);
      } else {
        updateState({
          status: 'error',
          message: '❌ ' + (data?.error || 'Scan failed'),
        });
      }
    } catch (err) {
      updateState({
        status: 'error',
        message: '❌ ' + err.message,
      });
    }
    setScanningLine(false);
  };

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <Layout>
      <div style={{ maxWidth: 600, margin: '40px auto', padding: '0 20px', textAlign: 'center' }}>
        <h1 style={heading}>Scan Attendance</h1>
        <p style={subheading}>{today}</p>

        {scanState.status === 'idle' && (
          <>
            <div style={{ marginBottom: 25 }}>
              <label style={{ fontWeight: 600, display: 'block', marginBottom: 8, color: '#f0f0f0' }}>
                Program / Event Name
              </label>
              <input
                type="text"
                value={programName}
                onChange={e => setProgramName(e.target.value)}
                placeholder="e.g., GIBEON"
                style={inputStyle}
              />
            </div>

            <div style={tipStyle}>
              💡 <strong>Capture tip:</strong> Make sure the full page is visible — no torn, folded, or cut‑off edges — and good lighting.
            </div>

            <label htmlFor="cameraInput" style={{ cursor: 'pointer', display: 'inline-block' }}>
              <div style={cameraBtn}>
                📷 Take Photo of Register
              </div>
            </label>
            <input
              ref={fileInputRef}
              id="cameraInput"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFile}
              style={{ display: 'none' }}
            />
          </>
        )}

        {scanState.status !== 'idle' && (
          <div style={resultCard}>
            {scanningLine && (
              <div style={scanLineContainer}>
                <div style={scanLine} />
              </div>
            )}

            <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
              {scanState.status === 'processing' ? '⏳' : ''} {scanState.message}
            </p>

            {results?.people && scanState.status === 'success' && (
              <>
                <div style={{ marginBottom: 12, color: '#34D399' }}>
                  {results.people.length} people found:
                </div>
                <div style={{ maxHeight: 200, overflowY: 'auto', fontSize: 14 }}>
                  {results.people.map((p, i) => (
                    <div key={i} style={confidenceRow}>
                      <span style={{ flex: 2 }}>{p.first_name || p.name}</span>
                      <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.1)', margin: '0 10px' }}>
                        <div style={{
                          width: `${p.confidence}%`,
                          height: '100%',
                          borderRadius: 3,
                          background: p.confidence >= 90 ? '#34D399' : p.confidence >= 80 ? '#D4AF37' : '#EF4444',
                          transition: 'width 0.3s',
                        }} />
                      </div>
                      <span style={{ flex: 0.5, textAlign: 'right', fontWeight: 600, color: p.confidence >= 90 ? '#34D399' : p.confidence >= 80 ? '#D4AF37' : '#EF4444' }}>
                        {p.confidence}%
                      </span>
                      <span style={{ flex: 1.5, textAlign: 'right', color: 'rgba(255,255,255,0.6)' }}>
                        {p.phone || (p.phone_unclear ? '⚠️' : '—')}
                      </span>
                    </div>
                  ))}
                </div>
                <button onClick={() => { clearScanState(); router.push('/community'); }} style={viewBtn}>
                  View Community →
                </button>
              </>
            )}

            {scanState.status === 'error' && (
              <button onClick={() => { clearScanState(); setResults(null); }} style={retryBtn}>
                Try Again
              </button>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}

// ---------- Styles ----------
const heading = { fontSize: 28, fontWeight: 700, color: '#f0f0f0', marginBottom: 8 };
const subheading = { color: 'rgba(255,255,255,0.6)', marginBottom: 25 };
const inputStyle = {
  padding: '12px 16px', fontSize: 16, borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.03)',
  backdropFilter: 'blur(5px)', color: '#fff', width: '100%', maxWidth: 300,
  textAlign: 'center', outline: 'none',
};
const cameraBtn = {
  background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.2)',
  color: '#D4AF37', padding: '18px 40px', borderRadius: 16, fontSize: 20,
  fontWeight: 600, backdropFilter: 'blur(10px)', transition: 'transform 0.2s',
};
const resultCard = {
  marginTop: 30, padding: 16, borderRadius: 16, backdropFilter: 'blur(10px)',
  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
  color: '#f0f0f0', textAlign: 'left',
};
const scanLineContainer = {
  height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.03)', marginBottom: 15, overflow: 'hidden',
};
const scanLine = {
  width: '30%', height: '100%', background: '#D4AF37',
  animation: 'scanMove 1.5s ease-in-out infinite', borderRadius: 2,
};
const confidenceRow = {
  display: 'flex', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
};
const viewBtn = {
  marginTop: 15, width: '100%', padding: '12px', background: '#D4AF37',
  color: '#0A0F1A', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer',
};
const retryBtn = {
  marginTop: 10, padding: '10px 20px', background: 'transparent',
  border: '1px solid rgba(239,68,68,0.3)', color: '#EF4444',
  borderRadius: 10, fontWeight: 600, cursor: 'pointer',
};
const tipStyle = {
  marginBottom: 20,
  padding: '10px 16px',
  borderRadius: 12,
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.06)',
  color: 'rgba(255,255,255,0.6)',
  fontSize: 14,
  maxWidth: 350,
  margin: '0 auto 25px',
  textAlign: 'left',
};
