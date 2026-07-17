import { useState } from 'react';
import { useRouter } from 'next/router';

export default function ScanPage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    setMessage('');

    const form = new FormData();
    form.append('file', file);
    form.append('church_id', 'demo-church');
    form.append('uploaded_by', 'secretary');

    try {
      const res = await fetch('/api/attendance/scan', { method: 'POST', body: form });
      const data = await res.json();
      if (data.status === 'ok') {
        setMessage(`✅ Scan complete! ${data.present_count} present, ${data.absent_count} absent.`);
        setTimeout(() => router.push('/'), 3000);
      } else {
        setMessage('❌ Error: ' + (data.error || 'Unknown'));
      }
    } catch (err) {
      setMessage('❌ Error: ' + err.message);
    }
    setLoading(false);
  };

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div style={{ padding: 20, maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
      <nav style={{ display: 'flex', gap: 20, marginBottom: 30, borderBottom: '1px solid #eee', paddingBottom: 15, justifyContent: 'center' }}>
        <a href="/" style={navStyle()}>📊 Dashboard</a>
        <a href="/scan" style={navStyle(true)}>📷 Scan</a>
        <a href="/members" style={navStyle()}>👥 Members</a>
      </nav>

      <h1>Scan Attendance</h1>
      <p style={{ fontSize: 18, color: '#666' }}>{today}</p>

      <label htmlFor="cameraInput" style={{ cursor: 'pointer', marginTop: 30, display: 'inline-block' }}>
        <div style={{
          background: loading ? '#999' : '#4F46E5',
          color: 'white', padding: '20px 40px', borderRadius: 16, fontSize: 20,
        }}>
          📷 {loading ? 'Processing...' : 'Take Photo of Register'}
        </div>
      </label>
      <input
        id="cameraInput" type="file" accept="image/*" capture="environment"
        onChange={handleFile} style={{ display: 'none' }}
      />
      {message && <p style={{ marginTop: 20, fontSize: 18 }}>{message}</p>}
    </div>
  );
}

function navStyle(active = false) {
  return {
    textDecoration: 'none',
    color: active ? '#4F46E5' : '#333',
    fontWeight: active ? 'bold' : 'normal',
    fontSize: 16,
  };
    }
