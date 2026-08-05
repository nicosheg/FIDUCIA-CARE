import { useEffect, useState } from 'react';
import Layout from '../components/Layout';

export default function Dashboard() {
  const [attention, setAttention] = useState(null);
  const [greeting, setGreeting] = useState('');
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const orgId = 'demo-org';

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good morning.');
    else if (hour < 17) setGreeting('Good afternoon.');
    else setGreeting('Good evening.');

    fetch(`/api/attention?organization_id=${orgId}`)
      .then(r => r.json())
      .then(data => {
        setAttention(data);
        setHealth(data.health);
        setLoading(false);
      });
  }, []);

  const healthColor = health === 'healthy' ? '#34D399' : health === 'needs_attention' ? '#F59E0B' : '#EF4444';
  const healthLabel = health === 'healthy' ? 'Healthy' : health === 'needs_attention' ? 'Needs Attention' : 'Urgent';

  return (
    <Layout>
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '40px 20px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, color: '#f0f0f0', marginBottom: 24 }}>
          {greeting}
        </h1>

        {loading ? (
          <div className="fiducia-card shimmer" style={{ padding: '24px 28px', marginBottom: 20 }}>
            <div style={{ height: 24, width: '70%', borderRadius: 8 }} />
            <div style={{ height: 24, width: '50%', borderRadius: 8, marginTop: 10 }} />
          </div>
        ) : (
          <>
            {attention.highPriority?.length > 0 || attention.mediumPriority?.length > 0 ? (
              <div className="fiducia-card" style={{ padding: '24px 28px', marginBottom: 24 }}>
                <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.6)', marginBottom: 16 }}>
                  ARIA noticed a few things that may need your attention.
                </p>
                {attention.highPriority.map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 10 }}>
                    <span style={{ color: '#EF4444', marginRight: 10, fontWeight: 600 }}>High</span>
                    <p className="aria-speaks" style={{ margin: 0, fontSize: 17 }}>{item}</p>
                  </div>
                ))}
                {attention.mediumPriority.map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 10 }}>
                    <span style={{ color: '#F59E0B', marginRight: 10, fontWeight: 600 }}>Medium</span>
                    <p className="aria-speaks" style={{ margin: 0, fontSize: 17 }}>{item}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="fiducia-card" style={{ padding: '24px 28px', marginBottom: 24 }}>
                <p className="aria-speaks" style={{ fontSize: 18 }}>Everything is calm today.</p>
              </div>
            )}

            <div className="fiducia-card" style={{ padding: '16px 24px', marginBottom: 30, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: healthColor }} />
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15 }}>
                Community is <span style={{ color: healthColor, fontWeight: 600 }}>{healthLabel}</span>
              </div>
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <a href="/scan" className="fiducia-button fiducia-button-primary">Scan Register</a>
          <a href="/community" className="fiducia-button fiducia-button-secondary">Community</a>
        </div>
      </div>

      <style jsx>{`
        .shimmer {
          background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s ease-in-out infinite;
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </Layout>
  );
      }
