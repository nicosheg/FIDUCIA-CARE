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
        {/* ARIA Message – highest importance */}
        <div className="fiducia-card" style={{ marginBottom: 30, padding: '24px 28px' }}>
          <p className="aria-speaks" style={{ fontSize: 22, margin: 0 }}>{moment}</p>
        </div>

        {/* Observation – secondary */}
        {ariaObservation && (
          <div className="fiducia-card" style={{ padding: '14px 20px', marginBottom: 25 }}>
            <p className="aria-speaks" style={{ margin: 0 }}>{ariaObservation}</p>
          </div>
        )}

        {/* Statistics – lower importance */}
        <div style={{ display: 'flex', gap: 20, marginBottom: 30, flexWrap: 'wrap' }}>
          <div className="fiducia-card" style={{ flex: 1, minWidth: 150, textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>Today's Community</div>
            <div style={{ fontSize: 42, fontWeight: 700, color: '#D4AF37' }}>{stats.present_count}</div>
          </div>
          <div className="fiducia-card" style={{ flex: 1, minWidth: 150, textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>Need Attention</div>
            <div style={{ fontSize: 42, fontWeight: 700, color: '#EF4444' }}>{stats.absent_count}</div>
          </div>
        </div>

        {/* Primary Action – clear visual weight */}
        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <a href="/scan" className="fiducia-button fiducia-button-primary">Scan Register</a>
          <a href="/community" className="fiducia-button fiducia-button-secondary">Community</a>
        </div>
      </div>
    </Layout>
  );
      }
