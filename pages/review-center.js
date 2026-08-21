// pages/review-center.js
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import Layout from '../components/Layout';

export default function ReviewCenter() {
  const [reviews, setReviews] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const fetchReviews = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/identity/review-items', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      const data = await res.json();
      if (data.items) {
        setReviews(data.items);
        setStats(data.stats);
      }
    } catch (e) {
      console.error('Fetch reviews error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, []);

  const handleAction = async (personId, matchedId, action) => {
    if (!confirm(`Are you sure you want to ${action} these two records?`)) return;
    setMessage('Processing...');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setMessage('❌ You must be logged in.');
      return;
    }
    try {
      const res = await fetch('/api/identity/review-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          person_id: personId,
          matched_person_id: matchedId,
          action,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage(`✅ ${action === 'merge' ? 'Merged' : 'Kept separate'} successfully.`);
        fetchReviews();
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage('❌ Error: ' + data.error);
      }
    } catch (err) {
      setMessage('❌ Network error');
    }
  };

  if (loading) {
    return (
      <Layout>
        <div style={{ padding: 20, color: '#f0f0f0' }}>Loading reviews...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: 20 }}>
        <h1 style={{ color: '#f0f0f0', fontSize: 28 }}>ARIA Review Center</h1>
        <p style={{ color: 'rgba(255,255,255,0.6)' }}>
          {stats.total} pending reviews ({stats.needs_decision} needs decision, {stats.conflict} conflict)
        </p>

        {message && (
          <div style={{ padding: 10, background: 'rgba(255,255,255,0.05)', borderRadius: 8, marginBottom: 20, color: '#f0f0f0' }}>
            {message}
          </div>
        )}

        {reviews.length === 0 ? (
          <div style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 40 }}>
            No pending reviews. ARIA is satisfied.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {reviews.map((review) => (
              <div
                key={review.person_id}
                style={{
                  background: 'rgba(20,25,40,0.9)',
                  borderRadius: 16,
                  padding: 20,
                  border: '1px solid rgba(255,255,255,0.05)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ color: '#f0f0f0', margin: '0 0 4px' }}>
                      ⚠ Possible Duplicate
                    </h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
                      <div>
                        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Person A</div>
                        <div style={{ color: '#f0f0f0', fontWeight: 500 }}>{review.person_name}</div>
                        <div style={{ color: 'rgba(255,255,255,0.4)' }}>{review.person_phone || 'No phone'}</div>
                      </div>
                      <div>
                        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Person B</div>
                        <div style={{ color: '#f0f0f0', fontWeight: 500 }}>{review.matched_person_name}</div>
                        <div style={{ color: 'rgba(255,255,255,0.4)' }}>{review.matched_person_phone || 'No phone'}</div>
                      </div>
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Evidence</div>
                      <ul style={{ margin: '4px 0 0', paddingLeft: 20, color: '#D4AF37' }}>
                        {review.reasons && review.reasons.length > 0 ? (
                          review.reasons.map((reason, idx) => (
                            <li key={idx} style={{ marginBottom: 2 }}>
                              {reason.replace(/_/g, ' ')}
                            </li>
                          ))
                        ) : (
                          <li>No reasons provided</li>
                        )}
                      </ul>
                      <div style={{ marginTop: 6, color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>
                        Score: {review.score}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginLeft: 20 }}>
                    <button
                      onClick={() => handleAction(review.person_id, review.matched_person_id, 'merge')}
                      style={{
                        padding: '10px 20px',
                        borderRadius: 30,
                        border: 'none',
                        background: 'rgba(52,211,153,0.2)',
                        color: '#34D399',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Merge
                    </button>
                    <button
                      onClick={() => handleAction(review.person_id, review.matched_person_id, 'keep_separate')}
                      style={{
                        padding: '10px 20px',
                        borderRadius: 30,
                        border: 'none',
                        background: 'rgba(239,68,68,0.2)',
                        color: '#EF4444',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Keep Separate
                    </button>
                  </div>
                </div>
                <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>
                  Status: {review.status} · {review.decision || 'unknown'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
        }
