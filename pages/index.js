import { useEffect, useState } from 'react';
import Layout from '../components/Layout';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const churchId = 'demo-church';

  useEffect(() => {
    fetch(`/api/dashboard?church_id=${churchId}`)
      .then(r => r.json())
      .then(setStats);
  }, []);

  const startFollowUpCalls = async () => {
    const res = await fetch('/api/trigger-followup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ church_id: churchId }),
    });
    const data = await res.json();
    alert(data.message || 'Follow‑up calls started');
  };

  if (!stats) return <p>Loading...</p>;

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <Layout>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 5 }}>Today’s Attendance</h1>
        <p style={{ fontSize: 16, color: '#555', marginBottom: 25 }}>{today}</p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center' }}>
          <StatCard icon="✅" label="Present" value={stats.present_count} color="#4CAF50" />
          <StatCard icon="❌" label="Absent" value={stats.absent_count} color="#f44336" />
          <StatCard icon="📞" label="Calls Completed" value={stats.calls_completed} />
          <StatCard icon="🙏" label="Prayer Requests" value={stats.prayer_requests} color="#2196F3" />
          <StatCard icon="🚨" label="Needs Pastor" value={stats.needs_pastor} color="#ff9800" />
          <StatCard icon="⚠️" label="Wrong Numbers" value={stats.wrong_numbers} color="#9e9e9e" />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 40, justifyContent: 'center' }}>
          <a href="/scan" style={actionBtn}>📷 Scan Attendance</a>
          <button onClick={startFollowUpCalls} style={actionBtn}>📞 Start Follow‑up Calls</button>
        </div>
      </div>
    </Layout>
  );
}

function StatCard({ icon, label, value, color = '#333' }) {
  return (
    <div style={{
      backdropFilter: 'blur(10px)',
      background: 'rgba(255,255,255,0.65)',
      borderRadius: 16,
      padding: '20px',
      minWidth: 140,
      flex: '1 1 140px',
      textAlign: 'center',
      boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
      transition: 'transform 0.2s, box-shadow 0.2s',
      cursor: 'default',
    }}
      onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-3px)'}
      onMouseLeave={e => e.currentTarget.style.transform = 'none'}
    >
      <div style={{ fontSize: 28, marginBottom: 5 }}>{icon}</div>
      <div style={{ fontSize: 14, color: '#666', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 36, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

const actionBtn = {
  padding: '14px 28px',
  background: 'rgba(79,70,229,0.9)',
  backdropFilter: 'blur(5px)',
  color: '#fff',
  borderRadius: 14,
  textDecoration: 'none',
  fontWeight: 600,
  fontSize: 16,
  border: 'none',
  cursor: 'pointer',
  transition: 'background 0.2s',
  boxShadow: '0 4px 12px rgba(79,70,229,0.3)',
};
