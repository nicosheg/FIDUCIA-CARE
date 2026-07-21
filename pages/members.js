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
  const [form, setForm] = useState({ full_name: '', phone: '', type: 'visitor' });
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({ full_name: '', phone: '' });

  useEffect(() => {
    fetchMembers();
    fetchPendingReviews();
  }, []);

  const fetchMembers = async () => {
    const res = await fetch(`/api/members?church_id=${CHURCH_ID}`);
    const data = await res.json();
    if (Array.isArray(data)) {
      setMembers(data);
      setLoading(false);
    }
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
        (m.last_name || '').toLowerCase().includes(q) ||
        (m.phone || '').includes(q)
      );
    }
    result.sort((a, b) => {
      if ((a.type === 'member') !== (b.type === 'member')) return a.type === 'member' ? -1 : 1;
      return (a.first_name || '').localeCompare(b.first_name || '');
    });
    setFiltered(result);
  }, [members, search, typeFilter]);

  const addMember = async e => {
    e.preventDefault();
    const res = await fetch('/api/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        first_name: form.full_name,
        last_name: '',
        phone: form.phone,
        church_id: CHURCH_ID,
        type: form.type || 'visitor',
      }),
    });
    const data = await res.json();
    if (data?.id) {
      setMembers(prev => [data, ...prev]);
      setForm({ full_name: '', phone: '', type: 'visitor' });
      setShowAddForm(false);
      setMessage(`✅ ${data.first_name} added`);
      setTimeout(() => setMessage(''), 3000);
    } else setMessage('Error: ' + (data.error || 'Could not add'));
  };

  const startEdit = member => {
    setEditingId(member.id);
    setEditValues({ full_name: member.first_name || '', phone: member.phone || '' });
  };

  const saveEdit = async id => {
    setMembers(prev =>
      prev.map(m =>
        m.id === id ? { ...m, first_name: editValues.full_name, phone: editValues.phone } : m
      )
    );
    setEditingId(null);
    setMessage('✅ Member updated');
    setTimeout(() => setMessage(''), 3000);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const handleDelete = async memberId => {
    if (!confirm('Remove this member?')) return;
    await fetch('/api/members/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: memberId }),
    });
    setMembers(prev => prev.filter(m => m.id !== memberId));
    setMessage('🗑️ Member removed');
    setTimeout(() => setMessage(''), 3000);
  };

  const testWhatsApp = async (phone, name) => {
    if (!phone) {
      alert('No phone number for this member.');
      return;
    }
    const res = await fetch('/api/send-whatsapp-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, first_name: name }),
    });
    const data = await res.json();
    if (data.success) {
      alert(`Test message sent to ${name}`);
    } else {
      alert('Failed: ' + (data.error || 'Unknown error'));
    }
  };

  // Approve a pending review
  const handleApproveReview = async (reviewId, corrected) => {
    await fetch('/api/pending-reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: reviewId,
        action: 'approve',
        corrected: corrected
          ? { first_name: corrected.full_name, last_name: '', phone: corrected.phone }
          : null,
      }),
    });
    fetchMembers();
    fetchPendingReviews();
    setMessage('✅ Review approved');
    setTimeout(() => setMessage(''), 3000);
  };

  // Reject a pending review
  const handleRejectReview = async reviewId => {
    await fetch('/api/pending-reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: reviewId, action: 'reject' }),
    });
    fetchPendingReviews();
    setMessage('❌ Review rejected');
    setTimeout(() => setMessage(''), 3000);
  };

  if (loading) {
    return (
      <Layout>
        <div style={{ padding: '20px' }}>
          <p>Loading members...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px' }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, color: '#f0f0f0', marginBottom: 25 }}>
          👥 Members
        </h1>

        {/* Pending reviews banner */}
        {pendingReviews.length > 0 && (
          <div
            style={{
              background: 'rgba(255,152,0,0.15)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,152,0,0.4)',
              borderRadius: 16,
              padding: '14px 20px',
              marginBottom: 24,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              color: '#f0f0f0',
            }}
          >
            <span style={{ fontWeight: 600 }}>
              🔍 {pendingReviews.length} names need your review
            </span>
            <button
              onClick={() =>
                document.getElementById('reviews-section').scrollIntoView({ behavior: 'smooth' })
              }
              style={{
                marginLeft: 16,
                padding: '6px 14px',
                background: '#ff9800',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Review Now
            </button>
          </div>
        )}

        {/* Controls bar */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 20,
            alignItems: 'center',
          }}
        >
          <input
            type="text"
            placeholder="🔍 Search name or phone"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              flex: 1,
              minWidth: 200,
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.05)',
              backdropFilter: 'blur(5px)',
              color: '#fff',
              outline: 'none',
            }}
          />
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.05)',
              backdropFilter: 'blur(5px)',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            <option value="all">All ({members.length})</option>
            <option value="member">
              Members ({members.filter(m => m.type === 'member' || !m.type).length})
            </option>
            <option value="visitor">
              Visitors ({members.filter(m => m.type === 'visitor').length})
            </option>
          </select>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            style={{
              padding: '10px 18px',
              background: '#4F46E5',
              color: 'white',
              border: 'none',
              borderRadius: 12,
              fontWeight: 600,
              cursor: 'pointer',
              backdropFilter: 'blur(5px)',
            }}
          >
            ➕ Add Member
          </button>
        </div>

        {/* Add Member form */}
        {showAddForm && (
          <form
            onSubmit={addMember}
            style={{
              background: 'rgba(255,255,255,0.03)',
              backdropFilter: 'blur(10px)',
              borderRadius: 16,
              padding: 20,
              marginBottom: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <input
              placeholder="Full Name (e.g., Bro Jerry)"
              value={form.full_name}
              onChange={e => setForm({ ...form, full_name: e.target.value })}
              required
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(255,255,255,0.05)',
                color: '#fff',
                outline: 'none',
              }}
            />
            <input
              placeholder="Phone (080...)"
              value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
              required
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(255,255,255,0.05)',
                color: '#fff',
                outline: 'none',
              }}
            />
            <select
              value={form.type}
              onChange={e => setForm({ ...form, type: e.target.value })}
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(255,255,255,0.05)',
                color: '#fff',
                outline: 'none',
              }}
            >
              <option value="visitor">Visitor</option>
              <option value="member">Member</option>
            </select>
            <button
              type="submit"
              style={{
                padding: '10px 20px',
                background: '#4F46E5',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontWeight: 600,
                cursor: 'pointer',
                alignSelf: 'flex-start',
              }}
            >
              Save
            </button>
          </form>
        )}

        {message && (
          <div
            style={{
              background: 'rgba(52,211,153,0.15)',
              padding: 10,
              borderRadius: 12,
              marginBottom: 15,
              color: '#34D399',
            }}
          >
            {message}
          </div>
        )}

        {/* Pending reviews section */}
        {pendingReviews.length > 0 && (
          <div id="reviews-section" style={{ marginBottom: 30 }}>
            <h2
              style={{
                fontSize: 22,
                fontWeight: 600,
                marginBottom: 15,
                color: '#f0f0f0',
              }}
            >
              🔍 Need Review ({pendingReviews.length})
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 16,
              }}
            >
              {pendingReviews.map(review => (
                <div
                  key={review.id}
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    backdropFilter: 'blur(10px)',
                    borderRadius: 16,
                    padding: 20,
                    borderLeft: '4px solid #ff9800',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: 12,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 18, color: '#f0f0f0' }}>
                        {review.first_name}
                      </div>
                      <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>
                        {review.phone || 'No phone'}
                      </div>
                    </div>
                    <span
                      style={{
                        background: '#ff9800',
                        color: '#fff',
                        padding: '2px 8px',
                        borderRadius: 12,
                        fontSize: 12,
                        alignSelf: 'flex-start',
                      }}
                    >
                      {review.confidence}%
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => handleApproveReview(review.id, null)}
                      style={{
                        padding: '6px 12px',
                        background: '#34D399',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: 13,
                      }}
                    >
                      ✓ Approve
                    </button>
                    <button
                      onClick={() => handleRejectReview(review.id)}
                      style={{
                        padding: '6px 12px',
                        background: '#EF4444',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: 13,
                      }}
                    >
                      ✕ Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Members table */}
        <h2
          style={{
            fontSize: 22,
            fontWeight: 600,
            marginBottom: 15,
            color: '#f0f0f0',
          }}
        >
          All Members
        </h2>
        <div
          style={{
            background: 'rgba(255,255,255,0.03)',
            backdropFilter: 'blur(10px)',
            borderRadius: 16,
            padding: 20,
            border: '1px solid rgba(255,255,255,0.06)',
            overflowX: 'auto',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', color: '#f0f0f0' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Phone</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(member => (
                <tr
                  key={member.id}
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                >
                  {editingId === member.id ? (
                    <>
                      <td style={tdStyle}>
                        <input
                          value={editValues.full_name}
                          onChange={e =>
                            setEditValues({ ...editValues, full_name: e.target.value })
                          }
                          style={editInputStyle}
                        />
                      </td>
                      <td style={tdStyle}>
                        <input
                          value={editValues.phone}
                          onChange={e =>
                            setEditValues({ ...editValues, phone: e.target.value })
                          }
                          style={editInputStyle}
                        />
                      </td>
                      <td style={tdStyle}>{member.type || 'member'}</td>
                      <td style={tdStyle}>{member.status}</td>
                      <td style={tdStyle}>
                        <button onClick={() => saveEdit(member.id)} style={saveBtnStyle}>
                          💾
                        </button>
                        <button onClick={cancelEdit} style={cancelBtnStyle}>
                          ✖️
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={tdStyle}>{member.first_name}</td>
                      <td style={tdStyle}>{member.phone || '—'}</td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 12,
                            fontSize: 12,
                            fontWeight: 600,
                            background:
                              member.type === 'visitor'
                                ? 'rgba(245,158,11,0.2)'
                                : 'rgba(52,211,153,0.2)',
                            color:
                              member.type === 'visitor' ? '#F59E0B' : '#34D399',
                          }}
                        >
                          {member.type || 'member'}
                        </span>
                      </td>
                      <td style={tdStyle}>{member.status}</td>
                      <td style={tdStyle}>
                        <button onClick={() => startEdit(member)} style={editBtnStyle}>
                          ✏️
                        </button>
                        <button onClick={() => handleDelete(member.id)} style={deleteBtnStyle}>
                          🗑️
                        </button>
                        <button
                          onClick={() => testWhatsApp(member.phone, member.first_name)}
                          style={{
                            background: '#34D399',
                            border: 'none',
                            color: '#000',
                            borderRadius: 6,
                            padding: '4px 10px',
                            cursor: 'pointer',
                            fontWeight: 600,
                            fontSize: 12,
                            marginLeft: 4,
                          }}
                        >
                          📩 Test
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div
              style={{
                textAlign: 'center',
                padding: 40,
                color: 'rgba(255,255,255,0.4)',
              }}
            >
              No members found. Add your first member or scan an attendance sheet.
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

// Table styles
const thStyle = {
  padding: '12px 10px',
  textAlign: 'left',
  fontWeight: 600,
  color: 'rgba(255,255,255,0.7)',
  fontSize: 14,
};

const tdStyle = {
  padding: '10px 10px',
  fontSize: 14,
};

const editInputStyle = {
  width: '100%',
  padding: '6px 8px',
  borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.2)',
  background: 'rgba(255,255,255,0.05)',
  color: '#fff',
  outline: 'none',
};

const editBtnStyle = {
  background: 'transparent',
  border: 'none',
  color: '#60A5FA',
  cursor: 'pointer',
  fontSize: 16,
  marginRight: 8,
};

const saveBtnStyle = {
  background: 'transparent',
  border: 'none',
  color: '#34D399',
  cursor: 'pointer',
  fontSize: 16,
  marginRight: 8,
};

const cancelBtnStyle = {
  background: 'transparent',
  border: 'none',
  color: '#EF4444',
  cursor: 'pointer',
  fontSize: 16,
};

const deleteBtnStyle = {
  background: 'transparent',
  border: 'none',
  color: '#EF4444',
  cursor: 'pointer',
  fontSize: 16,
};
   
