import { useEffect, useState } from 'react';
import Layout from '../components/Layout';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [moment, setMoment] = useState('');
  const orgId = 'demo-org';

  useEffect(() => {
    fetch(`/api/dashboard?organization_id=${orgId}`)
      .then(r => r.json())
      .then(data => {
        setStats(data);
        // Build the Moment sentence
        const parts = [];
        if (data.needCare && data.needCare > 0) {
          parts.push(`${data.needCare} people may need your attention today.`);
        }
        if (data.todaysCommunity > 0) {
          parts.unshift(`${data.todaysCommunity} are with us today.`);
        }
        if (parts.length === 0) parts.push('Everything is calm today.');
        setMoment(parts.join(' '));
      });
  }, []);

  if (!stats) return <div style={{ color: '#fff', padding: 20 }}>…</div>;

  return (
    <Layout>
      <div style={container}>
        {/* The Moment */}
        <div style={momentCard}>
          <p style={momentText}>{moment}</p>
        </div>

        {/* Key indicators */}
        <div style={keyGrid}>
          <Indicator
            icon="🛡️"
            label="Today's Community"
            value={stats.todaysCommunity || 0}
            color="#D4AF37"
          />
          <Indicator
            icon="❤️"
            label="Need Care"
            value={stats.needCare || 0}
            color="#EF4444"
          />
        </div>

        {/* Journey button – leads to full community */}
        <a href="/community" style={journeyBtn}>
          See all 28 lives remembered →
        </a>

        {/* Ambient AI insight */}
        {stats.ambientInsight && (
          <div style={ambientBox}>
            <p style={ambientText}>{stats.ambientInsight}</p>
          </div>
        )}
      </div>
    </Layout>
  );
}

function Indicator({ icon, label, value, color }) {
  return (
    <div style={indicatorCard}>
      <div style={indicatorIcon}>{icon}</div>
      <div style={indicatorValue}>{value}</div>
      <div style={indicatorLabel}>{label}</div>
    </div>
  );
}

// Styling
const container = { maxWidth: 700, margin: '0 auto', padding: '30px 20px' };
const momentCard = {
  background: 'rgba(255,255,255,0.02)',
  backdropFilter: 'blur(20px)',
  borderRadius: 24,
  padding: '24px 28px',
  marginBottom: 30,
  border: '1px solid rgba(255,255,255,0.04)',
};
const momentText = {
  fontSize: 20,
  color: '#D4AF37',
  margin: 0,
  fontWeight: 400,
  lineHeight: 1.5,
};
const keyGrid = { display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 30 };
const indicatorCard = {
  flex: 1, minWidth: 140,
  background: 'rgba(255,255,255,0.02)',
  backdropFilter: 'blur(20px)',
  borderRadius: 20,
  padding: '24px 20px',
  textAlign: 'center',
  border: '1px solid rgba(255,255,255,0.04)',
};
const indicatorIcon = { fontSize: 28, marginBottom: 8 };
const indicatorValue = { fontSize: 42, fontWeight: 700, color: '#f0f0f0' };
const indicatorLabel = { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 };
const journeyBtn = {
  display: 'block',
  textAlign: 'center',
  padding: '14px 0',
  color: '#D4AF37',
  textDecoration: 'none',
  fontWeight: 500,
  fontSize: 15,
  border: '1px solid rgba(212,175,55,0.2)',
  borderRadius: 14,
  background: 'rgba(212,175,55,0.05)',
  marginBottom: 20,
};
const ambientBox = {
  background: 'rgba(255,255,255,0.02)',
  backdropFilter: 'blur(20px)',
  borderRadius: 16,
  padding: '14px 20px',
  border: '1px solid rgba(255,255,255,0.04)',
};
const ambientText = { color: 'rgba(255,255,255,0.6)', fontSize: 14, margin: 0 };
