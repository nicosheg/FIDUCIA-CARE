import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import { getScanState, setScanState, clearScanState } from '../lib/scanStore';

export default function ScanPage() {
  const router = useRouter();
  const fileInputRef = useRef(null);
  const [stage, setStage] = useState('idle'); // idle | enhancing | scanning | revealing | complete | error
  const [programName, setProgramName] = useState('GIBEON');
  const [results, setResults] = useState(null);
  const [revealedPeople, setRevealedPeople] = useState([]);
  const [ariaMessages, setAriaMessages] = useState([]);
  const [summary, setSummary] = useState(null);
  const [scanningLine, setScanningLine] = useState(false);

  useEffect(() => {
    const state = getScanState();
    if (state.status === 'processing') setStage('scanning');
  }, []);

  const updateState = (newState) => { /* only for persistent store */ };

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
        // Grayscale + sharpen (same as before)
        const imgData = ctx.getImageData(0, 0, w, h);
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
          let g = d[i]*0.299 + d[i+1]*0.587 + d[i+2]*0.114;
          g = ((g - 128) * 1.4) + 128;
          g = Math.min(255, Math.max(0, g));
          d[i] = d[i+1] = d[i+2] = g;
        }
        ctx.putImageData(imgData, 0, 0);
        const sharp = [0,-1,0, -1,5,-1, 0,-1,0];
        const sharpData = ctx.getImageData(0, 0, w, h);
        const out = new Uint8ClampedArray(sharpData.data);
        for (let y = 1; y < h-1; y++) {
          for (let x = 1; x < w-1; x++) {
            let r=0,g=0,b=0;
            for (let ky=-1;ky<=1;ky++) for (let kx=-1;kx<=1;kx++) {
              const idx = ((y+ky)*w + (x+kx))*4;
              const wgt = sharp[(ky+1)*3 + (kx+1)];
              r += sharpData.data[idx]*wgt;
              g += sharpData.data[idx+1]*wgt;
              b += sharpData.data[idx+2]*wgt;
            }
            const i = (y*w + x)*4;
            out[i]=Math.min(255,Math.max(0,r));
            out[i+1]=Math.min(255,Math.max(0,g));
            out[i+2]=Math.min(255,Math.max(0,b));
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

    // Stage 1: Enhancing
    setStage('enhancing');
    setScanningLine(true);
    const base64 = await preprocessImage(file);

    // Stage 2: Scanning (send to ARIA)
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

    // Stage 3: Reveal – one name at a time
    const people = data.people || [];
    const names = people.map(p => p.name || p.first_name || 'Unknown');
    const phones = people.map(p => p.phone || '');

    setStage('revealing');
    for (let i = 0; i < names.length; i++) {
      await new Promise(r => setTimeout(r, 300));
      setRevealedPeople(prev => [...prev, { name: names[i], phone: phones[i], confidence: people[i].confidence || 85 }]);
    }

    // ARIA messages sequentially
    const msg1 = `I found ${names.length} people.`;
    setAriaMessages([msg1]);
    await new Promise(r => setTimeout(r, 800));
    const dups = data.duplicates || 0;
    const needsReview = data.needs_review || 0;
    if (dups > 0) {
      setAriaMessages(prev => [...prev, `${dups} may already be in your community.`]);
      await new Promise(r => setTimeout(r, 700));
    }
    if (needsReview > 0) {
      setAriaMessages(prev => [...prev, `${needsReview} records need your review.`]);
      await new Promise(r => setTimeout(r, 700));
    }
    setAriaMessages(prev => [...prev, `Everything else looks good.`]);
    await new Promise(r => setTimeout(r, 800));

    // Final summary
    const ready = names.length - dups - needsReview;
    setSummary({
      total: names.length,
      ready,
      duplicates: dups,
      needsReview,
      confidence: 97, // hardcoded for now; can be computed from individual confidences
    });

    // Stage 4: Complete
    setStage('complete');
    setTimeout(() => {
      clearScanState();
      router.push('/community');
    }, 4000);
  };

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <Layout>
      <div style={{ maxWidth: 600, margin: '40px auto', padding: '0 20px', textAlign: 'center' }}>
        <h1 style={heading}>Scan Attendance</h1>
        <p style={subheading}>{today}</p>

        {stage === 'idle' && (
          <>
            <div style={{ marginBottom: 25 }}>
              <label style={labelStyle}>Program / Event Name</label>
              <input type="text" value={programName} onChange={e => setProgramName(e.target.value)} placeholder="e.g., GIBEON" style={inputStyle} />
            </div>
            <div style={tipStyle}>
              💡 Make sure the full page is visible — no torn, folded, or cut‑off edges — and good lighting.
            </div>
            <label htmlFor="cameraInput" style={{ cursor: 'pointer', display: 'inline-block' }}>
              <div style={cameraBtn}>📷 Take Photo of Register</div>
            </label>
            <input ref={fileInputRef} id="cameraInput" type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ display: 'none' }} />
          </>
        )}

        {(stage === 'enhancing' || stage === 'scanning') && (
          <div style={resultCard}>
            <div style={scanLineContainer}><div style={scanLine} /></div>
            <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
              {stage === 'enhancing' ? '✨ ARIA is preparing your image...' : '🔍 ARIA is reading the register...'}
            </p>
          </div>
        )}

        {stage === 'revealing' && (
          <div style={resultCard}>
            <p style={{ fontSize: 16, color: '#D4AF37', marginBottom: 15 }}>ARIA is understanding relationships...</p>
            {revealedPeople.map((p, i) => (
              <div key={i} style={nameRow}>
                <span style={{ flex: 2 }}>{p.name}</span>
                <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.1)', margin: '0 10px' }}>
                  <div style={{ width: `${p.confidence}%`, height: '100%', borderRadius: 3, background: p.confidence >= 90 ? '#34D399' : p.confidence >= 80 ? '#D4AF37' : '#EF4444', transition: 'width 0.3s' }} />
                </div>
                <span style={{ flex: 0.5, textAlign: 'right', fontWeight: 600, color: p.confidence >= 90 ? '#34D399' : p.confidence >= 80 ? '#D4AF37' : '#EF4444' }}>{p.confidence}%</span>
                <span style={{ flex: 1, textAlign: 'right', color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>{p.phone || '—'}</span>
              </div>
            ))}
            {ariaMessages.map((msg, i) => (
              <p key={i} style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, marginTop: 10, textAlign: 'left' }}>{msg}</p>
            ))}
          </div>
        )}

        {stage === 'complete' && summary && (
          <div style={resultCard}>
            <div style={{ fontSize: 24, color: '#D4AF37', marginBottom: 10 }}>✨ Scan Complete</div>
            <p style={{ color: '#f0f0f0', fontSize: 18 }}>{summary.total} Lives Remembered</p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 15 }}>
              <span style={{ color: '#34D399' }}>{summary.ready} Ready</span>
              {summary.duplicates > 0 && <span style={{ color: '#F59E0B' }}>{summary.duplicates} Duplicates</span>}
              {summary.needsReview > 0 && <span style={{ color: '#EF4444' }}>{summary.needsReview} Needs Review</span>}
            </div>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginTop: 10, fontSize: 14 }}>ARIA is ready.</p>
            <button onClick={() => router.push('/community')} style={viewBtn}>View Community →</button>
          </div>
        )}

        {stage === 'error' && (
          <div style={resultCard}>
            <p style={{ color: '#EF4444' }}>❌ ARIA couldn't read the register. Please try again with a clearer photo.</p>
            <button onClick={() => setStage('idle')} style={retryBtn}>Try Again</button>
          </div>
        )}
      </div>
    </Layout>
  );
}

// Styles (same as before, plus new ones)
const heading = { fontSize: 28, fontWeight: 700, color: '#f0f0f0', marginBottom: 8 };
const subheading = { color: 'rgba(255,255,255,0.6)', marginBottom: 25 };
const labelStyle = { fontWeight: 600, display: 'block', marginBottom: 8, color: '#f0f0f0' };
const inputStyle = { padding: '12px 16px', fontSize: 16, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(5px)', color: '#fff', width: '100%', maxWidth: 300, textAlign: 'center', outline: 'none' };
const cameraBtn = { background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.2)', color: '#D4AF37', padding: '18px 40px', borderRadius: 16, fontSize: 20, fontWeight: 600, backdropFilter: 'blur(10px)', transition: 'transform 0.2s' };
const tipStyle = { marginBottom: 20, padding: '10px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', fontSize: 14, maxWidth: 350, margin: '0 auto 25px', textAlign: 'left' };
const resultCard = { marginTop: 30, padding: 16, borderRadius: 16, backdropFilter: 'blur(10px)', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', color: '#f0f0f0', textAlign: 'left' };
const scanLineContainer = { height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.03)', marginBottom: 15, overflow: 'hidden' };
const scanLine = { width: '30%', height: '100%', background: '#D4AF37', animation: 'scanMove 1.5s ease-in-out infinite', borderRadius: 2 };
const nameRow = { display: 'flex', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', animation: 'fadeIn 0.3s ease' };
const viewBtn = { marginTop: 15, width: '100%', padding: '12px', background: '#D4AF37', color: '#0A0F1A', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer' };
const retryBtn = { marginTop: 10, padding: '10px 20px', background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', color: '#EF4444', borderRadius: 10, fontWeight: 600, cursor: 'pointer' };
