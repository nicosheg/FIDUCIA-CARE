import { useState, useEffect } from 'react';
import Layout from '../components/Layout';

const CHURCH_ID = 'demo-church';

export default function MembersPage() {
  const [members, setMembers] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [pendingReviews, setPendingReviews] = useState([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState({ full_name: '', phone: '' });
  const [editReview, setEditReview] = useState(null);

  useEffect(() => {
    fetchMembers();
    fetchPendingReviews();
  }, []);

  const fetchMembers = async () => {
    const res = await fetch(`/api/members?church_id=${CHURCH_ID}`);
    const data = await res.json();
    if (Array.isArray(data)) { setMembers(data); setLoading(false); }
  };

  const fetchPendingReviews = async () => {
    const res = await fetch(`/api/pending-reviews?church_id=${CHURCH_ID}`);
    const data = await res.json();
    if (Array.isArray(data)) setPendingReviews(data);
  };

  useEffect(() => {
    let result = [...members];
    if (typeFilter !== 'all') {
      result = result.filter(m => m.type === typeFilter || (typeFilter === 'member' && !m.type));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(m =>
        (m.first_name || '').toLowerCase().includes(q) ||
        (m.phone && m.phone.includes(q))
      );
    }
    result.sort((a, b) => {
      if ((a.type === 'member') !== (b.type === 'member')) return a.type === 'member' ? -1 : 1;
      return (a.first_name || '').localeCompare(b.first_name || '');
    });
    setFiltered(result);
  }, [members, search, typeFilter]);

  const addMember = async (e) => {
    e.preventDefault();
    const res = await fetch('/api/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        first_name: form.full_name,
        last_name: '',
        phone: form.phone,
        church_id: CHURCH_ID,
        type: 'member',
      }),
    });
    const data = await res.json();
    if (data?.id) {
      setMembers(prev => [data, ...prev]);
      setForm({ full_name: '', phone: '' });
      setShowAddForm(false);
      setMessage(`✅ ${data.first_name} added`);
      setTimeout(() => setMessage(''), 3000);
    } else setMessage('Error: ' + (data.error || 'Could not add'));
  };

  const handleDelete = async (memberId) => {
    if (!confirm('Remove this person?')) return;
    await fetch('/api/members/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: memberId }),
    });
    setMembers(prev => prev.filter(m => m.id !== memberId));
  };

  const handleApproveReview = async (reviewId, corrected) => {
    await fetch('/api/pending-reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: reviewId,
        action: 'approve',
        corrected: corrected ? {
          first_name: corrected.full_name,
          last_name: '',
          phone: corrected.phone
        } : null,
      }),
    });
    fetchMembers();
    fetchPendingReviews();
    setEditReview(null);
    setMessage('✅ Member approved and added');
    setTimeout(() => setMessage(''), 3000);
  };

  const handleRejectReview = async (reviewId) => {
    await fetch('/api/pending-reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: reviewId, action: 'reject' }),
    });
    fetchPendingReviews();
    setMessage('❌ Entry rejected');
    setTimeout(() => setMessage(''), 3000);
  };

  if (loading) return <p>Loading...</p>;

  return (
    <Layout>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 20 }}>👥 Members</h1>

        {pendingReviews.length > 0 && (
          <div style={{ background: 'rgba(255,152,0,0.15)', backdropFilter: 'blur(5px)', border: '1px solid #ff9800', borderRadius: 16, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600 }}>🔍 {pendingReviews.length} names need your review</span>
            <button onClick={() => document.getElementById('reviews-section').scrollIntoView({ behavior: 'smooth' })} style={{ marginLeft: 16, padding: '6px 14px', background: '#ff9800', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Review Now</button>
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20, alignItems: 'center' }}>
          <input type="text" placeholder="🔍 Search name or phone" value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, minWidth: 200, padding: '10px 14px', borderRadius: 12, border: '1px solid #ddd', background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(5px)', outline: 'none' }} />
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid #ddd', background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(5px)', cursor: 'pointer' }}>
            <option value="all">All ({members.length})</option>
            <option value="member">Members ({members.filter(m => m.type === 'member' || !m.type).length})</option>
            <option value="visitor">Visitors ({members.filter(m => m.type === 'visitor').length})</option>
          </select>
          <button onClick={() => setShowAddForm(!showAddForm)} style={{ padding: '10px 18px', background: '#4F46E5', color: 'white', border: 'none', borderRadius: 12, fontWeight: 600, cursor: 'pointer' }}>➕ Add Member</button>
        </div>

        {showAddForm && (
          <form onSubmit={addMember} style={{ background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)', borderRadius: 16, padding: 20, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input placeholder="Full Name (e.g., Bro Jerry)" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} required style={{ padding: '10px', borderRadius: 8, border: '1px solid #ddd' }} />
            <input placeholder="Phone (080...)" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required style={{ padding: '10px', borderRadius: 8, border: '1px solid #ddd' }} />
            <button type="submit" style={{ padding: '10px 20px', background: '#4F46E5', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>Save</button>
          </form>
        )}

        {message && <div style={{ background: '#e8f5e9', padding: 10, borderRadius: 12, marginBottom: 15 }}>{message}</div>}

        {pendingReviews.length > 0 && (
          <div id="reviews-section" style={{ marginBottom: 30 }}>
            <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 15 }}>🔍 Need Review ({pendingReviews.length})</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {pendingReviews.map(review => (
                <div key={review.id} style={{ background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)', borderRadius: 16, padding: 20, boxShadow: '0 8px 32px rgba(0,0,0,0.08)', borderLeft: '4px solid #ff9800' }}>
                  {editReview === review.id ? (
                    <div>
                      <input style={{ padding: '10px', borderRadius: 8, border: '1px solid #ddd', width: '100%', marginBottom: 8 }} value={review.first_name} onChange={e => setPendingReviews(prev => prev.map(r => r.id === review.id ? { ...r, first_name: e.target.value } : r))} placeholder="Full name" />
                      <input style={{ padding: '10px', borderRadius: 8, border: '1px solid #ddd', width: '100%', marginBottom: 8 }} value={review.phone} onChange={e => setPendingReviews(prev => prev.map(r => r.id === review.id ? { ...r, phone: e.target.value } : r))} placeholder="Phone" />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => handleApproveReview(review.id, { full_name: review.first_name, phone: review.phone })} style={{ padding: '6px 12px', background: '#4CAF50', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>✓ Confirm</button>
                        <button onClick={() => setEditReview(null)} style={{ padding: '6px 12px', background: '#9e9e9e', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 18 }}>{review.first_name}</div>
                          <div style={{ color: '#666', fontSize: 14, marginTop: 4 }}>{review.phone || 'No phone'}</div>
                        </div>
                        <span style={{ background: '#ff9800', color: '#fff', padding: '2px 8px', borderRadius: 12, fontSize: 12, alignSelf: 'flex-start' }}>{review.confidence}%</span>
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                        <button onClick={() => setEditReview(review.id)} style={{ padding: '6px 12px', background: '#2196F3', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>✏️ Edit</button>
                        <button onClick={() => handleApproveReview(review.id, null)} style={{ padding: '6px 12px', background: '#4CAF50', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>✓ Approve</button>
                        <button onClick={() => handleRejectReview(review.id)} style={{ padding: '6px 12px', background: '#f44336', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>✕ Reject</button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 15 }}>All Members</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 16 }}>
          {filtered.map(member => (
            <div key={member.id} style={{ background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)', borderRadius: 16, padding: 20, boxShadow: '0 8px 32px rgba(0,0,0,0.08)', transition: 'transform 0.2s' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 18 }}>{member.first_name}</div>
                <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 12, color: '#fff', background: member.type === 'visitor' ? '#f0ad4e' : '#5cb85c', textTransform: 'capitalize' }}>{member.type || 'member'}</span>
              </div>
              <div style={{ color: '#666', fontSize: 14, marginBottom: 12 }}>{member.phone || 'No phone'}</div>
              <button onClick={() => handleDelete(member.id)} style={{ background: 'transparent', border: '1px solid #f44336', color: '#f44336', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontWeight: 600 }}>🗑️ Remove</button>
            </div>
          ))}
        </div>
        {filtered.length === 0 && pendingReviews.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>No members yet. Add your first member or scan an attendance sheet.</div>}
      </div>
    </Layout>
  );
}
