import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import { getScanState, setScanState, clearScanState } from '../lib/scanStore';

export default function ScanPage() {
  const router = useRouter();
  const fileInputRef = useRef(null);
  const [programName, setProgramName] = useState('GIBEON');
  const [scanState, setScanStateLocal] = useState(getScanState());
  const [progressMessage, setProgressMessage] = useState('');
  const [completionTimestamp, setCompletionTimestamp] = useState(null);
  const [celebration, setCelebration] = useState(false);
  const pollRef = useRef(null);

  const syncState = useCallback(() => {
    setScanStateLocal(getScanState());
  }, []);

  // On mount, restore state and resume polling if needed
  useEffect(() => {
    const current = getScanState();
    syncState();
    if (current.stage === 'processing' && current.jobId) {
      startPolling(current.jobId);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const updateState = (newState) => {
    setScanState(newState);
    syncState();
  };

  // Image preprocessing (unchanged)
  const preprocessImage = (file) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(img.src);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const max = 600;
        let w = img.width, h = img.height;
        if (w > max) { h = (h * max) / w; w = max; }
        if (h > max) { w = (w * max) / h; h = max; }
        canvas.width = w; canvas.height = h;
        ctx.drawImage(img, 0, 0, w, h);
        const imgData = ctx.getImageData(0, 0, w, h);
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
          let g = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
          g = ((g - 128) * 1.4) + 128;
          g = Math.min(255, Math.max(0, g));
          d[i] = d[i + 1] = d[i + 2] = g;
        }
        ctx.putImageData(imgData, 0, 0);
        const sharp = [0, -1, 0, -1, 5, -1, 0, -1, 0];
        const sharpData = ctx.getImageData(0, 0, w, h);
        const out = new Uint8ClampedArray(sharpData.data);
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            let r = 0, g = 0, b = 0;
            for (let ky = -1; ky <= 1; ky++) {
              for (let kx = -1; kx <= 1; kx++) {
                const idx = ((y + ky) * w + (x + kx)) * 4;
                const wgt = sharp[(ky + 1) * 3 + (kx + 1)];
                r += sharpData.data[idx] * wgt;
                g += sharpData.data[idx + 1] * wgt;
                b += sharpData.data[idx + 2] * wgt;
              }
            }
            const i = (y * w + x) * 4;
            out[i] = Math.min(255, Math.max(0, r));
            out[i + 1] = Math.min(255, Math.max(0, g));
            out[i + 2] = Math.min(255, Math.max(0, b));
          }
        }
        ctx.putImageData(new ImageData(out, w, h), 0, 0);
        canvas.toBlob(blob => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result.split(',')[1]);
          reader.readAsDataURL(blob);
        }, 'image/jpeg', 0.7);
      };
    });
  };

  // Progress message mapping
  const progressLabels = {
    queued: 'Preparing to read…',
    enhancing: 'Enhancing image…',
    reading_handwriting: 'Reading handwriting…',
    matching_community: 'Matching existing community…',
    building_memory: 'Building memory…',
    complete: 'Complete',
    failed: 'Failed',
  };

  // Polling
  const startPolling = (jobId) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/scan/status?job_id=${jobId}`);
        const data = await res.json();
        if (data.status === 'complete') {
          clearInterval(pollRef.current);
          setCompletionTimestamp(new Date().toLocaleTimeString());
          updateState({ stage: 'revealing', results: data.result, scanningLine: false });
          revealResults(data.result);
        } else if (data.status === 'failed') {
          clearInterval(pollRef.current);
          updateState({ stage: 'error', message: data.result?.error || 'Scan failed' });
        } else {
          setProgressMessage(progressLabels[data.progress] || data.progress);
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 1500);
  };

  // Reveal (backend categories only, no frontend inference)
  const revealResults = async (resultData) => {
    const people = resultData.people || [];
    updateState({ stage: 'revealing', revealedPeople: [], ariaMessages: [] });
    let revealed = [];
    for (let i = 0; i < people.length; i++) {
      await new Promise(r => setTimeout(r, 350));
      revealed = [...revealed, people[i]];
      updateState({ revealedPeople: revealed });
    }

    // Compute stats from backend data
    const newVisitors = people.filter(p => p.relationship_stage === 'new_visitor').length;
    const returning = people.filter(p => p.relationship_stage === 'returning' || p.relationship_stage === 'familiar_face').length;
    const regulars = people.filter(p => p.relationship_stage === 'regular').length;
    const needsReview = resultData.needs_review || 0;
    const duplicates = resultData.duplicates?.length || 0;

    const msgs = [`I recognised ${people.length} people from this register.`];
    updateState({ ariaMessages: msgs });
    await new Promise(r => setTimeout(r, 800));
    if (duplicates > 0) {
      msgs.push(`${duplicates} familiar faces recognised.`);
      updateState({ ariaMessages: [...msgs] });
      await new Promise(r => setTimeout(r, 700));
    }
    if (needsReview > 0) {
      msgs.push(`${needsReview} need your attention.`);
      updateState({ ariaMessages: [...msgs] });
      await new Promise(r => setTimeout(r, 700));
    }
    msgs.push(`ARIA has finished preparing your community.`);
    updateState({ ariaMessages: [...msgs] });
    await new Promise(r => setTimeout(r, 800));

    updateState({
      stage: 'complete',
      summary: { total: people.length, newVisitors, returning, regulars, duplicates, needsReview },
    });

    // Subtle celebration pulse
    setCelebration(true);
    setTimeout(() => setCelebration(false), 2000);
  };

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = null;

    updateState({ stage: 'processing', scanningLine: true });
    setProgressMessage('Preparing image…');
    const base64 = await preprocessImage(file);

    try {
      const res = await fetch('/api/scan/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: base64, church_id: 'demo-org', program_name: programName.trim() || 'GIBEON' }),
      });
      const data = await res.json();
      if (data.job_id) {
        updateState({ stage: 'processing', jobId: data.job_id, scanningLine: true });
        startPolling(data.job_id);
      } else {
        updateState({ stage: 'error', message: 'Failed to start scan' });
      }
    } catch (err) {
      updateState({ stage: 'error', message: err.message });
    }
  };

  const { stage, scanningLine, revealedPeople, ariaMessages, summary, message } = scanState;

  return (
    <Layout>
      <div style={{ maxWidth: 600, margin: '40px auto', padding: '0 20px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f0f0f0', marginBottom: 8 }}>Scan Attendance</h1>
        <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: 25 }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>

        {stage === 'idle' && (
          <>
            <div style={{ marginBottom: 25 }}>
              <label style={{ fontWeight: 600, display: 'block', marginBottom: 8, color: '#f0f0f0' }}>Program / Event Name</label>
              <input type="text" value={programName} onChange={e => setProgramName(e.target.value)} placeholder="e.g., GIBEON"
                style={{ padding: '12px 16px', fontSize: 16, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(20,25,40,0.8)', color: '#fff', width: '100%', maxWidth: 300, textAlign: 'center', outline: 'none' }} />
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
              <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#D4AF37', position: 'relative', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', boxShadow: '0 0 20px rgba(212,175,55,0.4)', animation: 'pulse 2s ease-in-out infinite' }} />
            </div>
            <p className="aria-speaks" style={{ fontSize: 16, marginBottom: 8 }}>{progressMessage || 'ARIA is reading the register…'}</p>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>You can leave this page — ARIA will keep working.</p>
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
              {summary.regulars > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: '#60A5FA', fontSize: 15 }}><span>{summary.regulars} regular members</span></div>}
              {summary.duplicates > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: '#F59E0B', fontSize: 15 }}><span>{summary.duplicates} familiar faces recognised</span></div>}
              {summary.needsReview > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: '#EF4444', fontSize: 15 }}><span>{summary.needsReview} needs your attention</span></div>}
            </div>
            <p className="aria-speaks" style={{ marginBottom: 20, fontSize: 14 }}>ARIA has finished preparing your community.</p>
            <button onClick={() => router.push('/community')} className="fiducia-button fiducia-button-primary" style={{ width: '100%' }}>View Community</button>
          </div>
        )}

        {stage === 'error' && (
          <div className="fiducia-card" style={{ padding: 24, marginTop: 20, textAlign: 'left' }}>
            <p style={{ color: '#EF4444', marginBottom: 12 }}>{message || 'ARIA was unable to read the register. Please try again with a clearer photo.'}</p>
            <button onClick={() => updateState({ stage: 'idle' })} className="fiducia-button fiducia-button-secondary" style={{ padding: '10px 20px' }}>Try Again</button>
          </div>
        )}
      </div>

      <style jsx>{`
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
      `}</style>
    </Layout>
  );
      }
