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

  return (
    <Layout>
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '40px 20px' }}>
        {!stats ? (
          // ---------- Skeleton loading – same shape, no flash ----------
          <>
            {/* Moment placeholder */}
            <div className="fiducia-card shimmer" style={{ marginBottom: 30, padding: '24px 28px' }}>
              <div style={{ height: 28, width: '80%', borderRadius: 8 }} />
              <div style={{ height: 28, width: '50%', borderRadius: 8, marginTop: 10 }} />
            </div>

            {/* Stat cards */}
            <div style={{ display: 'flex', gap: 20, marginBottom: 30, flexWrap: 'wrap' }}>
              <div className="fiducia-card shimmer" style={{ flex: 1, minWidth: 150, padding: '24px 20px', textAlign: 'center' }}>
                <div style={{ height: 18, width: '60%', borderRadius: 6, margin: '0 auto 12px' }} />
                <div style={{ height: 42, width: '40%', borderRadius: 10, margin: '0 auto' }} />
              </div>
              <div className="fiducia-card shimmer" style={{ flex: 1, minWidth: 150, padding: '24px 20px', textAlign: 'center' }}>
                <div style={{ height: 18, width: '60%', borderRadius: 6, margin: '0 auto 12px' }} />
                <div style={{ height: 42, width: '40%', borderRadius: 10, margin: '0 auto' }} />
              </div>
            </div>

            {/* Button placeholders */}
            <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
              <div className="shimmer" style={{ width: 140, height: 46, borderRadius: 30 }} />
              <div className="shimmer" style={{ width: 120, height: 46, borderRadius: 30 }} />
            </div>
          </>
        ) : (
          // ---------- Real content – identical structure ----------
          <>
            <div className="fiducia-card" style={{ marginBottom: 30, padding: '24px 28px' }}>
              <p className="aria-speaks" style={{ fontSize: 22, margin: 0 }}>{moment}</p>
            </div>

            {ariaObservation && (
              <div className="fiducia-card" style={{ padding: '14px 20px', marginBottom: 25 }}>
                <p className="aria-speaks" style={{ margin: 0 }}>{ariaObservation}</p>
              </div>
            )}

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

            <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
              <a href="/scan" className="fiducia-button fiducia-button-primary">Scan Register</a>
              <a href="/community" className="fiducia-button fiducia-button-secondary">Community</a>
            </div>
          </>
        )}
      </div>

      {/* Shimmer animation keyframes */}
      <style jsx>{`
        .shimmer {
          background: linear-gradient(
            90deg,
            rgba(255, 255, 255, 0.03) 25%,
            rgba(255, 255, 255, 0.06) 50%,
            rgba(255, 255, 255, 0.03) 75%
          );
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
