import { useState, useEffect } from 'react';
import Link from 'next/link';
import Layout from '../components/Layout';

const ORG_ID = 'demo-org';

export default function CommunityPage() {
  const [people, setPeople] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState({ full_name: '', phone: '', type: 'visitor' });
  const [selectedPerson, setSelectedPerson] = useState(null);

  useEffect(() => { fetchPeople(); }, []);
  const fetchPeople = async () => {
    const res = await fetch(`/api/people?organization_id=${ORG_ID}&_=${Date.now()}`);
    const data = await res.json();
    if (Array.isArray(data)) { setPeople(data); setLoading(false); }
  };

  useEffect(() => {
    let result = [...people];
    if (roleFilter !== 'all') result = result.filter(p => p.type === roleFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(p => (p.first_name || '').toLowerCase().includes(q) || (p.phone || '').includes(q));
    }
    setFiltered(result);
  }, [people, search, roleFilter]);

  const addPerson = async e => { /* unchanged */ };
  const generateDraft = async (personId) => {
    const res = await fetch('/api/presence/draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ person_id: personId }) });
    const data = await res.json();
    if (data.message) {
      if (navigator.clipboard) { await navigator.clipboard.writeText(data.message); setMessage('Draft copied – ready to paste'); }
    } else setMessage('Error: ' + data.error);
    setTimeout(() => setMessage(''), 3000);
  };

  if (loading) return <Layout><div style={{ padding:20 }}>…</div></Layout>;

  return (
    <Layout>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, color: '#f0f0f0', marginBottom: 25 }}>
          {people.length} lives remembered
        </h1>

        {people.length === 0 && (
          <div style={emptyState}>
            <div style={{ fontSize: 18, color: '#D4AF37', marginBottom: 10 }}>Welcome. ARIA is ready to help you care for every life.</div>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 20 }}>Upload your first register or add a person manually.</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <a href="/scan" style={actionBtn}>Scan Register</a>
              <button onClick={() => setShowAddForm(true)} style={actionBtn}>Add First Person</button>
            </div>
          </div>
        )}

        {people.length > 0 && (
          <>
            <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
              <input type="text" placeholder="Search by name or phone" value={search} onChange={e => setSearch(e.target.value)} style={searchStyle} />
              <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={selectStyle}>
                <option value="all">All</option>
                <option value="visitor">Visitor</option>
                <option value="member">Member</option>
              </select>
              <button onClick={() => setShowAddForm(!showAddForm)} style={actionBtn}>Add Person</button>
            </div>

            {showAddForm && (
              <form onSubmit={addPerson} style={formCard}>
                <input placeholder="Full name" value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} required style={miniInput} />
                <input placeholder="Phone" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} required style={miniInput} />
                <select value={form.type} onChange={e => setForm({...form, type: e.target.value})} style={miniInput}>
                  <option value="visitor">Visitor</option>
                  <option value="member">Member</option>
                </select>
                <button type="submit" style={actionBtn}>Save</button>
              </form>
            )}

            {message && <div style={msgStyle}>{message}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
              {filtered.map(person => (
                <div key={person.id} onClick={() => setSelectedPerson(selectedPerson?.id === person.id ? null : person)} style={cardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 17, color: '#f0f0f0' }}>{person.first_name}</div>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'rgba(212,175,55,0.15)', color: '#D4AF37' }}>{person.type || 'visitor'}</span>
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 4 }}>{person.phone || 'No phone'}</div>
                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>{person.last_attended_date ? `Last seen ${person.last_attended_date}` : 'New'}</div>

                  {selectedPerson?.id === person.id && (
                    <div style={{ marginTop: 15, padding: '15px 0 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                        <button onClick={() => generateDraft(person.id)} style={draftBtn}>Draft Message</button>
                        <Link href={`/person/${person.id}`} style={journeyLink}>Journey →</Link>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button style={secondaryBtn}>Edit</button>
                        <button style={secondaryBtn}>Remove</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {filtered.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.4)' }}>No matches.</div>}
          </>
        )}
      </div>
    </Layout>
  );
}

const emptyState = { textAlign: 'center', padding: '60px 20px' };
const actionBtn = { padding: '10px 20px', background: 'rgba(20,25,40,0.8)', borderRadius: 10, color: '#D4AF37', border: '1px solid rgba(212,175,55,0.2)', cursor: 'pointer', fontWeight: 500, fontSize: 14, textDecoration: 'none', display: 'inline-block' };
const searchStyle = { flex: 1, minWidth: 200, padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(20,25,40,0.8)', color: '#fff', outline: 'none' };
const selectStyle = { ...searchStyle, flex: 'none', width: 120 };
const formCard = { background: 'rgba(20,25,40,0.9)', borderRadius: 20, padding: 20, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid rgba(255,255,255,0.05)', boxShadow: '0 0 15px rgba(212,175,55,0.03)' };
const miniInput = { padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(20,25,40,0.6)', color: '#fff', outline: 'none' };
const msgStyle = { background: 'rgba(52,211,153,0.1)', padding: 10, borderRadius: 12, marginBottom: 15, color: '#34D399' };
const cardStyle = { background: 'rgba(20,25,40,0.9)', borderRadius: 20, padding: 20, border: '1px solid rgba(255,255,255,0.05)', boxShadow: '0 0 15px rgba(212,175,55,0.02)', cursor: 'pointer', transition: 'all 0.2s' };
const draftBtn = { background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.25)', color: '#D4AF37', borderRadius: 8, padding: '6px 12px', fontSize: 13, cursor: 'pointer' };
const journeyLink = { textDecoration: 'none', fontSize: 13, color: '#60A5FA', padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(96,165,250,0.2)', background: 'rgba(96,165,250,0.05)', display: 'inline-block' };
const secondaryBtn = { background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', borderRadius: 8, padding: '4px 10px', fontSize: 13, cursor: 'pointer' };
