import { useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';

export default function ScanPage() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [programName, setProgramName] = useState('GIBEON');
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
    form.append('program_name', programName.trim() || 'GIBEON 2026');

    try {
      const res = await fetch('/api/attendance/scan', { method: 'POST', body: form });
      const data = await res.json();
      if (data.status === 'ok') {
        setMessage(`✅ Scan complete! ${data.present_count} present (${data.new_members} new members added).`);
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
    <Layout>
      <div style={{ padding: 20, maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
        <h1>Scan Attendance</h1>
        <p style={{ fontSize: 18, color: '#666' }}>{today}</p>

        {/* Program Name Input */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontWeight: 'bold', display: 'block', marginBottom: 6 }}>Program / Event Name</label>
          <input
            type="text"
            value={programName}
            onChange={e => setProgramName(e.target.value)}
            placeholder="e.g., GIBEON"
            style={{
              padding: '10px 14px',
              fontSize: 16,
              borderRadius: 8,
              border: '1px solid #ccc',
              width: '100%',
              maxWidth: 300,
              textAlign: 'center',
            }}
          />
        </div>

        <label htmlFor="cameraInput" style={{ cursor: 'pointer', marginTop: 30, display: 'inline-block' }}>
          <div style={{
            background: loading ? '#999' : '#4F46E5',
            color: 'white', padding: '20px 40px', borderRadius: 16, fontSize: 20,
          }}>
            📷 {loading ? 'Processing...' : 'Take Photo of Register'}
          </div>
        </label>
        <input
          id="cameraInput"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFile}
          style={{ display: 'none' }}
        />
        {message && <p style={{ marginTop: 20, fontSize: 18 }}>{message}</p>}
      </div>
    </Layout>
  );
    }
