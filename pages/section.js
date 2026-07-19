import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import Layout from '../components/Layout';

export default function SectionCheckin() {
  const router = useRouter();
  const { sessionId, section } = router.query;

  const [members, setMembers] = useState([]);
  const [search, setSearch] = useState('');
  const [presentIds, setPresentIds] = useState(new Set());
  const [submitted, setSubmitted] = useState(false);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newPerson, setNewPerson] = useState({ first_name: '', last_name: '', phone: '', type: 'visitor' });
  const [adding, setAdding] = useState(false);
  const [addMessage, setAddMessage] = useState('');

  useEffect(() => {
    if (!sessionId || !section) return;
    fetch(`/api/members?church_id=demo-church`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setMembers(data);
      });
  }, [sessionId, section]);

  const togglePresent = (memberId) => {
    const newSet = new Set(presentIds);
    if (newSet.has(memberId)) newSet.delete(memberId);
    else newSet.add(memberId);
    setPresentIds(newSet);
  };

  const submitSection = async () => {
    const res = await fetch('/api/attendance/section-checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        section_name: section,
        present_ids: [...presentIds],
      }),
    });
    const data = await res.json();
    if (data.success) setSubmitted(true);
  };

  const handleAddPerson = async (e) => {
    e.preventDefault();
    if (!newPerson.first_name.trim()) return;
    setAdding(true);
    setAddMessage('');
    try {
      const addRes = await fetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          church_id: 'demo-church',
          first_name: newPerson.first_name,
          last_name: newPerson.last_name,
          phone: newPerson.phone,
          type: newPerson.type,
        }),
      });
      const member = await addRes.json();
      if (!member.id) throw new Error(member.error || 'Failed to add');

      await fetch('/api/attendance/section-checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          section_name: section,
          present_ids: [member.id],
        }),
      });

      setPresentIds(prev => new Set(prev).add(member.id));
      setMembers(prev => [member, ...prev]);
      setAddMessage(`✅ ${member.first_name} added & marked present`);
      setNewPerson({ first_name: '', last_name: '', phone: '', type: 'visitor' });
      setShowAddForm(false);
    } catch (err) {
      setAddMessage('❌ ' + err.message);
    }
    setAdding(false);
  };

  const filtered = members.filter(m =>
    `${m.first_name} ${m.last_name}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Layout>
      <div style={{ padding: 20, maxWidth: 600, margin: '0 auto' }}>
        <h2>Section: {section}</h2>
        <p style={{ color: '#666' }}>Tap a name to mark present</p>

        <input
          type="text"
          placeholder="🔍 Search members..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', padding: 12, marginBottom: 12, borderRadius: 8, border: '1px solid #ccc' }}
        />

        <button
          onClick={() => setShowAddForm(!showAddForm)}
          style={{
            marginBottom: 16,
            padding: '10px 16px',
            background: '#ff9800',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontWeight: 'bold',
            cursor: 'pointer',
          }}
        >
          ➕ Add Person
        </button>

        {showAddForm && (
          <form onSubmit={handleAddPerson} style={{ marginBottom: 20, background: '#f5f5f5', padding: 15, borderRadius: 8 }}>
            <input placeholder="First Name *" value={newPerson.first_name} onChange={e => setNewPerson({ ...newPerson, first_name: e.target.value })} style={formInputStyle} required />
            <input placeholder="Last Name" value={newPerson.last_name} onChange={e => setNewPerson({ ...newPerson, last_name: e.target.value })} style={formInputStyle} />
            <input placeholder="Phone (e.g., 080...)" value={newPerson.phone} onChange={e => setNewPerson({ ...newPerson, phone: e.target.value })} style={formInputStyle} />
            <select value={newPerson.type} onChange={e => setNewPerson({ ...newPerson, type: e.target.value })} style={formInputStyle}>
              <option value="visitor">Visitor</option>
              <option value="new">New Person (interested)</option>
              <option value="member">Existing Member</option>
            </select>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={adding} style={smallBtn}>{adding ? 'Adding...' : 'Add & Mark Present'}</button>
              <button type="button" onClick={() => setShowAddForm(false)} style={{ ...smallBtn, background: '#ccc' }}>Cancel</button>
            </div>
            {addMessage && <p style={{ marginTop: 8 }}>{addMessage}</p>}
          </form>
        )}

        {filtered.map(m => (
          <div
            key={m.id}
            onClick={() => togglePresent(m.id)}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: 14, marginBottom: 8, borderRadius: 8,
              background: presentIds.has(m.id) ? '#e8f5e9' : '#fff',
              border: presentIds.has(m.id) ? '2px solid #4CAF50' : '1px solid #ddd',
              cursor: 'pointer', userSelect: 'none',
            }}
          >
            <span>{m.first_name} {m.last_name} {m.type && m.type !== 'member' ? `(${m.type})` : ''}</span>
            <span style={{ fontSize: 20 }}>{presentIds.has(m.id) ? '✅' : '⬜'}</span>
          </div>
        ))}

        <button
          onClick={submitSection}
          disabled={submitted}
          style={{
            padding: '14px 24px', background: submitted ? '#aaa' : '#4CAF50',
            color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer',
            marginTop: 20, fontSize: 16, width: '100%',
          }}
        >
          {submitted ? '✅ Submitted' : 'Submit Section Attendance'}
        </button>
      </div>
    </Layout>
  );
}

const formInputStyle = { width: '100%', padding: 10, marginBottom: 8, borderRadius: 6, border: '1px solid #ccc' };
const smallBtn = { padding: '8px 16px', background: '#4F46E5', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' };
