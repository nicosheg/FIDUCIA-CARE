// pages/index.js
import { useEffect, useState } from 'react';
import Layout from '../components/Layout';

export default function ARIAHome() {
  const [briefing, setBriefing] = useState(null);
  const [priority, setPriority] = useState([]);
  const [brainFeed, setBrainFeed] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const orgId = 'demo-org';

  useEffect(() => {
    async function loadData() {
      try {
        const [briefRes, prioRes, feedRes, recRes] = await Promise.all([
          fetch(`/api/daily-briefing/latest?organization_id=${orgId}`),
          fetch(`/api/priority-queue?organization_id=${orgId}&limit=10`),
          fetch(`/api/brain-feed?organization_id=${orgId}&limit=10`),
          fetch(`/api/recommendations?organization_id=${orgId}`),
        ]);
        const brief = await briefRes.json();
        setBriefing(brief);
        const prio = await prioRes.json();
        setPriority(prio);
        const feed = await feedRes.json();
        setBrainFeed(feed);
        const recs = await recRes.json();
        setRecommendations(recs);
      } catch (e) {
        console.error('ARIA Today load error:', e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [orgId]);

  if (loading) {
    return (
      <Layout>
        <div style={{ padding: 40, maxWidth: 900, margin: '0 auto' }}>
          <div className="fiducia-card shimmer" style={{ padding: 24, height: 200 }} />
        </div>
      </Layout>
    );
  }

  const summary = briefing?.summary || 'Good morning. ARIA is ready.';

  return (
    <Layout>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 20px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, color: '#f0f0f0', marginBottom: 8 }}>
          ARIA Today
        </h1>
        <p className="aria-speaks" style={{ fontSize: 18, color: 'rgba(255,255,255,0.7)', marginBottom: 24, whiteSpace: 'pre-line' }}>
          {summary}
        </p>

        {/* Priority Queue */}
        {priority.length > 0 ? (
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 20, fontWeight: 500, color: '#f0f0f0', marginBottom: 12 }}>Top Priority</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {priority.slice(0, 10).map((p, idx) => (
                <div key={idx} className="fiducia-card" style={{ padding: '12px 20px', marginBottom: 0 }}>
                  <span style={{ color: '#f0f0f0', fontWeight: 500 }}>{p.first_name}</span>
                  <span style={{ color: 'rgba(255,255,255,0.3)', marginLeft: 8 }}>• Score: {p.priority_score}</span>
                  <span style={{ color: 'rgba(255,255,255,0.2)', marginLeft: 8, fontSize: 12 }}>
                    {p.living_truth_status || 'active'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: 32 }}>
            <p style={{ color: 'rgba(255,255,255,0.3)' }}>No priority signals yet.</p>
          </div>
        )}

        {/* Brain Feed */}
        {brainFeed.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 20, fontWeight: 500, color: '#f0f0f0', marginBottom: 12 }}>Intelligence Feed</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {brainFeed.slice(0, 5).map((item, idx) => (
                <div key={idx} className="fiducia-card" style={{ padding: '12px 20px', marginBottom: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      display: 'inline-block',
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: item.priority === 2 ? '#EF4444' : item.priority === 1 ? '#F59E0B' : '#34D399',
                    }} />
                    <span style={{ color: '#f0f0f0', fontWeight: 500 }}>{item.title}</span>
                  </div>
                  <p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 20, fontWeight: 500, color: '#f0f0f0', marginBottom: 12 }}>Recommended Actions</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recommendations.slice(0, 5).map((rec, idx) => (
                <div key={idx} className="fiducia-card" style={{ padding: '12px 20px', marginBottom: 0 }}>
                  <span style={{ color: '#f0f0f0' }}>{rec.recommendation_text}</span>
                  <span style={{ color: 'rgba(255,255,255,0.3)', marginLeft: 8 }}>• {rec.action_type}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
          <a href="/scan" className="fiducia-button fiducia-button-primary">Scan Register</a>
          <a href="/community" className="fiducia-button fiducia-button-secondary">Community</a>
          <a href="/review-center" className="fiducia-button fiducia-button-ghost">Review Center</a>
        </div>
      </div>
    </Layout>
  );
}
