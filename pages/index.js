import { useEffect, useState } from 'react';
import Layout from '../components/Layout';

// A minimal, glowing decorative element – pure SVG, no emojis
const GlowPulse = ({ color = '#D4AF37', size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="10" cy="10" r="6" fill={color} opacity="0.25" />
    <circle cx="10" cy="10" r="3" fill={color} opacity="0.6" />
    <circle cx="10" cy="10" r="1.5" fill={color} />
  </svg>
);

export default function Dashboard() {
  const [attention, setAttention] = useState(null);
  const [greeting, setGreeting] = useState('');
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Live Attendance State
  const [liveSession, setLiveSession] = useState(null);
  const [liveProgress, setLiveProgress] = useState({ attended: 0, total: 0, percent: 0 });
  
  const orgId = 'demo-org';

  // Greeting & Attention
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

  // Live Attendance Polling
  useEffect(() => {
    let intervalId = null;

    const checkActive = async () => {
      try {
        const res = await fetch(`/api/attendance/active-session?organization_id=${orgId}`);
        const data = await res.json();
        
        if (data.active) {
          setLiveSession(data);
          if (intervalId) clearInterval(intervalId);

          const initProg = await fetch(`/api/attendance/progress?session_id=${data.session_id}`);
          const initData = await initProg.json();
          const total = initData.total || 0;
          const attended = initData.marked || 0;
          setLiveProgress({
            attended,
            total,
            percent: total > 0 ? Math.round((attended / total) * 100) : 0,
          });

          intervalId = setInterval(async () => {
            const progressRes = await fetch(`/api/attendance/progress?session_id=${data.session_id}`);
            const progressData = await progressRes.json();
            const newTotal = progressData.total || 0;
            const newAttended = progressData.marked || 0;
            setLiveProgress({
              attended: newAttended,
              total: newTotal,
              percent: newTotal > 0 ? Math.round((newAttended / newTotal) * 100) : 0,
            });
          }, 10000);
        } else {
          setLiveSession(null);
          setLiveProgress({ attended: 0, total: 0, percent: 0 });
          if (intervalId) clearInterval(intervalId);
        }
      } catch (e) {
        console.error('Polling error:', e);
      }
    };

    checkActive();

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [orgId]);

  const healthColor = health === 'healthy' ? '#34D399' : health === 'needs_attention' ? '#F59E0B' : '#EF4444';
  const healthLabel = health === 'healthy' ? 'Healthy' : health === 'needs_attention' ? 'Needs Attention' : 'Urgent';

  // Clean, emoji‑free subtexts
  const getLiveSubtext = (percent) => {
    if (percent === 0) return 'Waiting for the first check‑in.';
    if (percent < 30) return 'Your community is beginning to gather.';
    if (percent < 70) return 'The room is filling up beautifully.';
    if (percent < 95) return 'Almost everyone is here.';
    return 'Full presence. This is community.';
  };

  return (
    <Layout>
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '40px 20px' }}>
        
        <h1 style={{ fontSize: 28, fontWeight: 600, color: '#f0f0f0', marginBottom: 24 }}>
          {greeting}
        </h1>

        {/* ——— LIVE ATTENDANCE ——— */}
        {liveSession ? (
          <div 
            className="fiducia-card live-card" 
            style={{
              padding: '20px 24px',
              marginBottom: 24,
              background: 'rgba(212, 175, 55, 0.04)',
              border: '1px solid rgba(212, 175, 55, 0.25)',
              borderRadius: '16px',
              boxShadow: '0 0 30px rgba(212, 175, 55, 0.05)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Ambient glow */}
            <div style={{
              position: 'absolute',
              top: '-50%',
              right: '-20%',
              width: '200px',
              height: '200px',
              background: 'radial-gradient(circle, rgba(212,175,55,0.08) 0%, transparent 70%)',
              borderRadius: '50%',
              pointerEvents: 'none',
            }} />
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, position: 'relative', zIndex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="live-beacon" style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: '#EF4444',
                  boxShadow: '0 0 12px #EF4444',
                }} />
                <span style={{ color: '#D4AF37', fontWeight: 700, fontSize: 15, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                  LIVE · {liveSession.name}
                </span>
              </div>
              <span style={{ color: '#D4AF37', fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {liveProgress.attended} <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 400, fontSize: 16 }}>/ {liveProgress.total}</span>
              </span>
            </div>

            {/* Subtext with Glow SVG instead of emojis */}
            <p style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.6)', fontSize: 14, marginBottom: 12, position: 'relative', zIndex: 1 }}>
              <GlowPulse color="#D4AF37" size={10} />
              {getLiveSubtext(liveProgress.percent)}
            </p>

            {/* Liquid Gold Progress Bar */}
            <div style={{
              height: 6,
              borderRadius: 4,
              background: 'rgba(255,255,255,0.06)',
              overflow: 'hidden',
              position: 'relative',
              zIndex: 1,
            }}>
              <div 
                className="gold-wave"
                style={{
                  width: `${Math.min(liveProgress.percent, 100)}%`,
                  height: '100%',
                  borderRadius: 4,
                  background: 'linear-gradient(90deg, #D4AF37, #FDE68A, #D4AF37)',
                  backgroundSize: '200% 100%',
                  transition: 'width 0.8s cubic-bezier(0.22, 1, 0.36, 1)',
                }} 
              />
            </div>
          </div>
        ) : (
          <div style={{
            padding: '16px 20px',
            marginBottom: 24,
            borderRadius: '16px',
            border: '1px dashed rgba(255,255,255,0.06)',
            textAlign: 'center',
            color: 'rgba(255,255,255,0.15)',
            fontSize: 14,
            letterSpacing: '0.3px',
          }}>
            No live session right now. Start a register to bring your community together.
          </div>
        )}

        {/* ——— ARIA ATTENTION CARDS ——— */}
        {loading ? (
          <div className="fiducia-card shimmer" style={{ padding: '24px 28px', marginBottom: 20 }}>
            <div style={{ height: 24, width: '70%', borderRadius: 8 }} />
            <div style={{ height: 24, width: '50%', borderRadius: 8, marginTop: 10 }} />
          </div>
        ) : (
          <>
            {attention?.highPriority?.length > 0 || attention?.mediumPriority?.length > 0 ? (
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
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: healthColor, boxShadow: `0 0 12px ${healthColor}40` }} />
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

        .gold-wave {
          background: linear-gradient(90deg, #D4AF37, #FDE68A, #D4AF37, #FDE68A, #D4AF37);
          background-size: 300% 100%;
          animation: flowGold 3s ease-in-out infinite;
        }
        @keyframes flowGold {
          0% { background-position: 0% 0; }
          50% { background-position: 100% 0; }
          100% { background-position: 0% 0; }
        }

        .live-beacon {
          animation: pulseBeacon 1.8s ease-in-out infinite;
        }
        @keyframes pulseBeacon {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.8); }
          100% { opacity: 1; transform: scale(1); }
        }

        .live-card {
          animation: breatheGlow 4s ease-in-out infinite;
        }
        @keyframes breatheGlow {
          0% { border-color: rgba(212, 175, 55, 0.25); box-shadow: 0 0 30px rgba(212, 175, 55, 0.02); }
          50% { border-color: rgba(212, 175, 55, 0.4); box-shadow: 0 0 40px rgba(212, 175, 55, 0.08); }
          100% { border-color: rgba(212, 175, 55, 0.25); box-shadow: 0 0 30px rgba(212, 175, 55, 0.02); }
        }
      `}</style>
    </Layout>
  );
  }
