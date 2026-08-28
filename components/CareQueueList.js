// components/CareQueueList.js
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function CareQueueList() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');

  const fetchQueue = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/care-queue', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) {
        throw new Error('Failed to fetch care queue.');
      }

      const data = await res.json();

      if (!Array.isArray(data)) {
        throw new Error('Invalid care queue response.');
      }

      setItems(data);
    } catch (e) {
      console.error('Care queue fetch error:', e);
      setError(e.message || 'Unable to load the care queue.');
    } finally {
      setLoading(false);
    }
  };

  const runAriaScan = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setError('You must be logged in to run an ARIA scan.');
      return;
    }

    setScanning(true);
    setError('');

    try {
      const res = await fetch('/api/care-queue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: 'scan',
        }),
      });

      if (!res.ok) {
        let errorMessage = 'ARIA could not complete the care scan.';

        try {
          const data = await res.json();

          if (data?.error) {
            errorMessage = data.error;
          } else if (data?.message) {
            errorMessage = data.message;
          }
        } catch {
          // Keep the default error message if the response is not JSON.
        }

        throw new Error(errorMessage);
      }

      await fetchQueue();
    } catch (e) {
      console.error('ARIA care scan error:', e);
      setError(e.message || 'ARIA could not complete the care scan.');
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  const riskColor = (risk) => {
    if (risk === 'critical') return '#EF4444';
    if (risk === 'high') return '#F59E0B';
    if (risk === 'medium') return '#FBBF24';
    return '#34D399';
  };

  if (loading) {
    return (
      <div
        className="fiducia-card shimmer"
        style={{ padding: '24px 28px' }}
      >
        <div
          style={{
            height: 24,
            width: '70%',
            borderRadius: 8,
          }}
        />

        <div
          style={{
            height: 24,
            width: '50%',
            borderRadius: 8,
            marginTop: 10,
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: 700,
        margin: '0 auto',
        padding: '0 20px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
          gap: 16,
        }}
      >
        <h2
          style={{
            fontSize: 20,
            fontWeight: 500,
            color: '#f0f0f0',
            margin: 0,
          }}
        >
          Care Queue

          <span
            style={{
              fontSize: 16,
              fontWeight: 400,
              color: 'rgba(255,255,255,0.3)',
              marginLeft: 12,
            }}
          >
            {items.length} items
          </span>
        </h2>

        <button
          onClick={runAriaScan}
          disabled={scanning}
          className="fiducia-button fiducia-button-primary"
          style={{
            padding: '8px 16px',
            fontSize: 13,
            opacity: scanning ? 0.6 : 1,
          }}
        >
          {scanning ? 'Scanning…' : 'ARIA Scan'}
        </button>
      </div>

      {error && (
        <div
          className="fiducia-card"
          style={{
            padding: '14px 18px',
            marginBottom: 18,
            borderColor: 'rgba(239,68,68,0.2)',
          }}
        >
          <p
            style={{
              margin: 0,
              color: '#FCA5A5',
              fontSize: 14,
              lineHeight: 1.6,
            }}
          >
            {error}
          </p>
        </div>
      )}

      {items.length === 0 ? (
        <div
          className="fiducia-card"
          style={{
            textAlign: 'center',
            padding: '40px 20px',
          }}
        >
          <p
            className="aria-speaks"
            style={{
              fontSize: 18,
              margin: 0,
            }}
          >
            ARIA is looking after everyone. No pending care items.
          </p>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          {items.map((item, idx) => (
            <div
              key={item.person_id || idx}
              className="fiducia-card"
              style={{
                padding: '16px 24px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 16,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      flexShrink: 0,
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: riskColor(item.risk_level),
                    }}
                  />

                  <p
                    className="aria-speaks"
                    style={{
                      margin: 0,
                      fontSize: 17,
                    }}
                  >
                    {item.text}
                  </p>
                </div>

                <p
                  style={{
                    fontSize: 13,
                    color: 'rgba(255,255,255,0.3)',
                    marginTop: 4,
                    marginBottom: 0,
                  }}
                >
                  {item.engagement_status} · {item.inactivity_streak} weeks
                  inactive
                </p>
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  flexShrink: 0,
                }}
              >
                <button
                  className="fiducia-button fiducia-button-primary"
                  style={{
                    padding: '8px 16px',
                    fontSize: 13,
                  }}
                  onClick={() => {
                    const phone = item.phone || '';

                    if (phone) {
                      const clean = phone.startsWith('+')
                        ? phone.substring(1)
                        : phone;

                      const message = encodeURIComponent(
                        `Hello ${item.first_name || ''}, just checking in – ARIA wanted me to see how you're doing.`
                      );

                      window.open(
                        `https://wa.me/${clean}?text=${message}`,
                        '_blank'
                      );
                    } else {
                      alert('No phone number for this person.');
                    }
                  }}
                >
                  Message
                </button>

                <button
                  className="fiducia-button fiducia-button-ghost"
                  style={{
                    padding: '8px 16px',
                    fontSize: 13,
                  }}
                  onClick={() =>
                    (window.location.href = `/person/${item.person_id}`)
                  }
                >
                  Profile
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
                    }
