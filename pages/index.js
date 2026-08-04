import { useEffect, useState } from 'react';
import Layout from '../components/Layout';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [moment, setMoment] = useState('');
  const [ariaObservation, setAriaObservation] = useState('');
  const orgId = 'demo-org';

  useEffect(() => {
    fetch(`/api/dashboard?organization_id=${orgId}`)
      .then(r => r.json())
      .then(data => {
        setStats(data);
        const p = data.present_count || 0;
        const a = data.absent_count || 0;
        if (p + a === 0) {
          setMoment('Welcome. ARIA is ready to help you care for every life.');
        } else {
          const parts = [];
          if (p > 0) parts.push(`${p} people connected today.`);
          if (a > 0) parts.push(`${a} may need your attention.`);
          setMoment(parts.join(' '));
        }
        setTimeout(() => {
          if (a > 3) setAriaObservation('A few people haven’t been seen for a while.');
          else if (p > 20) setAriaObservation('Today’s gathering looks healthier than last week.');
        }, 1500);
      });
  }, []);

  if (!stats) return <div style={{ color: '#fff', padding: 20 }}>…</div>;

  return (
    <Layout>
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '40px 20px' }}>
        {/* The Moment */}
        <div style={momentCard}>
          <p style={momentText}>{moment}</p>
        </div>

        {/* Key indicators */}
        <div style={{ display: 'flex', gap: 20, marginBottom: 30, flexWrap: 'wrap' }}>
          <Indicator label="Today's Community" value={stats.present_count} color="#D4AF37" />
          <Indicator label="Need Attention" value={stats.absent_count} color="#EF4444" />
        </div>

        {/* ARIA observation (sparse) */}
        {ariaObservation && (
          <div style={observationCard}>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontStyle: 'italic', margin: 0 }}>{ariaObservation}</p>
          </div>
        )}

        {/* Primary actions */}
        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <a href="/scan" style={actionBtn}>Scan Register</a>
          <a href="/community" style={actionBtn}>Community</a>
        </div>
      </div>
    </Layout>
  );
}

function Indicator({ label, value, color }) {
  return (
    <div style={indCard}>
      <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 42, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

// Styles – no glassmorphism, just dark polished cards
const momentCard = {
  background: 'rgba(20, 25, 40, 0.9)',
  borderRadius: 20,
  padding: '24px 28px',
  marginBottom: 30,
  border: '1px solid rgba(255,255,255,0.05)',
  boxShadow: '0 0 20px rgba(212,175,55,0.05)',
};

const momentText = {
  fontSize: 22,
  color: '#D4AF37',
  margin: 0,
  fontWeight: 400,
  lineHeight: 1.5,
};

const indCard = {
  flex: 1,
  minWidth: 150,
  background: 'rgba(20,25,40,0.9)',
  borderRadius: 20,
  padding: '24px 20px',
  textAlign: 'center',
  border: '1px solid rgba(255,255,255,0.05)',
  boxShadow: '0 0 15px rgba(212,175,55,0.03)',
};

const observationCard = {
  background: 'rgba(20,25,40,0.7)',
  borderRadius: 16,
  padding: '14px 20px',
  marginBottom: 15,
  border: '1px solid rgba(255,255,255,0.04)',
};

const actionBtn = {
  padding: '12px 24px',
  background: 'rgba(20,25,40,0.8)',
  borderRadius: 14,
  color: '#D4AF37',
  textDecoration: 'none',
  fontWeight: 500,
  fontSize: 15,
  border: '1px solid rgba(212,175,55,0.2)',
  transition: 'all 0.2s',
  display: 'inline-block',
  cursor: 'pointer',
};
