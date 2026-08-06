import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';

export default function UsherSetup() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('attendance_usher');
    if (stored) {
      const usher = JSON.parse(stored);
      setName(usher.name);
      setPin(usher.pin || '');
      setSaved(true);
    }
  }, []);

  const saveUsher = () => {
    if (!name.trim()) return;
    const usher = { name: name.trim(), pin: pin.trim() || undefined };
    localStorage.setItem('attendance_usher', JSON.stringify(usher));
    setSaved(true);
    setTimeout(() => router.push('/attendance'), 500);
  };

  const clearUsher = () => {
    localStorage.removeItem('attendance_usher');
    setName('');
    setPin('');
    setSaved(false);
  };

  return (
    <Layout>
      <div style={{ maxWidth: 400, margin: '40px auto', padding: '0 20px', textAlign: 'center' }}>
        <h1 style={{ color: '#f0f0f0', fontSize: 24, marginBottom: 20 }}>Usher Setup</h1>
        <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: 20 }}>
          Enter your name (and optional PIN) so ARIA can remember you. You only need to do this once.
        </p>
        <input
          type="text"
          placeholder="Your name"
          value={name}
          onChange={e => setName(e.target.value)}
          style={inputStyle}
        />
        <input
          type="password"
          placeholder="4‑digit PIN (optional)"
          value={pin}
          onChange={e => setPin(e.target.value)}
          maxLength={4}
          style={inputStyle}
        />
        <button onClick={saveUsher} className="fiducia-button fiducia-button-primary" style={{ marginTop: 15, width: '100%' }}>
          {saved ? 'Update' : 'Save'}
        </button>
        {saved && (
          <button onClick={clearUsher} className="fiducia-button fiducia-button-ghost" style={{ marginTop: 10, width: '100%' }}>
            Clear Usher Info
          </button>
        )}
      </div>
    </Layout>
  );
}

const inputStyle = {
  width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)',
  background: 'rgba(20,25,40,0.8)', color: '#fff', outline: 'none', fontSize: 16, marginBottom: 10,
};
