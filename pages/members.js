import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function MembersPage() {
  const [members, setMembers] = useState([]);
  const [form, setForm] = useState({ first_name: '', last_name: '', phone: '' });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const churchId = 'demo-church';

  useEffect(() => {
    fetch(`/api/members?church_id=${churchId}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setMembers(data);
        } else {
          setMessage('Could not load members. Unexpected data format.');
          setMembers([]);
        }
      })
      .catch(err => {
        setMessage('Failed to connect. Please check your connection.');
        console.error(err);
        setMembers([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const addMember = async (e) => {
    e.preventDefault();
    const res = await fetch('/api/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, church_id: churchId }),
    });
    const data = await res.json();
    if (data && data.id) {
      setMembers([data, ...members]);
      setForm({ first_name: '', last_name: '', phone: '' });
      setMessage(`✅ ${data.first_name} ${data.last_name} added`);
    } else {
      setMessage('Error: ' + (data.error || 'Could not add member'));
    }
    setTimeout(() => setMessage(''), 3000);
  };

  const uploadBulk = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target.result;
      const lines = text.split('\n').filter(Boolean);
      for (const line of lines) {
        const [first_name, last_name, phone] = line.split(',').map(s => s.trim());
        if (first_name && phone) {
          await fetch('/api/members', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ first_name, last_name: last_name || '', phone, church_id: churchId }),
          });
        }
      }
      const res = await fetch(`/api/members?church_id=${churchId}`);
      const updated = await res.json();
      if (Array.isArray(updated)) setMembers(updated);
      setMessage('✅ Bulk upload complete');
    };
    reader.readAsText(file);
  };

  const testCall = async (memberId) => {
    const res = await fetch('/api/test-call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: memberId }),
    });
    const data = await res.json();
    alert(data.message || data.error || 'Call triggered');
  };

  if (loading) return <p>Loading members...</p>;

  return (
    <div style={{ padding: 20, maxWidth: 800, margin: '0 auto' }}>
      <nav style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 20,
        marginBottom: 30,
        borderBottom: '1px solid #eee',
        paddingBottom: 15,
      }}>
        <Link href="/">📊 Dashboard</Link>
        <Link href="/section">✅ Section Attendance</Link>
        <Link href="/scan">📷 Scan</Link>
        <Link href="/members" style={{ fontWeight: 'bold' }}>👥 Members</Link>
        <Link href="/call-script">📝 Call Script</Link>
      </nav>

      <h1>👥 Member Management</h1>

      <form onSubmit={addMember} style={{ marginBottom: 30 }}>
        <h3>Add Member</h3>
        <input
          placeholder="First Name"
          value={form.first_name}
          onChange={e => setForm({ ...form, first_name: e.target.value })}
          required
          style={inputStyle}
        />
        <input
          placeholder="Last Name"
          value={form.last_name}
          onChange={e => setForm({ ...form, last_name: e.target.value })}
          style={inputStyle}
        />
        <input
          placeholder="Phone (e.g. 08012345678)"
          value={form.phone}
          onChange={e => setForm({ ...form, phone: e.target.value })}
          required
          style={inputStyle}
        />
        <p style={{ fontSize: 12, color: '#888', margin: '0 0 10px 0' }}>
          +234 added automatically if you start with 0
        </p>
        <button type="submit" style={buttonStyle}>➕ Add Member</button>
      </form>

      <div style={{ marginBottom: 30 }}>
        <h3>Bulk Upload (CSV)</h3>
        <p style={{ fontSize: 14, color: '#666' }}>
          Format: FirstName,LastName,PhoneNumber (one per line).<br />
          Phone numbers starting with 0 will automatically become +234.
        </p>
        <input type="file" accept=".csv,.txt" onChange={uploadBulk} />
      </div>

      {message && <p style={{ background: '#e8f5e9', padding: 10, borderRadius: 8 }}>{message}</p>}

      <h3>All Members ({members.length})</h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #ddd' }}>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Phone</th>
              <th style={thStyle}>Section</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Action</th>
            </tr>
          </thead>
          <tbody>
            {members.map(m => (
              <tr key={m.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={tdStyle}>{m.first_name} {m.last_name}</td>
                <td style={tdStyle}>{m.phone}</td>
                <td style={tdStyle}>{m.section || '—'}</td>
                <td style={tdStyle}>{m.status}</td>
                <td style={tdStyle}>
                  <button
                    onClick={() => testCall(m.id)}
                    style={{
                      background: '#ff9800',
                      border: 'none',
                      color: 'white',
                      padding: '6px 12px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontWeight: 'bold',
                    }}
                  >
                    📞 Test Call
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const inputStyle = {
  display: 'block',
  width: '100%',
  padding: 10,
  margin: '8px 0',
  borderRadius: 6,
  border: '1px solid #ccc',
};

const buttonStyle = {
  background: '#4F46E5',
  color: 'white',
  padding: '10px 20px',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  marginTop: 10,
};

const thStyle = { padding: 10, textAlign: 'left', fontWeight: 'bold' };
const tdStyle = { padding: 10 };
