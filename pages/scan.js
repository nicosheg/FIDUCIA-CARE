import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import { getScanState, setScanState, clearScanState } from '../lib/scanStore';

export default function ScanPage() {
  const router = useRouter();
  const fileInputRef = useRef(null);
  const [scanState, setScanStateLocal] = useState(getScanState());
  const [programName, setProgramName] = useState('GIBEON');
  const [results, setResults] = useState(null); // holds { people, present_count, new_members }

  // Restore scan state on mount
  useEffect(() => {
    const state = getScanState();
    setScanStateLocal(state);
  }, []);

  const updateState = (newState) => {
    setScanState(newState);
    setScanStateLocal(prev => ({ ...prev, ...newState }));
  };

  // Resize and convert to base64
  const fileToBase64 = (file) => {
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

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Canvas toBlob failed'));
              return;
            }
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

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = null;

    updateState({ status: 'processing', message: 'Preparing image...' });
    setResults(null);

    try {
      const base64 = await fileToBase64(file);
      updateState({ message: 'Scanning and analysing...' });

      const res = await fetch('/api/attendance/scan-base64', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          church_id: 'demo-org',
          program_name: programName.trim() || 'GIBEON',
          image_base64: base64,
        }),
      });

      const data = await res.json();

      if (data.status === 'ok') {
        setResults(data);
        updateState({
          status: 'success',
          message: `✅ Scan complete! ${data.present_count} present, ${data.new_members} new.`,
        });
      } else {
        updateState({
          status: 'error',
          message: '❌ ' + (data.error || 'Scan failed'),
        });
      }
    } catch (err) {
      updateState({
        status: 'error',
        message: '❌ Network error: ' + err.message,
      });
    }
  };

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <Layout>
      <div style={{ maxWidth: 600, margin: '40px auto', padding: '0 20px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f0f0f0', marginBottom: 8 }}>
          Scan Attendance
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: 25 }}>{today}</p>

        {/* Program Name Input */}
        <div style={{ marginBottom: 25 }}>
          <label
            style={{
              fontWeight: 600,
              display: 'block',
              marginBottom: 8,
              color: 'rgba(255,255,255,0.8)',
            }}
          >
            Program / Event Name
          </label>
          <input
            type="text"
            value={programName}
            onChange={(e) => setProgramName(e.target.value)}
            placeholder="e.g., GIBEON"
            style={{
              padding: '12px 16px',
              fontSize: 16,
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.05)',
              backdropFilter: 'blur(5px)',
              color: '#fff',
              width: '100%',
              maxWidth: 300,
              textAlign: 'center',
              outline: 'none',
            }}
          />
        </div>

        {/* Camera Button */}
        {scanState.status === 'idle' && (
          <label htmlFor="cameraInput" style={{ cursor: 'pointer', display: 'inline-block' }}>
            <div
              style={{
                background: 'linear-gradient(135deg, #4F46E5, #7C3AED)',
                color: '#fff',
                padding: '18px 40px',
                borderRadius: 16,
                fontSize: 20,
                fontWeight: 600,
                boxShadow: '0 8px 24px rgba(79,70,229,0.3)',
                transition: 'transform 0.2s',
              }}
            >
              📷 Take Photo of Register
            </div>
            <input
              ref={fileInputRef}
              id="cameraInput"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFile}
              style={{ display: 'none' }}
            />
          </label>
        )}

        {/* Processing / Result overlay */}
        {scanState.status !== 'idle' && (
          <div
            style={{
              marginTop: 30,
              padding: 16,
              borderRadius: 16,
              backdropFilter: 'blur(10px)',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#f0f0f0',
              textAlign: 'left',
            }}
          >
            {/* Status message */}
            <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
              {scanState.status === 'processing' ? '⏳' : ''} {scanState.message}
            </p>

            {/* Show people list if successful */}
            {scanState.status === 'success' && results?.people && (
              <>
                <div style={{ marginBottom: 12, color: '#34D399' }}>
                  {results.people.length} people found:
                </div>
                <div style={{ maxHeight: 200, overflowY: 'auto', fontSize: 14 }}>
                  {results.people.map((p, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '6px 0',
                        borderBottom: '1px solid rgba(255,255,255,0.08)',
                      }}
                    >
                      <span style={{ flex: 2 }}>{p.first_name}</span>
                      <span
                        style={{
                          flex: 1,
                          textAlign: 'center',
                          fontWeight: 600,
                          color:
                            p.confidence >= 90
                              ? '#34D399'
                              : p.confidence >= 80
                              ? '#F59E0B'
                              : '#EF4444',
                        }}
                      >
                        {p.confidence}%
                      </span>
                      <span style={{ flex: 1.5, textAlign: 'right', color: 'rgba(255,255,255,0.6)' }}>
                        {p.phone || '—'}
                      </span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => {
                    clearScanState();
                    router.push('/members');
                  }}
                  style={{
                    marginTop: 15,
                    width: '100%',
                    padding: '12px',
                    background: '#34D399',
                    color: '#000',
                    border: 'none',
                    borderRadius: 10,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  View Members →
                </button>
              </>
            )}

            {/* Error state – option to retry */}
            {scanState.status === 'error' && (
              <button
                onClick={() => {
                  clearScanState();
                  setResults(null);
                }}
                style={{
                  marginTop: 10,
                  padding: '10px 20px',
                  background: '#EF4444',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Try Again
              </button>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
    }
