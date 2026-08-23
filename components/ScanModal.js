// components/ScanModal.js
import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { getScanState, setScanState, clearScanState } from '../lib/scanStore';

export default function ScanModal({ isOpen, onClose }) {
  const router = useRouter();
  const fileInputRef = useRef(null);
  const [programName, setProgramName] = useState('GIBEON');
  const [scanState, setScanStateLocal] = useState(getScanState());
  const [progressMessage, setProgressMessage] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [completionTimestamp, setCompletionTimestamp] = useState(null);
  const [celebration, setCelebration] = useState(false);
  const pollRef = useRef(null);
  const timerRef = useRef(null);

  const syncState = useCallback(() => {
    setScanStateLocal(getScanState());
  }, []);

  useEffect(() => {
    const current = getScanState();
    syncState();
    if (current.stage === 'processing' && current.jobId) {
      startPolling(current.jobId);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      // Clean up scan state on close handled by handleClose
    };
  }, []);

  const updateState = (newState) => {
    setScanState(newState);
    syncState();
  };

  // ── Updated preprocessImage: 1600px, high quality, error handling ──
  const preprocessImage = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const MAX_SIZE = 1600;
          let width = img.width;
          let height = img.height;
          if (width > height && width > MAX_SIZE) {
            height = Math.round((height / width) * MAX_SIZE);
            width = MAX_SIZE;
          } else if (height > MAX_SIZE) {
            width = Math.round((width / height) * MAX_SIZE);
            height = MAX_SIZE;
          }
          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
          if (!dataUrl) {
            reject(new Error('Failed to convert image to base64'));
            return;
          }
          const base64 = dataUrl.split(',')[1];
          if (!base64 || base64.length < 100) {
            reject(new Error('Image encoding produced empty data'));
            return;
          }
          resolve(base64);
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = event.target.result;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  const startPolling = (jobId) => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    let seconds = 0;
    setElapsedSeconds(0);
    timerRef.current = setInterval(() => {
      seconds++;
      setElapsedSeconds(seconds);
    }, 1000);

    pollRef.current = setInterval(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      try {
        const res = await fetch(`/api/scan/status?job_id=${jobId}`, {
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        });
        if (!res.ok) {
          console.error('Polling error:', await res.text());
          return;
        }
        const data = await res.json();
        if (data.status === 'processing') {
          setProgressMessage(data.message || 'ARIA is processing…');
          if (data.progress) {
            const msgs = {
              enhancing: 'ARIA is enhancing the image clarity…',
              reading_handwriting: 'ARIA is reading the handwriting…',
              validating: 'ARIA is validating the extracted data…',
              matching_community: 'ARIA is comparing with your community…',
              building_memory: 'ARIA is saving the verified records…',
            };
            setProgressMessage(msgs[data.progress] || 'ARIA is working…');
          }
        } else if (data.status === 'complete') {
          if (pollRef.current) clearInterval(pollRef.current);
          if (timerRef.current) clearInterval(timerRef.current);
          const result = data.result;
          if (result && result.summary) {
            const summary = {
              total: result.present_count || 0,
              newVisitors: result.new_members || 0,
              returning: result.updated || 0,
              duplicates: result.duplicates?.length || 0,
              needsReview: result.needs_review?.length || 0,
            };
            setCompletionTimestamp(new Date().toLocaleString());
            updateState({
              stage: 'complete',
              summary,
            });
            setCelebration(true);
            setTimeout(() => setCelebration(false), 600);
          } else {
            updateState({ stage: 'complete', summary: { total: 0 } });
          }
        } else if (data.status === 'failed') {
          if (pollRef.current) clearInterval(pollRef.current);
          if (timerRef.current) clearInterval(timerRef.current);
          updateState({ stage: 'error', message: data.message || 'Scan failed' });
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 1500);
  };

  const revealResults = async (resultData) => {
    // Not used in this version – kept for compatibility
  };

  // ── Updated handleFile with error handling and base64 check ──
  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = null;

    updateState({ stage: 'processing', scanningLine: true });
    setProgressMessage('ARIA is preparing the image…');

    let base64;
    try {
      base64 = await preprocessImage(file);
      // Final boundary check
      if (!base64 || base64.length < 100) {
        throw new Error('Image could not be prepared for scanning.');
      }
    } catch (err) {
      console.error('Image preprocessing error:', err);
      updateState({ stage: 'error', message: err.message || 'Failed to process image' });
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      updateState({ stage: 'error', message: 'You must be logged in to scan.' });
      return;
    }

    try {
      const res = await fetch('/api/scan/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          image_base64: base64,
          program_name: programName.trim() || 'GIBEON',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to start scan');
      }

      if (data.job_id) {
        updateState({ stage: 'processing', jobId: data.job_id, scanningLine: true });
        startPolling(data.job_id);
      } else {
        throw new Error('No job ID returned');
      }
    } catch (err) {
      console.error('Scan start error:', err);
      updateState({ stage: 'error', message: err.message || 'Failed to start scan' });
    }
  };

  const { stage, scanningLine, revealedPeople, ariaMessages, summary, message } = scanState;

  const handleClose = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    clearScanState();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="scan-modal-overlay" onClick={handleClose}>
      <div className="scan-modal" onClick={e => e.stopPropagation()}>
        <button className="scan-modal-close" onClick={handleClose}>×</button>
        <div style={{ maxWidth: 600, margin: '0 auto', padding: '0 20px', textAlign: 'center' }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f0f0f0', marginBottom: 8 }}>Scan Attendance</h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: 25 }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>

          {stage === 'idle' && (
            <>
              <div style={{ marginBottom: 25 }}>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: 8, color: '#f0f0f0' }}>Program / Event Name</label>
                <input
                  type="text"
                  value={programName}
                  onChange={e => setProgramName(e.target.value)}
                  placeholder="e.g., GIBEON"
                  style={{
                    padding: '12px 16px',
                    fontSize: 16,
                    borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.06)',
                    background: 'rgba(20,25,40,0.8)',
                    color: '#fff',
                    width: '100%',
                    maxWidth: 300,
                    textAlign: 'center',
                    outline: 'none',
                  }}
                />
              </div>
              <div className="fiducia-card" style={{ padding: '10px 16px', marginBottom: 25, textAlign: 'left', fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>
                Ensure the full page is visible — no torn, folded, or cut‑off edges — and good lighting.
              </div>
              <label htmlFor="cameraInput" style={{ cursor: 'pointer', display: 'inline-block' }}>
                <div className="fiducia-button fiducia-button-primary" style={{ fontSize: 18, padding: '16px 36px' }}>Take Photo of Register</div>
              </label>
              <input ref={fileInputRef} id="cameraInput" type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ display: 'none' }} />
            </>
          )}

          {stage === 'processing' && (
            <div className="fiducia-card" style={{ padding: 24, marginTop: 20, textAlign: 'center' }}>
              <div style={{
                width: 80, height: 80, borderRadius: '50%', margin: '0 auto 20px',
                background: 'radial-gradient(circle, rgba(212,175,55,0.15) 0%, transparent 70%)',
                animation: 'breathe 3s ease-in-out infinite',
              }}>
                <div style={{
                  width: 16, height: 16, borderRadius: '50%', background: '#D4AF37',
                  position: 'relative', top: '50%', left: '50%',
                  transform: 'translate(-50%, -50%)',
                  boxShadow: '0 0 20px rgba(212,175,55,0.4)',
                  animation: 'pulse 2s ease-in-out infinite',
                }} />
              </div>
              <p className="aria-speaks" style={{ fontSize: 16, marginBottom: 8 }}>{progressMessage}</p>
              {elapsedSeconds > 5 && (
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>{elapsedSeconds}s elapsed</p>
              )}
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, marginTop: 8 }}>You can leave this page — ARIA will keep working.</p>
            </div>
          )}

          {stage === 'revealing' && (
            <div className="fiducia-card" style={{ padding: 24, marginTop: 20, textAlign: 'left' }}>
              <p style={{ fontSize: 16, color: '#D4AF37', marginBottom: 15, fontWeight: 500 }}>Building community memory…</p>
              {revealedPeople.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ flex: 2 }}>{p.name}</span>
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 12,
                    background: p.relationship_stage === 'new_visitor' ? 'rgba(52,211,153,0.15)' :
                                p.relationship_stage === 'familiar_face' || p.relationship_stage === 'returning' ? 'rgba(212,175,55,0.15)' :
                                'rgba(96,165,250,0.15)',
                    color: p.relationship_stage === 'new_visitor' ? '#34D399' :
                           p.relationship_stage === 'familiar_face' || p.relationship_stage === 'returning' ? '#D4AF37' : '#60A5FA',
                  }}>
                    {p.relationship_stage === 'new_visitor' ? 'New visitor' :
                     p.relationship_stage === 'familiar_face' ? 'Familiar face' :
                     p.relationship_stage === 'returning' ? 'Returning' : 'Regular'}
                  </span>
                  <span style={{ flex: 1, textAlign: 'right', color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>{p.phone || '—'}</span>
                </div>
              ))}
              {ariaMessages.map((msg, i) => (
                <p key={i} className="aria-speaks" style={{ fontSize: 14, marginTop: 12, marginBottom: 0 }}>{msg}</p>
              ))}
            </div>
          )}

          {stage === 'complete' && summary && (
            <div className="fiducia-card" style={{
              padding: 24, marginTop: 20, textAlign: 'left',
              animation: celebration ? 'celebratePulse 0.6s ease-out' : 'none',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 24, color: '#D4AF37' }}>Memory updated</div>
                {completionTimestamp && (
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{completionTimestamp}</span>
                )}
              </div>
              <p style={{ color: '#f0f0f0', fontSize: 18, marginBottom: 16 }}>{summary.total} lives remembered.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
                {summary.newVisitors > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: '#34D399', fontSize: 15 }}><span>{summary.newVisitors} first-time visitors</span></div>}
                {summary.returning > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: '#D4AF37', fontSize: 15 }}><span>{summary.returning} familiar faces returning</span></div>}
                {summary.duplicates > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: '#F59E0B', fontSize: 15 }}><span>{summary.duplicates} familiar faces recognised</span></div>}
                {summary.needsReview > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: '#EF4444', fontSize: 15 }}><span>{summary.needsReview} need your attention</span></div>}
              </div>
              <p className="aria-speaks" style={{ marginBottom: 20, fontSize: 14 }}>ARIA has finished preparing your community.</p>
              <button onClick={() => router.push('/people?tab=community')} className="fiducia-button fiducia-button-primary" style={{ width: '100%' }}>View Community</button>
            </div>
          )}

          {stage === 'error' && (
            <div className="fiducia-card" style={{ padding: 24, marginTop: 20, textAlign: 'left' }}>
              <p style={{ color: '#EF4444', marginBottom: 12 }}>{message || 'ARIA was unable to read the register. Please try again with a clearer photo.'}</p>
              <button onClick={() => updateState({ stage: 'idle' })} className="fiducia-button fiducia-button-secondary" style={{ padding: '10px 20px' }}>Try Again</button>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .scan-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.7);
          backdrop-filter: blur(8px);
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .scan-modal {
          background: #0A0F1A;
          border-radius: 32px;
          max-width: 700px;
          width: 100%;
          max-height: 90vh;
          overflow-y: auto;
          padding: 40px 20px 20px;
          border: 1px solid rgba(255,255,255,0.05);
          position: relative;
        }
        .scan-modal-close {
          position: absolute;
          top: 16px;
          right: 20px;
          background: none;
          border: none;
          color: rgba(255,255,255,0.5);
          font-size: 28px;
          cursor: pointer;
          transition: color 0.2s;
        }
        .scan-modal-close:hover {
          color: #fff;
        }
        @keyframes breathe {
          0% { transform: scale(0.95); opacity: 0.8; }
          50% { transform: scale(1.05); opacity: 1; }
          100% { transform: scale(0.95); opacity: 0.8; }
        }
        @keyframes pulse {
          0% { transform: translate(-50%, -50%) scale(1); opacity: 0.8; }
          50% { transform: translate(-50%, -50%) scale(1.4); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1); opacity: 0.8; }
        }
        @keyframes celebratePulse {
          0% { box-shadow: 0 0 0 0 rgba(212,175,55,0.4); }
          50% { box-shadow: 0 0 30px 10px rgba(212,175,55,0.15); }
          100% { box-shadow: 0 0 0 0 rgba(212,175,55,0); }
        }
        .fiducia-card { background: rgba(20,25,40,0.9); border-radius: 26px; border: 1px solid rgba(255,255,255,0.05); box-shadow: inset 0 0 10px rgba(212,175,55,0.03); transition: border-color 0.4s ease, box-shadow 0.4s ease, transform 0.2s ease; padding: 24px; margin-bottom: 18px; animation: cardBreathe 20s ease-in-out infinite alternate; }
        @keyframes cardBreathe { 0% { box-shadow: inset 0 0 10px rgba(212,175,55,0.03); } 100% { box-shadow: inset 0 0 14px rgba(212,175,55,0.06); } }
        .fiducia-button { padding: 12px 24px; border-radius: 30px; font-weight: 500; font-size: 15px; cursor: pointer; transition: background 0.2s, box-shadow 0.2s, transform 0.1s; display: inline-block; text-decoration: none; text-align: center; user-select: none; border: 1px solid transparent; }
        .fiducia-button-primary { background: rgba(212,175,55,0.1); border-color: rgba(212,175,55,0.2); color: #D4AF37; }
        .fiducia-button-primary:active { background: rgba(212,175,55,0.2); box-shadow: 0 0 18px rgba(212,175,55,0.12); transform: scale(0.98); }
        .fiducia-button-secondary { background: rgba(59,130,246,0.1); border-color: rgba(59,130,246,0.2); color: #60A5FA; }
        .fiducia-button-secondary:active { background: rgba(59,130,246,0.2); box-shadow: 0 0 18px rgba(59,130,246,0.12); transform: scale(0.98); }
        .aria-speaks { color: #f0ead6; font-weight: 400; line-height: 1.7; letter-spacing: 0.01em; }
      `}</style>
    </div>
  );
              }
