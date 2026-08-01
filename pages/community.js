import { useState, useEffect } from 'react';
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

  useEffect(() => {
    fetchPeople();
    fetchPendingReviews();
  }, [showDeleted]);

  const fetchPeople = async () => {
    const res = await fetch(`/api/people?organization_id=${ORG_ID}&include_deleted=${showDeleted}`);
    const data = await res.json();
    if (Array.isArray(data)) {
      setPeople(data);
      setLoading(false);
    }
  };

  const fetchPendingReviews = async () => {
    const res = await fetch(`/api/pending-reviews?church_id=${ORG_ID}`);
    const data = await res.json();
    if (Array.isArray(data)) setPendingReviews(data);
  };

  useEffect(() => {
    let result = [...people];
    if (roleFilter !== 'all') {
      result = result.filter(p => p.type === roleFilter);
    }
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
    } else {
      setMessage('Error: ' + (data.error || 'Update failed'));
    }
  };

  const cancelEdit = () => setEditingId(null);

  const handleDelete = async personId => {
    if (!confirm('Move to trash?')) return;
    await fetch('/api/people/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: personId }),
    });
    setPeople(prev => prev.filter(p => p.id !== personId));
  };

  const handleRestore = async personId => {
    await fetch('/api/people/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: personId }),
    });
    fetchPeople();
    setMessage('🔄 Restored');
    setTimeout(() => setMessage(''), 3000);
  };

  const testSMS = async (phone, name) => {
    // uses existing test endpoint; same as before
    if (!phone) {
      alert('No phone number.');
      return;
    }
    const res = await fetch('/api/send-whatsapp-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, first_name: name }),
    });
    const data = await res.json();
    if (data.success) alert(`✅ SMS sent (ID: ${data.messageId})`);
    else alert(`❌ ${data.error}`);
  };

  const handleApproveReview = async (reviewId, corrected) => {
    await fetch('/api/pending-reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: reviewId, action: 'approve', corrected }),
    });
    fetchPeople();
    fetchPendingReviews();
    setMessage('✅ Approved');
    setTimeout(() => setMessage(''), 3000);
  };

  const handleRejectReview = async reviewId => {
    await fetch('/api/pending-reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: reviewId, action: 'reject' }),
    });
    fetchPendingReviews();
    setMessage('❌ Rejected');
    setTimeout(() => setMessage(''), 3000);
  };

  if (loading) return <Layout><div style={{padding:20}}><p>Loading community...</p></div></Layout>;

  return (
    <Layout>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px' }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, color: '#f0f0f0', marginBottom: 25 }}>👥 Community</h1>

        {/* Pending reviews */}
        {pendingReviews.length > 0 && (
          <div style={{ background: 'rgba(255,152,0,0.15)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,152,0,0.4)', borderRadius: 16, padding: '14px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', color: '#f0f0f0' }}>
            <span style={{ fontWeight: 600 }}>🔍 {pendingReviews.length} names need your review</span>
            <button onClick={() => document.getElementById('reviews-section').scrollIntoView({ behavior: 'smooth' })}
              style={{ marginLeft: 16, padding: '6px 14px', background: '#ff9800', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
              Review Now
            </button>
          </div>
        )}

        {/* Controls */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20, alignItems: 'center' }}>
          <input type="text" placeholder="🔍 Search name or phone" value={search} onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 200, padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(5px)', color: '#fff', outline: 'none' }} />
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
            style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(5px)', color: '#fff', cursor: 'pointer' }}>
            <option value="all">All</option>
            <option value="visitor">Visitor</option>
            <option value="member">Member</option>
            <option value="volunteer">Volunteer</option>
            <option value="leader">Leader</option>
            <option value="staff">Staff</option>
          </select>
          <button onClick={() => setShowDeleted(!showDeleted)}
            style={{ padding: '10px 18px', background: showDeleted ? '#f44336' : '#4CAF50', color: 'white', border: 'none', borderRadius: 12, fontWeight: 600, cursor: 'pointer' }}>
            {showDeleted ? '📋 Active' : '🗑️ Trash'}
          </button>
          <button onClick={() => setShowAddForm(!showAddForm)}
            style={{ padding: '10px 18px', background: '#4F46E5', color: 'white', border: 'none', borderRadius: 12, fontWeight: 600, cursor: 'pointer' }}>
            ➕ Add Person
          </button>
        </div>

        {/* Add form */}
        {showAddForm && (
          <form onSubmit={addPerson} style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(10px)', borderRadius: 16, padding: 20, marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
            <input placeholder="First Name" value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} required style={inputField} />
            <input placeholder="Last Name" value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} style={inputField} />
            <input placeholder="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required style={inputField} />
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} style={inputField}>
              <option value="visitor">Visitor</option>
              <option value="member">Member</option>
              <option value="volunteer">Volunteer</option>
              <option value="leader">Leader</option>
              <option value="staff">Staff</option>
            </select>
            <button type="submit" style={{ padding: '10px 20px', background: '#4F46E5', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', alignSelf: 'flex-start' }}>Save</button>
          </form>
        )}

        {message && <div style={{ background: 'rgba(52,211,153,0.15)', padding: 10, borderRadius: 12, marginBottom: 15, color: '#34D399' }}>{message}</div>}

        {/* Review Section (bulk) */}
        {pendingReviews.length > 0 && (
          <div id="reviews-section" style={{ marginBottom: 30 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
              <h2 style={{ fontSize: 22, fontWeight: 600, color: '#f0f0f0' }}>🔍 Need Review ({pendingReviews.length})</h2>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => {
                  const allIds = pendingReviews.map(r => r.id);
                  Promise.all(allIds.map(id => handleApproveReview(id))).then(() => { fetchPeople(); fetchPendingReviews(); });
                }} style={{ padding: '8px 16px', background: '#34D399', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                  ✅ Approve All
                </button>
                <button onClick={() => {
                  const allIds = pendingReviews.map(r => r.id);
                  Promise.all(allIds.map(id => handleRejectReview(id))).then(() => fetchPendingReviews());
                }} style={{ padding: '8px 16px', background: '#EF4444', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                  ❌ Reject All
                </button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {pendingReviews.map(review => (
                <div key={review.id} style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(10px)', borderRadius: 16, padding: 20, borderLeft: '4px solid #ff9800', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 18, color: '#f0f0f0' }}>{review.first_name}</div>
                      <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>{review.phone || 'No phone'}</div>
                    </div>
                    <span style={{ background: '#ff9800', color: '#fff', padding: '2px 8px', borderRadius: 12, fontSize: 12 }}>{review.confidence}%</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => handleApproveReview(review.id)} style={{ padding: '6px 12px', background: '#34D399', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>✓ Approve</button>
                    <button onClick={() => handleRejectReview(review.id)} style={{ padding: '6px 12px', background: '#EF4444', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>✕ Reject</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* People table */}
        <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 15, color: '#f0f0f0' }}>{showDeleted ? 'Trash' : 'All People'} ({filtered.length})</h2>
        <div style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(10px)', borderRadius: 16, padding: 20, border: '1px solid rgba(255,255,255,0.06)', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', color: '#f0f0f0' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
                <th style={th}>Name</th>
                <th style={th}>Phone</th>
                <th style={th}>Role</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(person => (
                <tr key={person.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {editingId === person.id ? (
                    <>
                      <td style={td}>
                        <input value={editValues.first_name} onChange={e => setEditValues({ ...editValues, first_name: e.target.value })} style={editInput} />
                      </td>
                      <td style={td}>
                        <input value={editValues.phone} onChange={e => setEditValues({ ...editValues, phone: e.target.value })} style={editInput} />
                      </td>
                      <td style={td}>
                        <select value={editValues.type} onChange={e => setEditValues({ ...editValues, type: e.target.value })} style={editInput}>
                          <option value="visitor">Visitor</option>
                          <option value="member">Member</option>
                          <option value="volunteer">Volunteer</option>
                          <option value="leader">Leader</option>
                          <option value="staff">Staff</option>
                        </select>
                      </td>
                      <td style={td}>
                        <button onClick={() => saveEdit(person.id)} style={saveBtn}>💾</button>
                        <button onClick={cancelEdit} style={cancelBtn}>✖️</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={td}>{person.first_name} {person.last_name}</td>
                      <td style={td}>{person.phone || '—'}</td>
                      <td style={td}>{person.type || 'visitor'}</td>
                      <td style={td}>
                        {showDeleted ? (
                          <button onClick={() => handleRestore(person.id)} style={{ background: '#4CAF50', border: 'none', color: '#fff', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontWeight: 600 }}>🔄 Restore</button>
                        ) : (
                          <>
                            <button onClick={() => startEdit(person)} style={editBtn}>✏️</button>
                            <button onClick={() => handleDelete(person.id)} style={deleteBtn}>🗑️</button>
                            <button onClick={() => testSMS(person.phone, person.first_name)} style={testBtn}>📩 Test</button>
                          </>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}

// styles
const th = { padding: '12px 10px', textAlign: 'left', fontWeight: 600, color: 'rgba(255,255,255,0.7)', fontSize: 14 };
const td = { padding: '10px 10px', fontSize: 14 };
const inputField = { padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#fff', outline: 'none' };
const editInput = { width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: '#fff' };
const editBtn = { background: 'transparent', border: 'none', color: '#60A5FA', cursor: 'pointer', fontSize: 16, marginRight: 8 };
const deleteBtn = { background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: 16, marginRight: 8 };
const saveBtn = { background: 'transparent', border: 'none', color: '#34D399', cursor: 'pointer', fontSize: 16, marginRight: 8 };
const cancelBtn = { background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: 16 };
const testBtn = { background: '#34D399', border: 'none', color: '#000', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontWeight: 600, fontSize: 12, marginLeft: 4 };
