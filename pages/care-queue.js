import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';

// Glow SVG for priority indicators (no emojis)
const PriorityDot = ({ priority }) => {
  const colors = {
    high: '#EF4444',
    medium: '#F59E0B',
    low: '#34D399',
  };
  const color = colors[priority] || '#6B7280';
  return (
    <svg width="10" height="10" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="8" fill={color} opacity="0.15" />
      <circle cx="10" cy="10" r="4" fill={color} opacity="0.5" />
      <circle cx="10" cy="10" r="2" fill={color}>
        <animate attributeName="opacity" values="0.5;1;0.5" dur="1.5s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
};

export default function CareQueue() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  // Fetch queue items
  const fetchQueue = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/care-queue?status=pending');
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

  // Generate new suggestions (ARIA intelligence)
  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await fetch('/api/care-queue/generate', { method: 'POST' });
      await fetchQueue();
    } catch (e) {
      console.error(e);
    } finally {
      setGenerating(false);
    }
  };

  // Mark item as completed
  const handleComplete = async (id) => {
    try {
      await fetch('/api/care-queue', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'completed' }),
      });
      setItems(items.filter(item => item.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  // Dismiss item
  const handleDismiss = async (id) => {
    try {
      await fetch('/api/care-queue', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'dismissed' }),
      });
      setItems(items.filter(item => item.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  // Open WhatsApp with drafted message
  const handleWhatsApp = (phone, message) => {
    if (!phone) return alert('No phone number for this person.');
    const clean = phone.startsWith('+') ? phone.substring(1) : phone;
    window.open(`https://wa.me/${clean}?text=${encodeURIComponent(message)}`, '_blank');
  };

  return (
    <Layout>
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '30px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 600, color: '#f0f0f0' }}>
            Care Queue
            <span style={{ fontSize: 16, fontWeight: 400, color: 'rgba(255,255,255,0.3)', marginLeft: 12 }}>
              {items.length} pending
            </span>
          </h1>
          <button
            onClick={handleGenerate}
            disabled={generating}
            style={{
              background: 'rgba(212,175,55,0.1)',
              border: '1px solid rgba(212,175,55,0.3)',
              color: '#D4AF37',
              padding: '8px 16px',
              borderRadius: 20,
              fontSize: 13,
              fontWeight: 500,
              cursor: generating ? 'default' : 'pointer',
              opacity: generating ? 0.5 : 1,
            }}
          >
            {generating ? 'Thinking…' : '✨ ARIA Scan'}
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'rgba(255,255,255,0.2)' }}>
            Loading your care queue…
          </div>
        ) : items.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '60px 20px',
            borderRadius: 16,
            border: '1px dashed rgba(255,255,255,0.06)',
          }}>
            <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 18 }}>
              No pending care items.
            </p>
            <p style={{ color: 'rgba(255,255,255,0.1)', fontSize: 14, marginTop: 8 }}>
              ARIA will suggest actions when they arise.
            </p>
            <button
              onClick={handleGenerate}
              style={{
                marginTop: 20,
                background: 'transparent',
                border: '1px solid rgba(212,175,55,0.2)',
                color: '#D4AF37',
                padding: '8px 20px',
                borderRadius: 20,
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              Run ARIA Scan
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {items.map(item => (
              <div
                key={item.id}
                style={{
                  padding: '16px 20px',
                  borderRadius: 12,
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 14,
                }}
              >
                {/* Priority dot */}
                <div style={{ marginTop: 4 }}>
                  <PriorityDot priority={item.priority} />
                </div>

                {/* Content */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ color: '#f0f0f0', fontWeight: 600, fontSize: 16 }}>
                      {item.person?.display_name || 'Unknown'}
                    </span>
                    <span style={{
                      fontSize: 11,
                      padding: '2px 10px',
                      borderRadius: 12,
                      background: `rgba(${item.priority === 'high' ? '239,68,68' : item.priority === 'medium' ? '245,158,11' : '52,211,153'}, 0.15)`,
                      color: item.priority === 'high' ? '#EF4444' : item.priority === 'medium' ? '#F59E0B' : '#34D399',
                      fontWeight: 500,
                      textTransform: 'capitalize',
                    }}>
                      {item.priority}
                    </span>
                  </div>
                  <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, margin: '6px 0 10px', lineHeight: 1.5 }}>
                    {item.suggestion}
                  </p>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => handleComplete(item.id)}
                      style={{
                        background: 'rgba(52,211,153,0.1)',
                        border: '1px solid rgba(52,211,153,0.2)',
                        color: '#34D399',
                        padding: '4px 14px',
                        borderRadius: 16,
                        fontSize: 12,
                        cursor: 'pointer',
                        fontWeight: 500,
                      }}
                    >
                      ✓ Done
                    </button>
                    {item.person?.phone && (
                      <button
                        onClick={() => handleWhatsApp(item.person.phone, item.suggestion)}
                        style={{
                          background: 'rgba(37,211,102,0.1)',
                          border: '1px solid rgba(37,211,102,0.2)',
                          color: '#25D366',
                          padding: '4px 14px',
                          borderRadius: 16,
                          fontSize: 12,
                          cursor: 'pointer',
                          fontWeight: 500,
                        }}
                      >
                        Message
                      </button>
                    )}
                    <button
                      onClick={() => window.location.href = `/person/${item.person_id}`}
                      style={{
                        background: 'transparent',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: 'rgba(255,255,255,0.4)',
                        padding: '4px 14px',
                        borderRadius: 16,
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      Profile
                    </button>
                    <button
                      onClick={() => handleDismiss(item.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'rgba(255,255,255,0.15)',
                        padding: '4px 8px',
                        fontSize: 12,
                        cursor: 'pointer',
                        marginLeft: 'auto',
                      }}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
    }
