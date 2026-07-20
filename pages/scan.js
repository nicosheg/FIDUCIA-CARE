import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import { getScanState, setScanState, clearScanState } from '../lib/scanStore';

export default function ScanPage() {
  const router = useRouter();
  const fileInputRef = useRef(null);
  const [scanState, setScanStateLocal] = useState(getScanState());
  const [programName, setProgramName] = useState('GIBEON');

  useEffect(() => {
    const state = getScanState();
    setScanStateLocal(state);
  }, []);

  const updateState = (newState) => {
    setScanState(newState);
    setScanStateLocal(prev => ({ ...prev, ...newState }));
  };

  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.src = objectUrl;
      img.onload = () => {
        // Release object URL immediately
        URL.revokeObjectURL(objectUrl);

        const MAX_WIDTH = 600;       // smaller for memory‑constrained phones
        const MAX_HEIGHT = 600;
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

        // Convert to blob with reduced quality
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Canvas toBlob failed'));
              return;
            }
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64 = reader.result.split(',')[1];
              // Clear canvas memory
              canvas.width = 0;
              canvas.height = 0;
              resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          },
          'image/jpeg',
          0.5           // lower quality = smaller base64
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

    // Release the file input reference to free memory
    e.target.value = null;

    updateState({ status: 'processing', message: 'Optimizing image...' });

    try {
      const base64 = await fileToBase64(file);
      updateState({ message: 'Scanning names...' });

      const res = await fetch('/api/attendance/scan-base64', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          church_id: 'demo-church',
          program_name: programName.trim() || 'GIBEON',
          image_base64: base64,
        }),
      });

      const data = await res.json();

      if (data.status === 'ok') {
        updateState({
          status: 'success',
          message: `✅ Scan complete! ${data.present_count} present (${data.new_members} new members added).`,
        });
        setTimeout(() => {
          clearScanState();
          router.push('/');
        }, 3000);
      } else {
        updateState({
          status: 'error',
          message: '❌ Error: ' + (data.error || 'Unknown'),
        });
      }
    } catch (err) {
      updateState({
        status: 'error',
        message: '❌ ' + (err.message || 'Something went wrong'),
      });
    }
  };

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <Layout>
      <div style={{ maxWidth: 500, margin: '40px auto', padding: '0 20px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>Scan Attendance</h1>
        <p style={{ color: '#555', marginBottom: 25 }}>{today}</p>

        {scanState.status === 'idle' && (
          <>
            <div style={{ marginBottom: 25 }}>
              <label style={{ fontWeight: 600, display: 'block', marginBottom: 8 }}>Program / Event Name</label>
              <input
                type="text"
                value={programName}
                onChange={e => setProgramName(e.target.value)}
                placeholder="e.g., GIBEON"
                style={{
                  padding: '12px 16px',
                  fontSize: 16,
                  borderRadius: 12,
                  border: '1px solid #ddd',
                  width: '100%',
                  maxWidth: 280,
                  textAlign: 'center',
                  backdropFilter: 'blur(5px)',
                  background: 'rgba(255,255,255,0.7)',
                  outline: 'none',
                }}
              />
            </div>

            <label htmlFor="cameraInput" style={{ cursor: 'pointer', display: 'inline-block' }}>
              <div
                style={{
                  background: 'linear-gradient(135deg, #4F46E5, #7C3AED)',
                  color: 'white',
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
          <div
            style={{
              marginTop: 30,
              padding: 12,
              background: 'rgba(255,255,255,0.8)',
              borderRadius: 12,
              backdropFilter: 'blur(5px)',
            }}
          >
            {scanState.status === 'processing' && (
              <p style={{ fontSize: 18 }}>⏳ {scanState.message}</p>
            )}
            {(scanState.status === 'success' || scanState.status === 'error') && (
              <p style={{ fontSize: 18 }}>{scanState.message}</p>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
            }
