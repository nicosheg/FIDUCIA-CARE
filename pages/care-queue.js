import { useState, useEffect } from 'react';
import Layout from '../components/Layout';

const ORG_ID = 'demo-org';

export default function CareQueue() {
  const [queue, setQueue] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/care-queue?organization_id=${ORG_ID}`)
      .then(r => r.json())
      .then(data => {
        setQueue(data);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <Layout>
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <div className="fiducia-card shimmer" style={{ padding: '24px 28px', maxWidth: 500, margin: '0 auto' }}>
            <div style={{ height: 24, width: '80%', borderRadius: 8 }} />
            <div style={{ height: 24, width: '50%', borderRadius: 8, marginTop: 10 }} />
          </div>
        </div>
      </Layout>
    );
  }

  const items = queue?.items || [];
  const empty = items.length === 0;

  return (
    <Layout>
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '40px 20px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, color: '#f0f0f0', marginBottom: 24 }}>
          Care Queue
        </h1>
        {empty ? (
          <div className="fiducia-card" style={{ padding: '24px 28px', textAlign: 'center' }}>
            <p className="aria-speaks" style={{ fontSize: 18, margin: 0 }}>
              Everyone is well taken care of today.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {items.map((item, i) => (
              <div key={i} className="fiducia-card" style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p className="aria-speaks" style={{ margin: 0, fontSize: 17 }}>{item}</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => {
                      // Quick action: Draft & Send WhatsApp
                      const personId = item.person_id; // we'll need to store person_id in the items from backend
                      if (personId) window.location.href = `/api/presence/draft?person_id=${personId}`;
                    }}
                    className="fiducia-button fiducia-button-primary"
                    style={{ padding: '8px 16px', fontSize: 13 }}
                  >
                    Draft WhatsApp
                  </button>
                  <button className="fiducia-button fiducia-button-secondary" style={{ padding: '8px 16px', fontSize: 13 }}>
                    View
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
