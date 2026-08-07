import { useState, useEffect } from 'react';
import Layout from '../components/Layout';

export default function CareQueue() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  const fetchQueue = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/care-queue?organization_id=demo-org');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setItems(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // "ARIA Scan" – triggers a fresh intelligence scan
  const runAriaScan = async () => {
    setScanning(true);
    try {
      // POST to the same API with a flag to regenerate intelligence
      await fetch('/api/care-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'scan' }),
      });
      // Then re-fetch the updated queue
      await fetchQueue();
    } catch (e) {
      console.error(e);
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  if (loading) {
    return (
      <Layout>
        <div style={{ padding: '40px 20px', maxWidth: 700, margin: '0 auto' }}>
          <div className="fiducia-card shimmer" style={{ padding: '24px 28px' }}>
            <div style={{ height: 24, width: '70%', borderRadius: 8 }} />
            <div style={{ height: 24, width: '50%', borderRadius: 8, marginTop: 10 }} />
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '40px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 600, color: '#f0f0f0' }}>
            Care Queue
            <span style={{ fontSize: 16, fontWeight: 400, color: 'rgba(255,255,255,0.3)', marginLeft: 12 }}>
              {items.length} items
            </span>
          </h1>
          <button
            onClick={runAriaScan}
            disabled={scanning}
            className="fiducia-button fiducia-button-primary"
            style={{ padding: '8px 16px', fontSize: 13, opacity: scanning ? 0.6 : 1 }}
          >
            {scanning ? 'Scanning…' : 'ARIA Scan'}
          </button>
        </div>

        {items.length === 0 ? (
          <div className="fiducia-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <p className="aria-speaks" style={{ fontSize: 18, margin: 0 }}>
              ARIA is looking after everyone. No pending care items.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {items.map((item, idx) => (
              <div key={idx} className="fiducia-card" style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p className="aria-speaks" style={{ margin: 0, fontSize: 17 }}>{item.text}</p>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>
                    {item.priority === 'high' ? 'High priority' : 'Medium priority'}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="fiducia-button fiducia-button-primary"
                    style={{ padding: '8px 16px', fontSize: 13 }}
                    onClick={() => {
                      const phone = item.phone || '';
                      if (phone) {
                        const clean = phone.startsWith('+') ? phone.substring(1) : phone;
                        // ARIA drafts a warm message
                        const message = encodeURIComponent(
                          `Hello ${item.first_name || ''}, just checking in – ARIA wanted me to see how you're doing.`
                        );
                        window.open(`https://wa.me/${clean}?text=${message}`, '_blank');
                      } else {
                        alert('No phone number for this person.');
                      }
                    }}
                  >
                    Message
                  </button>
                  <button
                    className="fiducia-button fiducia-button-ghost"
                    style={{ padding: '8px 16px', fontSize: 13 }}
                    onClick={() => window.location.href = `/person/${item.person_id}`}
                  >
                    Profile
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
