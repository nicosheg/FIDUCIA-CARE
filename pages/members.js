import { useState, useEffect } from 'react';
import Layout from '../components/Layout';

const CHURCH_ID = 'demo-church';

export default function MembersPage() {
  const [members, setMembers] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ first_name: '', last_name: '', phone: '' });
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    fetch(`/api/members?church_id=${CHURCH_ID}`)
      .then(r => r.json())
      .then(data => {
        const arr = Array.isArray(data) ? data : [];
        setMembers(arr);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Apply filters
  useEffect(() => {
    let result = [...members];
    if (typeFilter !== 'all') {
      result = result.filter(m => m.type === typeFilter || (typeFilter === 'member' && !m.type));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(m =>
        `${m.first_name} ${m.last_name}`.toLowerCase().includes(q) ||
        (m.phone && m.phone.includes(q))
      );
    }
    // Sort: members first, then visitors, then by name
    result.sort((a, b) => {
      if ((a.type === 'member') !== (b.type === 'member')) return a.type === 'member' ? -1 : 1;
      return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
    });
    setFiltered(result);
  }, [members, search, typeFilter]);

  const addMember = async (e) => {
    e.preventDefault();
    const res = await fetch('/api/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, church_id: CHURCH_ID, type: 'member' }),
    });
    const data = await res.json();
    if (data?.id) {
      setMembers(prev => [data, ...prev]);
      setForm({ first_name: '', last_name: '', phone: '' });
      setShowAddForm(false);
      setMessage(`✅ ${data.first_name} added`);
      setTimeout(() => setMessage(''), 3000);
    } else {
      setMessage('Error: ' + (data.error || 'Could not add'));
    }
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

  if (loading) return <p>Loading...</p>;

  return (
    <Layout>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 20 }}>👥 Members</h1>

        {/* Controls bar */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20, alignItems: 'center' }}>
          <input
            type="text"
            placeholder="🔍 Search name or phone"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={searchStyle}
          />
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={selectStyle}>
            <option value="all">All ({members.length})</option>
            <option value="member">Members ({members.filter(m => m.type === 'member' || !m.type).length})</option>
            <option value="visitor">Visitors ({members.filter(m => m.type === 'visitor').length})</option>
          </select>
          <button onClick={() => setShowAddForm(!showAddForm)} style={addButtonStyle}>
            ➕ Add Member
          </button>
        </div>

        {/* Add form (collapsible) */}
        {showAddForm && (
          <form onSubmit={addMember} style={formContainerStyle}>
            <input placeholder="First Name" value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} required style={miniInput} />
            <input placeholder="Last Name" value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} style={miniInput} />
            <input placeholder="Phone (080...)" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required style={miniInput} />
            <button type="submit" style={primaryBtn}>Save</button>
          </form>
        )}

        {message && <div style={messageStyle}>{message}</div>}

        {/* Members grid / cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 16, marginTop: 10 }}>
          {filtered.map(member => (
            <div key={member.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 18 }}>{member.first_name} {member.last_name}</div>
                <span style={{ ...typeBadge, background: member.type === 'visitor' ? '#f0ad4e' : '#5cb85c' }}>
                  {member.type || 'member'}
                </span>
              </div>
              <div style={{ color: '#666', fontSize: 14, marginBottom: 12 }}>
                {member.phone || 'No phone'}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => handleDelete(member.id)} style={deleteBtn}>🗑️</button>
                {/* future: edit, view timeline */}
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>
            No members found. Add your first member above.
          </div>
        )}
      </div>
    </Layout>
  );
}

// Styles
const searchStyle = {
  flex: 1,
  minWidth: 200,
  padding: '10px 14px',
  borderRadius: 12,
  border: '1px solid #ddd',
  background: 'rgba(255,255,255,0.8)',
  backdropFilter: 'blur(5px)',
  outline: 'none',
};

const selectStyle = {
  padding: '10px 14px',
  borderRadius: 12,
  border: '1px solid #ddd',
  background: 'rgba(255,255,255,0.8)',
  backdropFilter: 'blur(5px)',
  cursor: 'pointer',
};

const addButtonStyle = {
  padding: '10px 18px',
  background: '#4F46E5',
  color: 'white',
  border: 'none',
  borderRadius: 12,
  fontWeight: 600,
  cursor: 'pointer',
  backdropFilter: 'blur(5px)',
};

const formContainerStyle = {
  background: 'rgba(255,255,255,0.7)',
  backdropFilter: 'blur(10px)',
  borderRadius: 16,
  padding: 20,
  marginBottom: 20,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

const miniInput = {
  padding: '10px',
  borderRadius: 8,
  border: '1px solid #ddd',
  background: 'rgba(255,255,255,0.9)',
};

const primaryBtn = {
  padding: '10px 20px',
  background: '#4F46E5',
  color: 'white',
  border: 'none',
  borderRadius: 8,
  fontWeight: 600,
  cursor: 'pointer',
};

const cardStyle = {
  background: 'rgba(255,255,255,0.7)',
  backdropFilter: 'blur(10px)',
  borderRadius: 16,
  padding: 20,
  boxShadow: '0 8px 32px rgba(0,0,0,0.08)',
  transition: 'transform 0.2s',
  cursor: 'default',
};

const typeBadge = {
  fontSize: 12,
  fontWeight: 600,
  padding: '2px 8px',
  borderRadius: 12,
  color: '#fff',
  textTransform: 'capitalize',
};

const deleteBtn = {
  background: 'transparent',
  border: '1px solid #f44336',
  color: '#f44336',
  borderRadius: 8,
  padding: '4px 10px',
  cursor: 'pointer',
  fontWeight: 600,
};

const messageStyle = {
  background: '#e8f5e9',
  padding: 10,
  borderRadius: 12,
  marginBottom: 15,
};
