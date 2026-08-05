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
  const [addingMemory, setAddingMemory] = useState(false);
  const [memoryText, setMemoryText] = useState('');
  const [importingConversation, setImportingConversation] = useState(false);
  const [conversationText, setConversationText] = useState('');

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
      result = result.filter(p =>
        (p.first_name || '').toLowerCase().includes(q) || (p.phone || '').includes(q)
      );
    }
    setFiltered(result);
  }, [people, search, roleFilter]);

  const addPerson = async e => {
    e.preventDefault();
    if (!form.full_name.trim()) return;
    const res = await fetch('/api/people', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        first_name: form.full_name.trim(),
        last_name: '',
        phone: form.phone,
        organization_id: ORG_ID,
        type: form.type,
      }),
    });
    const data = await res.json();
    if (data.id) {
      setPeople(prev => [data, ...prev]);
      setForm({ full_name: '', phone: '', type: 'visitor' });
      setShowAddForm(false);
      setMessage('Person added');
      setTimeout(() => setMessage(''), 3000);
    } else setMessage('Error: ' + (data.error || 'Could not add'));
  };

  const generateDraft = async (personId) => {
    const res = await fetch('/api/presence/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ person_id: personId }),
    });
    const data = await res.json();
    if (data.message) {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(data.message);
        setMessage('Draft copied – ready to paste');
      }
    } else setMessage('Error: ' + (data.error || 'Draft failed'));
    setTimeout(() => setMessage(''), 3000);
  };

  const saveMemory = async () => {
    if (!memoryText.trim()) return;
    await fetch('/api/timeline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        person_id: selectedPerson.id,
        event_type: 'memory',
        channel: 'manual',
        description: memoryText.trim(),
        organization_id: ORG_ID,
        metadata: { type: 'guided_memory' },
      }),
    });
    setMemoryText('');
    setAddingMemory(false);
    setMessage('Memory saved');
    setTimeout(() => setMessage(''), 3000);
  };

  const importConversation = async () => {
    if (!conversationText.trim()) return;
    const res = await fetch('/api/conversation/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        person_id: selectedPerson.id,
        text: conversationText.trim(),
      }),
    });
    const data = await res.json();
    if (data.success) {
      setConversationText('');
      setImportingConversation(false);
      setMessage(`Conversation imported – ${data.extracted} key events extracted`);
    } else {
      setMessage('Error: ' + (data.error || 'Import failed'));
    }
    setTimeout(() => setMessage(''), 3000);
  };

  const handleDelete = async (personId, e) => {
    if (e) e.stopPropagation();
    if (!confirm('Remove this person?')) return;
    await fetch('/api/people/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: personId }),
    });
    setPeople(prev => prev.filter(p => p.id !== personId));
  };

  if (loading) return <Layout><div style={{ padding:20 }}>…</div></Layout>;

  return (
    <Layout>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, color: '#f0f0f0', marginBottom: 25 }}>
          {people.length} lives remembered
        </h1>

        {people.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 20px' }}>
            <div style={{ fontSize: 18, color: '#D4AF37', marginBottom: 10 }}>
              Welcome. ARIA is ready to help you care for every life.
            </div>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 20 }}>
              Upload your first register or add a person manually.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <a href="/scan" className="fiducia-button fiducia-button-primary">Scan Register</a>
              <button onClick={() => setShowAddForm(true)} className="fiducia-button fiducia-button-secondary">Add First Person</button>
            </div>
          </div>
        )}

        {people.length > 0 && (
          <>
            <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
              <input type="text" placeholder="Search by name or phone" value={search} onChange={e => setSearch(e.target.value)}
                style={{
                  flex: 1, minWidth: 200, padding: '10px 14px', borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(20,25,40,0.8)',
                  color: '#fff', outline: 'none',
                }}
              />
              <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
                style={{
                  padding: '10px 14px', borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(20,25,40,0.8)',
                  color: '#fff', outline: 'none', width: 120,
                }}
              >
                <option value="all">All</option>
                <option value="visitor">Visitor</option>
                <option value="member">Member</option>
              </select>
              <button onClick={() => setShowAddForm(!showAddForm)} className="fiducia-button fiducia-button-primary">Add Person</button>
            </div>

            {showAddForm && (
              <form onSubmit={addPerson} className="fiducia-card" style={{ padding: 20, marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input placeholder="Full name" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} required
                  style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(20,25,40,0.6)', color: '#fff', outline: 'none' }}
                />
                <input placeholder="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required
                  style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(20,25,40,0.6)', color: '#fff', outline: 'none' }}
                />
                <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
                  style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(20,25,40,0.6)', color: '#fff', outline: 'none' }}
                >
                  <option value="visitor">Visitor</option>
                  <option value="member">Member</option>
                </select>
                <button type="submit" className="fiducia-button fiducia-button-primary">Save</button>
              </form>
            )}

            {message && (
              <div className="fiducia-card" style={{ padding: 10, marginBottom: 15, color: '#34D399', textAlign: 'center' }}>{message}</div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 20 }}>
              {filtered.map(person => (
                <div
                  key={person.id}
                  className="fiducia-card"
                  onClick={() => setSelectedPerson(selectedPerson?.id === person.id ? null : person)}
                  style={{ cursor: 'pointer', transition: 'all 0.2s' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 17, color: '#f0f0f0' }}>{person.first_name}</div>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'rgba(212,175,55,0.15)', color: '#D4AF37' }}>
                      {person.type || 'visitor'}
                    </span>
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 4 }}>{person.phone || 'No phone'}</div>
                  {person.last_contacted && (
                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginBottom: 4 }}>
                      Last contacted: {new Date(person.last_contacted).toLocaleDateString()}
                    </div>
                  )}

                  {selectedPerson?.id === person.id && (
                    <div style={{ marginTop: 15, padding: '15px 0 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                        <button onClick={() => generateDraft(person.id)} className="fiducia-button fiducia-button-primary" style={{ padding: '6px 12px', fontSize: 13 }}>Draft Message</button>
                        <Link href={`/person/${person.id}`} className="fiducia-button fiducia-button-secondary" style={{ padding: '6px 12px', fontSize: 13 }}>Journey →</Link>
                        <button onClick={() => setAddingMemory(true)} className="fiducia-button fiducia-button-ghost" style={{ padding: '6px 12px', fontSize: 13 }}>
                          Remember something
                        </button>
                        <button onClick={() => setImportingConversation(true)} className="fiducia-button fiducia-button-ghost" style={{ padding: '6px 12px', fontSize: 13 }}>
                          Import Conversation
                        </button>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => handleDelete(person.id, null)} className="fiducia-button fiducia-button-ghost" style={{ padding: '4px 10px', fontSize: 13 }}>Remove</button>
                      </div>
                    </div>
                  )}

                  {/* Guided Memory form */}
                  {addingMemory && selectedPerson?.id === person.id && (
                    <div style={{ marginTop: 12, background: 'rgba(20,25,40,0.9)', borderRadius: 12, padding: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
                      <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>What would you like ARIA to remember?</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                        {['Prayer request', 'Life update', 'Feeling unwell', 'New job', 'Family news', 'Other'].map(prompt => (
                          <button key={prompt} onClick={() => setMemoryText(prompt + ': ')}
                            style={{
                              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                              color: '#D4AF37', borderRadius: 8, padding: '4px 10px', fontSize: 12, cursor: 'pointer'
                            }}>
                            {prompt}
                          </button>
                        ))}
                      </div>
                      <textarea value={memoryText} onChange={e => setMemoryText(e.target.value)} placeholder="Type what happened..." rows={3}
                        style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.03)', color: '#fff', resize: 'vertical', outline: 'none', marginBottom: 8 }}
                      />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={saveMemory} className="fiducia-button fiducia-button-primary" style={{ padding: '6px 12px', fontSize: 13 }}>Save</button>
                        <button onClick={() => { setAddingMemory(false); setMemoryText(''); }} className="fiducia-button fiducia-button-ghost" style={{ padding: '6px 12px', fontSize: 13 }}>Cancel</button>
                      </div>
                    </div>
                  )}

                  {/* Conversation Import form */}
                  {importingConversation && selectedPerson?.id === person.id && (
                    <div style={{ marginTop: 12, background: 'rgba(20,25,40,0.9)', borderRadius: 12, padding: 12, border: '1px solid rgba(255,255,255,0.05)' }}>
                      <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>Paste your WhatsApp, SMS, or notes conversation here.</p>
                      <textarea value={conversationText} onChange={e => setConversationText(e.target.value)} placeholder="Paste conversation..." rows={4}
                        style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.03)', color: '#fff', resize: 'vertical', outline: 'none', marginBottom: 8 }}
                      />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={importConversation} className="fiducia-button fiducia-button-primary" style={{ padding: '6px 12px', fontSize: 13 }}>Parse & Save</button>
                        <button onClick={() => { setImportingConversation(false); setConversationText(''); }} className="fiducia-button fiducia-button-ghost" style={{ padding: '6px 12px', fontSize: 13 }}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {filtered.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.4)' }}>No matches found.</div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
         }
