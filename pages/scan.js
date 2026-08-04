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

  const preprocessImage = (file) => { /* same as before */ };

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
    for (let i = 0; i < people.length; i++) {
      await new Promise(r => setTimeout(r, 300));
      setRevealedPeople(prev => [...prev, people[i]]);
    }

    // ARIA messages in sequence
    const msgs = [`I found ${people.length} people.`];
    setAriaMessages(msgs);
    await new Promise(r => setTimeout(r, 800));
    const dups = data.duplicates || 0;
    const needsReview = data.needs_review || 0;
    if (dups > 0) { msgs.push(`${dups} may already be in your community.`); setAriaMessages([...msgs]); await new Promise(r => setTimeout(r, 700)); }
    if (needsReview > 0) { msgs.push(`${needsReview} records need your review.`); setAriaMessages([...msgs]); await new Promise(r => setTimeout(r, 700)); }
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
    setTimeout(() => {
      clearScanState();
      router.push('/community');
    }, 4000);
  };

  return (
    <Layout>
      <div style={{ maxWidth: 600, margin: '40px auto', padding: '0 20px', textAlign: 'center' }}>
        <h1 style={heading}>Scan Attendance</h1>
        <p style={subheading}>{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>

        {stage === 'idle' && (
          <>
            <div style={{ marginBottom: 25 }}>
              <label style={labelStyle}>Program / Event Name</label>
              <input type="text" value={programName} onChange={e => setProgramName(e.target.value)} placeholder="e.g., GIBEON" style={inputStyle} />
            </div>
            <div style={tipStyle}>
              Ensure the full page is visible — no torn, folded, or cut‑off edges — and good lighting.
            </div>
            <label htmlFor="cameraInput" style={{ cursor: 'pointer', display: 'inline-block' }}>
              <div style={cameraBtn}>Take Photo of Register</div>
            </label>
            <input ref={fileInputRef} id="cameraInput" type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ display: 'none' }} />
          </>
        )}

        {(stage === 'enhancing' || stage === 'scanning') && (
          <div style={resultCard}>
            <div style={scanLineContainer}><div style={scanLine} /></div>
            <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
              {stage === 'enhancing' ? 'ARIA is preparing your image...' : 'ARIA is reading the register...'}
            </p>
          </div>
        )}

        {stage === 'revealing' && (
          <div style={resultCard}>
            <p style={{ fontSize: 16, color: '#D4AF37', marginBottom: 15 }}>Understanding relationships...</p>
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
            <div style={{ fontSize: 24, color: '#D4AF37', marginBottom: 10 }}>Scan Complete</div>
            <p style={{ color: '#f0f0f0', fontSize: 18 }}>{summary.total} Lives Remembered</p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 15 }}>
              <span style={{ color: '#34D399' }}>{summary.ready} Ready</span>
              {summary.duplicates > 0 && <span style={{ color: '#F59E0B' }}>{summary.duplicates} Duplicates</span>}
              {summary.needsReview > 0 && <span style={{ color: '#EF4444' }}>{summary.needsReview} Needs Review</span>}
            </div>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginTop: 10, fontSize: 14 }}>ARIA is ready.</p>
            <button onClick={() => router.push('/community')} style={viewBtn}>View Community</button>
          </div>
        )}

        {stage === 'error' && (
          <div style={resultCard}>
            <p style={{ color: '#EF4444' }}>ARIA couldn't read the register. Please try again with a clearer photo.</p>
            <button onClick={() => setStage('idle')} style={retryBtn}>Try Again</button>
          </div>
        )}
      </div>
    </Layout>
  );
}

// Styles (cleaned of emojis, using polished dark cards)
const heading = { fontSize: 28, fontWeight: 700, color: '#f0f0f0', marginBottom: 8 };
const subheading = { color: 'rgba(255,255,255,0.6)', marginBottom: 25 };
const labelStyle = { fontWeight: 600, display: 'block', marginBottom: 8, color: '#f0f0f0' };
const inputStyle = { padding: '12px 16px', fontSize: 16, borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(20,25,40,0.8)', color: '#fff', width: '100%', maxWidth: 300, textAlign: 'center', outline: 'none' };
const cameraBtn = { background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.2)', color: '#D4AF37', padding: '18px 40px', borderRadius: 16, fontSize: 20, fontWeight: 600, transition: 'box-shadow 0.2s', cursor: 'pointer' };
const tipStyle = { marginBottom: 20, padding: '10px 16px', borderRadius: 12, background: 'rgba(20,25,40,0.5)', border: '1px solid rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.6)', fontSize: 14, maxWidth: 350, margin: '0 auto 25px', textAlign: 'left' };
const resultCard = { marginTop: 30, padding: 16, borderRadius: 16, background: 'rgba(20,25,40,0.9)', border: '1px solid rgba(255,255,255,0.05)', boxShadow: '0 0 20px rgba(212,175,55,0.03)', color: '#f0f0f0', textAlign: 'left' };
const scanLineContainer = { height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.03)', marginBottom: 15, overflow: 'hidden' };
const scanLine = { width: '30%', height: '100%', background: '#D4AF37', animation: 'scanMove 1.5s ease-in-out infinite', borderRadius: 2 };
const nameRow = { display: 'flex', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' };
const viewBtn = { marginTop: 15, width: '100%', padding: '12px', background: '#D4AF37', color: '#0A0F1A', border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer' };
const retryBtn = { marginTop: 10, padding: '10px 20px', background: 'transparent', border: '1px solid rgba(239,68,68,0.3)', color: '#EF4444', borderRadius: 10, fontWeight: 600, cursor: 'pointer' };
