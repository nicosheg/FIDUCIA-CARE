import { useEffect, useState } from 'react';
import Layout from '../components/Layout';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const orgId = 'demo-org';

  useEffect(() => {
    fetch(`/api/dashboard?organization_id=${orgId}`).then(r => r.json()).then(setStats);
  }, []);

  const generateFollowUp = async (personId) => {
    const res = await fetch(`/api/generate-followup?person_id=${personId}`);
    const data = await res.json();
    if (data.message) alert(`✨ AI says:\n\n${data.message}`);
    else alert('Error: ' + (data.error || 'Could not generate'));
  };

  const sendBulk = () => alert('Bulk send via mock – all messages logged.');

  if (!stats) return <p style={{ color: '#fff' }}>Loading...</p>;

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <Layout>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '20px' }}>
        <h1 style={heading}>Good morning, Pastor.</h1>
        <p style={subheading}>{today}</p>

        <div style={statGrid}>
          <StatCard icon="✅" label="Present" value={stats.present_count} color="#34D399" />
          <StatCard icon="❌" label="Absent" value={stats.absent_count} color="#EF4444" />
          <StatCard icon="📞" label="Calls" value={stats.calls_completed} />
          <StatCard icon="🙏" label="Prayer" value={stats.prayer_requests} color="#60A5FA" />
          <StatCard icon="🚨" label="Pastor" value={stats.needs_pastor} color="#F59E0B" />
          <StatCard icon="⚠️" label="Invalid" value={stats.wrong_numbers} color="#9CA3AF" />
        </div>

        {stats.absentees?.length > 0 && (
          <div style={{ marginTop: 40 }}>
            <h2 style={sectionTitle}>Today’s Absentees</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {stats.absentees.map(person => (
                <div key={person.id} style={absenteeRow}>
                  <div>
                    <span style={{ fontWeight: 600 }}>{person.first_name} {person.last_name}</span>
                    {person.missed_streak >= 2 && (
                      <span style={{ marginLeft: 10, color: '#D4AF37', fontSize: 13 }}>
                        (missed {person.missed_streak} in a row)
                      </span>
                    )}
                  </div>
                  <button onClick={() => generateFollowUp(person.id)} style={generateBtn}>
                    ✨ Generate Follow‑up
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: 30, display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button onClick={sendBulk} style={actionBtn}>📩 Send GIBEON Thank‑You</button>
          <button onClick={sendBulk} style={actionBtn}>📖 Bible Study Reminder</button>
        </div>
      </div>
    </Layout>
  );
}

function StatCard({ icon, label, value, color = '#E0E0E0' }) {
  return (
    <div style={statCard}>
      <div style={{ fontSize: 28 }}>{icon}</div>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 36, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

const heading = { fontSize: 32, fontWeight: 700, color: '#f0f0f0', marginBottom: 5 };
const subheading = { color: 'rgba(255,255,255,0.6)', marginBottom: 25, fontSize: 16 };
const statGrid = { display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center' };
const statCard = {
  background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(12px)',
  borderRadius: 18, padding: 20, textAlign: 'center',
  border: '1px solid rgba(255,255,255,0.06)', minWidth: 140, flex: 1,
};
const sectionTitle = { marginBottom: 15, fontSize: 22, fontWeight: 600, color: '#f0f0f0' };
const absenteeRow = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(8px)',
  padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)',
};
const generateBtn = {
  background: '#D4AF37', border: 'none', color: '#0A1128', borderRadius: 8,
  padding: '6px 12px', cursor: 'pointer', fontWeight: 600,
};
const actionBtn = {
  padding: '12px 24px', background: 'rgba(212, 175, 55, 0.15)', backdropFilter: 'blur(5px)',
  color: '#fff', borderRadius: 14, fontWeight: 600, fontSize: 15, border: '1px solid rgba(212,175,55,0.3)',
  cursor: 'pointer',
};
