import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';

export default function ScanPage() {
  const router = useRouter();
  const fileInputRef = useRef(null);
  const [stage, setStage] = useState('idle');
  const [programName, setProgramName] = useState('GIBEON');
  const [results, setResults] = useState(null);
  const [revealedPeople, setRevealedPeople] = useState([]);
  const [ariaMessages, setAriaMessages] = useState([]);
  const [summary, setSummary] = useState(null);
  const [scanningLine, setScanningLine] = useState(false);
  const [fadeIn, setFadeIn] = useState(true); // for stage transitions

  // Smooth stage transitions – briefly fade out, change content, fade in
  useEffect(() => {
    setFadeIn(false);
    const timeout = setTimeout(() => setFadeIn(true), 250);
    return () => clearTimeout(timeout);
  }, [stage]);

  // ---------- PREPROCESSING ----------
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

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = null;

    setStage('enhancing');
    setScanningLine(true);
    const base64 = await preprocessImage(file);

    setStage('scanning');
    const res = await fetch('/api/ai/vision-scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_base64: base64,
        church_id: 'demo-org',
        program_name: programName.trim() || 'GIBEON',
      }),
    });
    const data = await res.json();

    if (data.status !== 'ok') {
      setStage('error');
      setScanningLine(false);
      return;
    }

    setResults(data);
    setScanningLine(false);

    const people = data.people || [];
    setStage('revealing');
    setRevealedPeople([]);
    for (let i = 0; i < people.length; i++) {
      await new Promise(r => setTimeout(r, 350));
      setRevealedPeople(prev => [...prev, people[i]]);
    }

    const msgs = [`I found ${people.length} people.`];
    setAriaMessages(msgs);
    await new Promise(r => setTimeout(r, 800));
    const dups = data.duplicates || 0;
    const needsReview = data.needs_review || 0;
    if (dups > 0) {
      msgs.push(`${dups} may already be in your community.`);
      setAriaMessages([...msgs]);
      await new Promise(r => setTimeout(r, 700));
    }
    if (needsReview > 0) {
      msgs.push(`${needsReview} records need your review.`);
      setAriaMessages([...msgs]);
      await new Promise(r => setTimeout(r, 700));
    }
    msgs.push(`Everything else looks good.`);
    setAriaMessages([...msgs]);
    await new Promise(r => setTimeout(r, 800));

    const ready = people.length - dups - needsReview;
    setSummary({
      total: people.length,
      ready,
      duplicates: dups,
      needsReview,
      confidence: 97,
    });

    setStage('complete');
  };

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <Layout>
      <div style={{ maxWidth: 600, margin: '40px auto', padding: '0 20px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: '#f0f0f0', marginBottom: 8 }}>
          Scan Attendance
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: 25 }}>{today}</p>

        <div style={{ opacity: fadeIn ? 1 : 0, transition: 'opacity 0.25s ease' }}>
          {stage === 'idle' && (
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
                  style={{
                    padding: '12px 16px', fontSize: 16, borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(20,25,40,0.8)',
                    color: '#fff', width: '100%', maxWidth: 300, textAlign: 'center', outline: 'none',
                  }}
                />
              </div>

              <div className="fiducia-card" style={{ padding: '10px 16px', marginBottom: 25, textAlign: 'left', fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>
                Ensure the full page is visible — no torn, folded, or cut‑off edges — and good lighting.
              </div>

              <label htmlFor="cameraInput" style={{ cursor: 'pointer', display: 'inline-block' }}>
                <div className="fiducia-button fiducia-button-primary" style={{ fontSize: 18, padding: '16px 36px' }}>
                  Take Photo of Register
                </div>
              </label>
              <input ref={fileInputRef} id="cameraInput" type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ display: 'none' }} />
            </>
          )}

          {(stage === 'enhancing' || stage === 'scanning') && (
            <div className="fiducia-card" style={{ padding: 24, marginTop: 20, textAlign: 'left', animation: 'cardBreathe 3s ease-in-out infinite alternate' }}>
              <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.03)', marginBottom: 15, overflow: 'hidden' }}>
                <div style={{ width: '30%', height: '100%', background: '#D4AF37', animation: 'scanMove 1.5s ease-in-out infinite', borderRadius: 2 }} />
              </div>
              <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: '#f0f0f0' }}>
                {stage === 'enhancing' ? 'ARIA is preparing your image…' : 'ARIA is reading the register…'}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#D4AF37', opacity: 0.6, animation: 'nodeBreathe 2s ease-in-out infinite' }} />
                <span className="aria-speaks" style={{ fontSize: 14 }}>This may take a moment.</span>
              </div>
            </div>
          )}

          {stage === 'revealing' && (
            <div className="fiducia-card" style={{ padding: 24, marginTop: 20, textAlign: 'left' }}>
              <p style={{ fontSize: 16, color: '#D4AF37', marginBottom: 15, fontWeight: 500 }}>
                Understanding relationships…
              </p>
              {revealedPeople.map((p, i) => (
                <div key={i} className="reveal-row" style={{ display: 'flex', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ flex: 2 }}>{p.name}</span>
                  <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)', margin: '0 10px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${p.confidence}%`,
                      height: '100%',
                      borderRadius: 2,
                      background: p.confidence >= 90 ? '#34D399' : p.confidence >= 80 ? '#D4AF37' : '#EF4444',
                      boxShadow: `0 0 6px ${p.confidence >= 90 ? 'rgba(52,211,153,0.4)' : p.confidence >= 80 ? 'rgba(212,175,55,0.4)' : 'rgba(239,68,68,0.4)'}`,
                      transition: 'width 0.3s',
                    }} />
                  </div>
                  <span style={{ flex: 0.5, textAlign: 'right', fontWeight: 600, color: p.confidence >= 90 ? '#34D399' : p.confidence >= 80 ? '#D4AF37' : '#EF4444', fontSize: 13 }}>
                    {p.confidence}%
                  </span>
                  <span style={{ flex: 1, textAlign: 'right', color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>
                    {p.phone || '—'}
                  </span>
                </div>
              ))}
              {ariaMessages.map((msg, i) => (
                <p key={i} className="aria-speaks" style={{ fontSize: 14, marginTop: 12, marginBottom: 0 }}>
                  {msg}
                </p>
              ))}
            </div>
          )}

          {stage === 'complete' && summary && (
            <div className="fiducia-card" style={{ padding: 24, marginTop: 20, textAlign: 'left' }}>
              <div style={{ fontSize: 24, color: '#D4AF37', marginBottom: 8 }}>Scan Complete</div>
              <p style={{ color: '#f0f0f0', fontSize: 18, marginBottom: 16 }}>{summary.total} people remembered.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#34D399', fontSize: 15 }}>
                  <span>{summary.ready} ready</span>
                </div>
                {summary.duplicates > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#F59E0B', fontSize: 15 }}>
                    <span>{summary.duplicates} possible duplicates</span>
                  </div>
                )}
                {summary.needsReview > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#EF4444', fontSize: 15 }}>
                    <span>{summary.needsReview} needs review</span>
                  </div>
                )}
              </div>
              <p className="aria-speaks" style={{ marginBottom: 20, fontSize: 14 }}>
                Community updated. ARIA is ready.
              </p>
              <button
                onClick={() => router.push('/community')}
                className="fiducia-button fiducia-button-primary"
                style={{ width: '100%' }}
              >
                View Community
              </button>
            </div>
          )}

          {stage === 'error' && (
            <div className="fiducia-card" style={{ padding: 24, marginTop: 20, textAlign: 'left' }}>
              <p style={{ color: '#EF4444', marginBottom: 12 }}>
                ARIA couldn't read the register. Please try again with a clearer photo.
              </p>
              <button onClick={() => setStage('idle')} className="fiducia-button fiducia-button-secondary" style={{ padding: '10px 20px' }}>
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Scan‑specific animations */}
      <style jsx>{`
        @keyframes cardBreathe {
          0% { box-shadow: inset 0 0 10px rgba(212,175,55,0.03); }
          100% { box-shadow: inset 0 0 18px rgba(212,175,55,0.06); }
        }
        @keyframes scanMove {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
        @keyframes nodeBreathe {
          0% { opacity: 0.4; transform: scale(1); }
          100% { opacity: 0.8; transform: scale(1.4); }
        }
        .reveal-row {
          animation: revealPulse 0.4s ease-out;
        }
        @keyframes revealPulse {
          0% { background: rgba(212,175,55,0.05); }
          100% { background: transparent; }
        }
      `}</style>
    </Layout>
  );
      }
