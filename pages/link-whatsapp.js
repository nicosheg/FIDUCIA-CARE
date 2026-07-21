import { useState } from 'react';
import Layout from '../components/Layout';

export default function LinkWhatsApp() {
  const [phone, setPhone] = useState('2349167049038');
  const [pairingCode, setPairingCode] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [connecting, setConnecting] = useState(false);

  const getPairingCode = async () => {
    setConnecting(true);
    setError('');
    try {
      const res = await fetch(`/api/proxy-pairing-code?phone=${encodeURIComponent(phone)}`);
      const data = await res.json();
      if (data.pairingCode) {
        setPairingCode(data.pairingCode);
        setStatus('Code generated. Follow instructions below.');
      } else if (data.connected) {
        setStatus('WhatsApp is already connected!');
      } else {
        setError(data.error || 'Failed to generate code');
      }
    } catch (err) {
      setError('Network error: ' + err.message);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <Layout>
      <div style={{ maxWidth: 500, margin: '40px auto', padding: '0 20px', color: '#f0f0f0' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 20 }}>🔗 Link WhatsApp</h1>
        <p style={{ marginBottom: 20, color: 'rgba(255,255,255,0.7)' }}>
          Enter your phone number (with country code, no +) to get an 8-digit pairing code.
        </p>

        <input
          type="text"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder="e.g., 2349167049038"
          style={{
            width: '100%',
            padding: '12px 16px',
            borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.15)',
            background: 'rgba(255,255,255,0.05)',
            color: '#fff',
            marginBottom: 15,
            outline: 'none',
          }}
        />

        <button
          onClick={getPairingCode}
          disabled={connecting}
          style={{
            padding: '12px 24px',
            background: '#4F46E5',
            color: '#fff',
            border: 'none',
            borderRadius: 12,
            fontWeight: 600,
            cursor: 'pointer',
            marginBottom: 20,
          }}
        >
          {connecting ? 'Generating...' : 'Get Pairing Code'}
        </button>

        {status && (
          <div style={{ marginBottom: 15, color: '#34D399' }}>{status}</div>
        )}

        {pairingCode && (
          <div style={{
            background: 'rgba(255,255,255,0.05)',
            backdropFilter: 'blur(10px)',
            borderRadius: 16,
            padding: 20,
            textAlign: 'center',
            marginBottom: 20,
          }}>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>
              Your pairing code
            </div>
            <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: 6, color: '#34D399' }}>
              {pairingCode}
            </div>
            <div style={{ marginTop: 15, fontSize: 14, color: 'rgba(255,255,255,0.8)', textAlign: 'left' }}>
              <strong>Steps to link:</strong>
              <ol style={{ paddingLeft: 20, lineHeight: 1.8 }}>
                <li>Open WhatsApp on your phone.</li>
                <li>Go to <strong>Settings → Linked Devices → Link a Device</strong>.</li>
                <li>Tap <strong>“Link with phone number instead”</strong>.</li>
                <li>Enter the code shown above.</li>
              </ol>
            </div>
          </div>
        )}

        {error && (
          <div style={{ color: '#EF4444', marginTop: 10 }}>❌ {error}</div>
        )}
      </div>
    </Layout>
  );
    }
