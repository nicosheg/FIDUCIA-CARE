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
      .then(data => { if (Array.isArray(data)) setMembers(data); });
  }, [sessionId, section]);

  const togglePresent = (id) => {
    const newSet = new Set(presentIds);
    newSet.has(id) ? newSet.delete(id) : newSet.add(id);
    setPresentIds(newSet);
  };

  const submitSection = async () => {
    const res = await fetch('/api/attendance/section-checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, section_name: section, present_ids: [...presentIds] }),
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
        body: JSON.stringify({ church_id: 'demo-church', first_name: newPerson.first_name, last_name: newPerson.last_name, phone: newPerson.phone, type: newPerson.type }),
      });
      const member = await addRes.json();
      if (!member.id) throw new Error(member.error || 'Failed');

      await fetch('/api/attendance/section-checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, section_name: section, present_ids: [member.id] }),
      });

      setPresentIds(prev => new Set(prev).add(member.id));
      setMembers(prev => [member, ...prev]);
      setAddMessage(`✅ ${member.first_name} added`);
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
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '20px' }}>
        <h2 style={{ fontSize: 24, fontWeight: 700 }}>Section: {section}</h2>
        <p style={{ color: '#666' }}>Tap a name to mark present</p>

        <input
          type="text"
          placeholder="🔍 Search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', padding: 12, marginBottom: 15, borderRadius: 12, border: '1px solid #ddd', background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(5px)' }}
        />

        <button onClick={() => setShowAddForm(!showAddForm)} style={{ marginBottom: 15, background: '#ff9800', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontWeight: 600, cursor: 'pointer' }}>
          ➕ Add Person
        </button>

        {showAddForm && (
          <form onSubmit={handleAddPerson} style={{ marginBottom: 20, background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(10px)', padding: 15, borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
            <input placeholder="First Name *" value={newPerson.first_name} onChange={e => setNewPerson({ ...newPerson, first_name: e.target.value })} style={miniInput} required />
            <input placeholder="Last Name" value={newPerson.last_name} onChange={e => setNewPerson({ ...newPerson, last_name: e.target.value })} style={miniInput} />
            <input placeholder="Phone" value={newPerson.phone} onChange={e => setNewPerson({ ...newPerson, phone: e.target.value })} style={miniInput} />
            <select value={newPerson.type} onChange={e => setNewPerson({ ...newPerson, type: e.target.value })} style={miniInput}>
              <option value="visitor">Visitor</option>
              <option value="new">New Person</option>
              <option value="member">Member</option>
            </select>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={adding} style={{ background: '#4F46E5', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>{adding ? 'Adding...' : 'Add & Mark Present'}</button>
              <button type="button" onClick={() => setShowAddForm(false)} style={{ background: '#ccc', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>Cancel</button>
            </div>
            {addMessage && <p style={{ marginTop: 8 }}>{addMessage}</p>}
          </form>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(m => (
            <div key={m.id} onClick={() => togglePresent(m.id)} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: 14, borderRadius: 12,
              background: presentIds.has(m.id) ? '#e8f5e9' : 'rgba(255,255,255,0.8)',
              border: presentIds.has(m.id) ? '2px solid #4CAF50' : '1px solid rgba(255,255,255,0.3)',
              backdropFilter: 'blur(5px)',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}>
              <span>{m.first_name} {m.last_name} {m.type && m.type !== 'member' ? `(${m.type})` : ''}</span>
              <span style={{ fontSize: 24 }}>{presentIds.has(m.id) ? '✅' : '⬜'}</span>
            </div>
          ))}
        </div>

        <button
          onClick={submitSection}
          disabled={submitted}
          style={{
            width: '100%', marginTop: 25, padding: 14,
            background: submitted ? '#aaa' : 'linear-gradient(135deg, #4CAF50, #2E7D32)',
            color: '#fff', border: 'none', borderRadius: 14,
            fontSize: 18, fontWeight: 600, cursor: 'pointer',
            boxShadow: submitted ? 'none' : '0 4px 12px rgba(76,175,80,0.3)',
          }}
        >
          {submitted ? '✅ Submitted' : 'Submit Section Attendance'}
        </button>
      </div>
    </Layout>
  );
}

const miniInput = {
  width: '100%', padding: 10, marginBottom: 8, borderRadius: 8, border: '1px solid #ddd', background: 'rgba(255,255,255,0.9)',
};
