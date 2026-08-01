import { useState } from 'react';
import Layout from '../components/Layout';

export default function SimulateReply() {
  const [phone, setPhone] = useState('2348128717187');
  const [replyText, setReplyText] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [intent, setIntent] = useState('');
  const [escalated, setEscalated] = useState(false);

  const simulate = async () => {
    if (!replyText.trim()) return;
    const res = await fetch('/api/simulate-reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, message: replyText }),
    });
    const data = await res.json();
    setAiResponse(data.aiReply || '');
    setIntent(data.intent || '');
    setEscalated(data.escalated || false);
  };

  return (
    <Layout>
      <div style={{ maxWidth: 500, margin: '40px auto', padding: '0 20px', color: '#f0f0f0' }}>
        <h1>Simulate Member Reply</h1>
        <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Member phone" style={inputStyle} />
        <textarea value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Type a reply as the member..." rows={4} style={{ ...inputStyle, resize: 'vertical' }} />
        <button onClick={simulate} style={btnStyle}>Send Reply</button>

        {intent && (
          <div style={{ marginTop: 20, padding: 16, background: 'rgba(255,255,255,0.05)', borderRadius: 12 }}>
            <div><strong>Detected intent:</strong> {intent}</div>
            {escalated && <div style={{ color: '#EF4444', marginTop: 8 }}>🚨 Escalated to pastor</div>}
            {aiResponse && (
              <div style={{ marginTop: 12, padding: 12, background: 'rgba(52,211,153,0.15)', borderRadius: 8 }}>
                <strong>AI auto‑reply (if not escalated):</strong><br />
                {aiResponse}
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}

const inputStyle = { width: '100%', padding: 10, marginBottom: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#fff' };
const btnStyle = { padding: '10px 20px', background: '#D4AF37', color: '#0A1128', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 };
