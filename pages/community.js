import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import Layout from '../components/Layout';

const ORG_ID = 'demo-org';

export default function CommunityPage() {
  const [people, setPeople] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [pendingReviews, setPendingReviews] = useState([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState({ first_name: '', last_name: '', phone: '', type: 'visitor' });
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({ first_name: '', phone: '', type: '' });
  const [showDeleted, setShowDeleted] = useState(false);

  // Selection state
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const longPressTimer = useRef(null);
  const longPressTarget = useRef(null);

  useEffect(() => {
    fetchPeople();
    fetchPendingReviews();
  }, [showDeleted]);

  const fetchPeople = async () => {
    const res = await fetch(`/api/people?organization_id=${ORG_ID}&include_deleted=${showDeleted}`);
    const data = await res.json();
    if (Array.isArray(data)) { setPeople(data); setLoading(false); }
  };

  const fetchPendingReviews = async () => {
    const res = await fetch(`/api/pending-reviews?church_id=${ORG_ID}`);
    const data = await res.json();
    if (Array.isArray(data)) setPendingReviews(data);
  };

  useEffect(() => {
    let result = [...people];
    if (roleFilter !== 'all') result = result.filter(p => p.type === roleFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        (p.first_name || '').toLowerCase().includes(q) ||
        (p.last_name || '').toLowerCase().includes(q) ||
        (p.phone || '').includes(q)
      );
    }
    setFiltered(result);
  }, [people, search, roleFilter]);

  const addPerson = async e => {
    e.preventDefault();
    const res = await fetch('/api/people', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, organization_id: ORG_ID }),
    });
    const data = await res.json();
    if (data.id) {
      setPeople(prev => [data, ...prev]);
      setForm({ first_name: '', last_name: '', phone: '', type: 'visitor' });
      setShowAddForm(false);
      setMessage(`✅ ${data.first_name} added`);
      setTimeout(() => setMessage(''), 3000);
    } else setMessage('Error: ' + (data.error || 'Could not add'));
  };
    const startEdit = person => {
    setEditingId(person.id);
    setEditValues({ first_name: person.first_name || '', phone: person.phone || '', type: person.type || 'visitor' });
  };
  const saveEdit = async id => {
    const res = await fetch('/api/people', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...editValues, organization_id: ORG_ID }),
    });
    const data = await res.json();
    if (data.id) {
      setPeople(prev => prev.map(p => p.id === id ? { ...p, ...editValues } : p));
      setEditingId(null);
      setMessage('✅ Updated');
      setTimeout(() => setMessage(''), 3000);
    } else setMessage('Error: ' + (data.error || 'Update failed'));
  };
  const cancelEdit = () => setEditingId(null);

  const handleDeleteSingle = async personId => {
    if (!confirm('Move to trash?')) return;
    await fetch('/api/people/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: personId }) });
    setPeople(prev => prev.filter(p => p.id !== personId));
  };

  const bulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Move ${selectedIds.size} selected people to trash?`)) return;
    for (const id of selectedIds) {
      await fetch('/api/people/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    }
    setPeople(prev => prev.filter(p => !selectedIds.has(p.id)));
    setSelectedIds(new Set());
    setSelectMode(false);
    setMessage(`🗑️ Trashed ${selectedIds.size} people`);
    setTimeout(() => setMessage(''), 3000);
  };

  const handleRestore = async personId => {
    await fetch('/api/people/restore', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: personId }) });
    fetchPeople();
    setMessage('🔄 Restored');
    setTimeout(() => setMessage(''), 3000);
  };

  const testSMS = async (phone, name) => {
    if (!phone) { alert('No phone number.'); return; }
    const res = await fetch('/api/send-whatsapp-test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, first_name: name }) });
    const data = await res.json();
    if (data.success) alert(`✅ SMS sent (ID: ${data.messageId})`);
    else alert(`❌ ${data.error}`);
  };

  const handleApproveReview = async (reviewId, corrected) => {
    await fetch('/api/pending-reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: reviewId, action: 'approve', corrected }) });
    fetchPeople();
    fetchPendingReviews();
    setMessage('✅ Approved');
    setTimeout(() => setMessage(''), 3000);
  };
  const handleRejectReview = async reviewId => {
    await fetch('/api/pending-reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: reviewId, action: 'reject' }) });
    fetchPendingReviews();
    setMessage('❌ Rejected');
    setTimeout(() => setMessage(''), 3000);
  };

  // Long press logic
  const onPointerDown = useCallback((personId) => {
    longPressTarget.current = personId;
    longPressTimer.current = setTimeout(() => {
      setSelectMode(true);
      setSelectedIds(prev => new Set(prev).add(personId));
      if (navigator.vibrate) navigator.vibrate(50);
    }, 2000);
  }, []);

  const onPointerUp = useCallback(() => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    longPressTarget.current = null;
  }, []);

  const onPointerLeave = useCallback(() => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  }, []);

  const toggleSelection = (personId) => {
    if (!selectMode) return;
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(personId)) newSet.delete(personId); else newSet.add(personId);
      return newSet;
    });
  };

  const cancelSelectMode = () => { setSelectMode(false); setSelectedIds(new Set()); };
  const selectAll = () => setSelectedIds(new Set(filtered.map(p => p.id)));

  if (loading) return <Layout><div style={{padding:20}}><p>Loading community...</p></div></Layout>;
  return (
    <Layout>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px' }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, color: '#f0f0f0', marginBottom: 25 }}>👥 Community</h1>

        {/* Selection mode bar */}
        {selectMode && (
          <div style={selectBar}>
            <span style={{ color: '#f0f0f0', fontWeight: 600 }}>{selectedIds.size} selected</span>
            <button onClick={selectAll} style={barBtn}>☑️ Select All</button>
            <button onClick={bulkDelete} style={{ ...barBtn, background: '#EF4444' }}>🗑️ Delete</button>
            <button onClick={cancelSelectMode} style={barBtn}>✕ Cancel</button>
          </div>
        )}

        {/* Pending reviews banner */}
        {pendingReviews.length > 0 && (
          <div style={reviewBanner}>
            <span style={{ fontWeight: 600 }}>🔍 {pendingReviews.length} names need your review</span>
            <button onClick={() => document.getElementById('reviews-section').scrollIntoView({ behavior: 'smooth' })} style={reviewBtn}>
              Review Now
            </button>
          </div>
        )}

        {/* Controls */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20, alignItems: 'center' }}>
          <input type="text" placeholder="🔍 Search name or phone" value={search} onChange={e => setSearch(e.target.value)} style={searchStyle} />
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={selectStyle}>
            <option value="all">All</option>
            <option value="visitor">Visitor</option>
            <option value="member">Member</option>
            <option value="volunteer">Volunteer</option>
            <option value="leader">Leader</option>
            <option value="staff">Staff</option>
          </select>
          <button onClick={() => setShowDeleted(!showDeleted)} style={{ padding: '10px 18px', background: showDeleted ? '#f44336' : '#4CAF50', color: 'white', border: 'none', borderRadius: 12, fontWeight: 600, cursor: 'pointer' }}>
            {showDeleted ? '📋 Active' : '🗑️ Trash'}
          </button>
          <button onClick={() => setShowAddForm(!showAddForm)} style={{ padding: '10px 18px', background: '#4F46E5', color: 'white', border: 'none', borderRadius: 12, fontWeight: 600, cursor: 'pointer' }}>
            ➕ Add Person
          </button>
        </div>

        {/* Add form */}
        {showAddForm && (
          <form onSubmit={addPerson} style={formCard}>
            <input placeholder="First Name" value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} required style={miniInput} />
            <input placeholder="Last Name" value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} style={miniInput} />
            <input placeholder="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required style={miniInput} />
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} style={miniInput}>
              <option value="visitor">Visitor</option>
              <option value="member">Member</option>
              <option value="volunteer">Volunteer</option>
              <option value="leader">Leader</option>
              <option value="staff">Staff</option>
            </select>
            <button type="submit" style={{ padding: '10px 20px', background: '#4F46E5', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', alignSelf: 'flex-start' }}>Save</button>
          </form>
        )}

        {message && <div style={msgStyle}>{message}</div>}

        {/* Review Section */}
        {pendingReviews.length > 0 && (
          <div id="reviews-section" style={{ marginBottom: 30 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
              <h2 style={{ fontSize: 22, fontWeight: 600, color: '#f0f0f0' }}>🔍 Need Review ({pendingReviews.length})</h2>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => { const allIds = pendingReviews.map(r => r.id); Promise.all(allIds.map(id => handleApproveReview(id))).then(() => { fetchPeople(); fetchPendingReviews(); }); }} style={approveBtn}>✅ Approve All</button>
                <button onClick={() => { const allIds = pendingReviews.map(r => r.id); Promise.all(allIds.map(id => handleRejectReview(id))).then(() => fetchPendingReviews()); }} style={rejectBtn}>❌ Reject All</button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {pendingReviews.map(review => (
                <div key={review.id} style={reviewCard}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 18, color: '#f0f0f0' }}>{review.first_name}</div>
                      <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>{review.phone || 'No phone'}</div>
                    </div>
                    <span style={{ background: '#D4AF37', color: '#0A1128', padding: '2px 8px', borderRadius: 12, fontSize: 12 }}>{review.confidence}%</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => handleApproveReview(review.id)} style={smallGreen}>✓ Approve</button>
                    <button onClick={() => handleRejectReview(review.id)} style={smallRed}>✕ Reject</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* People cards */}
        <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 15, color: '#f0f0f0' }}>{showDeleted ? 'Trash' : 'All People'} ({filtered.length})</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {filtered.map(person => (
            <div
              key={person.id}
              onPointerDown={() => onPointerDown(person.id)}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerLeave}
              onClick={() => toggleSelection(person.id)}
              style={{
                background: selectedIds.has(person.id) ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.03)',
                backdropFilter: 'blur(10px)',
                borderRadius: 16,
                padding: 20,
                border: selectedIds.has(person.id) ? '1px solid #D4AF37' : '1px solid rgba(255,255,255,0.06)',
                cursor: 'pointer',
                userSelect: 'none',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 18, color: '#f0f0f0' }}>{person.first_name} {person.last_name}</div>
                <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 12, background: person.type === 'visitor' ? 'rgba(212,175,55,0.2)' : 'rgba(52,211,153,0.2)', color: person.type === 'visitor' ? '#D4AF37' : '#34D399' }}>
                  {person.type || 'visitor'}
                </span>
              </div>
              <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, marginBottom: 12 }}>{person.phone || '—'}</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => startEdit(person)} style={iconBtn}>✏️</button>
                <button onClick={() => handleDeleteSingle(person.id)} style={iconBtn}>🗑️</button>
                <button onClick={() => testSMS(person.phone, person.first_name)} style={{ ...iconBtn, color: '#34D399' }}>📩 Test</button>
                <Link href={`/person/${person.id}`} style={{ ...iconBtn, color: '#60A5FA' }}>📋</Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}

// Styles for community page (place after component)
const searchStyle = { flex: 1, minWidth: 200, padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#fff', outline: 'none' };
const selectStyle = { padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#fff', cursor: 'pointer' };
const selectBar = { position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)', background: '#1f2937', borderRadius: 20, padding: '12px 24px', display: 'flex', gap: 20, alignItems: 'center', zIndex: 1001, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' };
const barBtn = { background: '#4F46E5', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 600, cursor: 'pointer', fontSize: 14 };
const reviewBanner = { background: 'rgba(212,175,55,0.1)', backdropFilter: 'blur(10px)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: 16, padding: '14px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', color: '#f0f0f0' };
const reviewBtn = { marginLeft: 16, padding: '6px 14px', background: '#D4AF37', color: '#0A1128', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 };
const formCard = { background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(10px)', borderRadius: 16, padding: 20, marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 12, border: '1px solid rgba(255,255,255,0.06)' };
const miniInput = { padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#fff', outline: 'none' };
const msgStyle = { background: 'rgba(52,211,153,0.15)', padding: 10, borderRadius: 12, marginBottom: 15, color: '#34D399' };
const approveBtn = { padding: '8px 16px', background: '#34D399', color: '#000', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 };
const rejectBtn = { padding: '8px 16px', background: '#EF4444', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 };
const reviewCard = { background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(10px)', borderRadius: 16, padding: 20, borderLeft: '4px solid #D4AF37', border: '1px solid rgba(255,255,255,0.06)' };
const smallGreen = { padding: '6px 12px', background: '#34D399', color: '#000', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 };
const smallRed = { padding: '6px 12px', background: '#EF4444', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 };
const iconBtn = { background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 16, marginRight: 8 };
