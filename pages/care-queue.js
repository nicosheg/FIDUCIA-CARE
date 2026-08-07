import { useState, useEffect } from 'react';
import Layout from '../components/Layout'; // ✅ correct path

export default function CareQueue() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

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
        <h1 style={{ fontSize: 28, fontWeight: 600, color: '#f0f0f0', marginBottom: 24 }}>
          Care Queue
          <span style={{ fontSize: 16, fontWeight: 400, color: 'rgba(255,255,255,0.3)', marginLeft: 12 }}>
            {items.length} items
          </span>
        </h1>

        {items.length === 0 ? (
          <div className="fiducia-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <p className="aria-speaks" style={{ fontSize: 18, margin: 0 }}>Everyone is well cared for today.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {items.map((item, idx) => (
              <div key={idx} className="fiducia-card" style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p className="aria-speaks" style={{ margin: 0, fontSize: 17 }}>{item.text}</p>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>
                    Priority: {item.priority}
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
                        const message = encodeURIComponent("Just checking in – how are you doing?");
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

        <button
          onClick={fetchQueue}
          className="fiducia-button fiducia-button-secondary"
          style={{ marginTop: 20, width: '100%' }}
        >
          Refresh
        </button>
      </div>
    </Layout>
  );
}
