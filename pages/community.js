import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import Layout from '../components/Layout';

const ORG_ID = 'demo-org';

// ── Glowing SVG icons (no emojis) ──
const ICONS = {
  visitor: (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 4-7 8-7s8 3 8 7" /></svg>),
  phone: (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="2" width="14" height="20" rx="2" /><line x1="12" y1="18" x2="12" y2="18.01" stroke="currentColor" strokeWidth="3" /></svg>),
  calendar: (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>),
  mail: (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 7l10 7 10-7" /></svg>),
  note: (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>),
  importIcon: (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>),
  check: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg>),
  trash: (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>),
  close: (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>),
  // Note prompt icons
  prayer: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2"><path d="M17 14V3a1 1 0 00-1-1H8a1 1 0 00-1 1v11l4 4 6-4z" /><path d="M12 22V8" /></svg>),
  heart: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" /></svg>),
  smile: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>),
  sick: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2"><path d="M4 4h16v16H4z" /><line x1="8" y1="8" x2="16" y2="16" /><line x1="16" y1="8" x2="8" y2="16" /></svg>),
  family: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2"><circle cx="12" cy="8" r="4" /><path d="M2 20c0-4 4-7 10-7 1.5 0 3 .3 4.3.9" /><circle cx="20" cy="18" r="3" /><path d="M20 15v2" /></svg>),
  work: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2"><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>),
  other: (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>),
};

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
  const [addingNote, setAddingNote] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [importingConversation, setImportingConversation] = useState(false);
  const [conversationText, setConversationText] = useState('');

  // Inline editing state
  const [editingPerson, setEditingPerson] = useState(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');

  // Selection mode
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const longPressTimer = useRef(null);

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

  // ─── Long‑press → select mode ───
  const onPointerDown = useCallback((personId) => {
    longPressTimer.current = setTimeout(() => {
      setSelectMode(true);
      setSelectedIds(prev => new Set(prev).add(personId));
      if (navigator.vibrate) navigator.vibrate(50);
    }, 1200);
  }, []);

  const onPointerUp = useCallback(() => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
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

  const selectAll = () => setSelectedIds(new Set(filtered.map(p => p.id)));

  const cancelSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const bulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Remove ${selectedIds.size} selected people?`)) return;
    for (const id of selectedIds) {
      await fetch('/api/people/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    }
    setPeople(prev => prev.filter(p => !selectedIds.has(p.id)));
    cancelSelectMode();
  };

  // ─── Edit from selection bar ───
  const startEditing = () => {
    if (selectedIds.size !== 1) return;
    const id = selectedIds.values().next().value;
    const person = people.find(p => p.id === id);
    if (person) {
      setEditName(person.first_name || '');
      setEditPhone(person.phone || '');
      setEditingPerson(id);
    }
  };

  const saveEdit = async (personId) => {
    if (!editName.trim()) return;
    await fetch('/api/people', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: personId, first_name: editName.trim(), last_name: '', phone: editPhone, type: people.find(p => p.id === personId)?.type || 'visitor', organization_id: ORG_ID }),
    });
    setPeople(prev => prev.map(p => p.id === personId ? { ...p, first_name: editName.trim(), phone: editPhone } : p));
    setEditingPerson(null);
    cancelSelectMode();
    setMessage('Updated');
    setTimeout(() => setMessage(''), 3000);
  };

  const cancelEditing = () => setEditingPerson(null);

  // ─── Other actions ───
  const addPerson = async e => {
    e.preventDefault();
    if (!form.full_name.trim()) return;
    const res = await fetch('/api/people', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ first_name: form.full_name.trim(), last_name: '', phone: form.phone, organization_id: ORG_ID, type: form.type }),
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
    const res = await fetch('/api/presence/draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ person_id: personId }) });
    const data = await res.json();
    if (data.message) {
      if (confirm(data.message + '\n\nOpen WhatsApp to send?')) {
        const person = people.find(p => p.id === personId);
        if (person && person.phone) {
          const phone = person.phone.startsWith('+') ? person.phone.substring(1) : person.phone;
          window.open(`https://wa.me/${phone}?text=${encodeURIComponent(data.message)}`, '_blank');
          await fetch('/api/timeline', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ person_id: personId, event_type: 'message_sent', channel: 'whatsapp', description: data.message.substring(0, 100), organization_id: ORG_ID, metadata: { type: 'manual_send' } }) });
          setMessage('Message opened in WhatsApp');
          setTimeout(() => setMessage(''), 3000);
        }
      }
    } else setMessage('Error: ' + (data.error || 'Draft failed'));
    setTimeout(() => setMessage(''), 3000);
  };

  const saveNote = async () => {
    if (!noteText.trim()) return;
    await fetch('/api/timeline', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ person_id: selectedPerson.id, event_type: 'note', channel: 'manual', description: noteText.trim(), organization_id: ORG_ID, metadata: { type: 'pastoral_note' } }) });
    setNoteText('');
    setAddingNote(false);
    setMessage('Note saved');
    setTimeout(() => setMessage(''), 3000);
  };

  const importConversation = async () => {
    if (!conversationText.trim()) return;
    const res = await fetch('/api/conversation/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ person_id: selectedPerson.id, text: conversationText.trim() }) });
    const data = await res.json();
    if (data.success) {
      setConversationText('');
      setImportingConversation(false);
      setMessage(`Conversation imported – ${data.extracted} key events extracted`);
    } else setMessage('Error: ' + (data.error || 'Import failed'));
    setTimeout(() => setMessage(''), 3000);
  };

  const handleDelete = async (personId, e) => {
    if (e) e.stopPropagation();
    if (!confirm('Remove this person?')) return;
    await fetch('/api/people/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: personId }) });
    setPeople(prev => prev.filter(p => p.id !== personId));
  };

  const stopProp = (e) => e.stopPropagation();

  if (loading) return <Layout><div style={{ padding:20 }}>…</div></Layout>;
  return (
    <Layout>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, color: '#f0f0f0', marginBottom: 25 }}>
          {people.length} lives remembered
        </h1>

        {/* Selection bar */}
        {selectMode && (
          <div style={selectBar}>
            <span style={{ color: '#f0f0f0', fontWeight: 600 }}>{selectedIds.size} selected</span>
            <button onClick={selectAll} style={barBtn}>Select All</button>
            {selectedIds.size === 1 && (
              <button onClick={startEditing} style={barBtn}>Edit</button>
            )}
            <button onClick={bulkDelete} style={{ ...barBtn, borderColor: '#EF4444', color: '#EF4444' }}>Delete</button>
            <button onClick={cancelSelectMode} style={barBtn}>Cancel</button>
          </div>
        )}

        {/* Controls – NO select button here */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="text" placeholder="Search by name or phone" value={search} onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 200, padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(20,25,40,0.8)', color: '#fff', outline: 'none' }} />
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
            style={{ padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(20,25,40,0.8)', color: '#fff', outline: 'none', width: 120 }}>
            <option value="all">All</option>
            <option value="visitor">Visitor</option>
            <option value="member">Member</option>
          </select>
          <button onClick={() => setShowAddForm(!showAddForm)} className="fiducia-button fiducia-button-primary">Add Person</button>
        </div>

        {showAddForm && (
          <form onSubmit={addPerson} className="fiducia-card" style={{ padding: 20, marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input placeholder="Full name" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} required style={miniInput} />
            <input placeholder="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required style={miniInput} />
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} style={miniInput}>
              <option value="visitor">Visitor</option>
              <option value="member">Member</option>
            </select>
            <button type="submit" className="fiducia-button fiducia-button-primary">Save</button>
          </form>
        )}

        {message && (
          <div className="fiducia-card" style={{ padding: 10, marginBottom: 15, color: '#34D399', textAlign: 'center' }}>{message}</div>
        )}

        {/* Cards grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 20 }}>
          {filtered.map(person => (
            <div
              key={person.id}
              className="fiducia-card"
              onPointerDown={() => onPointerDown(person.id)}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerLeave}
              onClick={() => {
                if (selectMode) toggleSelection(person.id);
                else if (editingPerson !== person.id) setSelectedPerson(selectedPerson?.id === person.id ? null : person);
              }}
              style={{
                cursor: 'pointer', transition: 'all 0.2s',
                border: selectedIds.has(person.id) ? '1px solid #D4AF37' : undefined,
                background: selectedIds.has(person.id) ? 'rgba(212,175,55,0.08)' : undefined,
                userSelect: 'none', WebkitUserSelect: 'none',
                position: 'relative',
              }}
            >
              {/* Checkbox in selection mode */}
              {selectMode && (
                <div style={{ position: 'absolute', top: 10, right: 10 }}>
                  {selectedIds.has(person.id) ? ICONS.check : <div style={{ width: 16, height: 16, borderRadius: 4, border: '1px solid rgba(255,255,255,0.3)' }} />}
                </div>
              )}

              {/* Inline editing (from Edit button in selection bar) */}
              {editingPerson === person.id ? (
                <div onClick={stopProp} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input value={editName} onChange={e => setEditName(e.target.value)} style={miniInput} />
                  <input value={editPhone} onChange={e => setEditPhone(e.target.value)} style={miniInput} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={(e) => { e.stopPropagation(); saveEdit(person.id); }} className="fiducia-button fiducia-button-primary" style={{ padding: '6px 12px', fontSize: 13 }}>Save</button>
                    <button onClick={(e) => { e.stopPropagation(); cancelEditing(); }} className="fiducia-button fiducia-button-ghost" style={{ padding: '6px 12px', fontSize: 13 }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Card header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontWeight: 600, fontSize: 17, color: '#f0f0f0' }}>{person.first_name}</div>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'rgba(212,175,55,0.15)', color: '#D4AF37', display: 'flex', alignItems: 'center', gap: 4 }}>
                      {ICONS.visitor} {person.type || 'visitor'}
                    </span>
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {ICONS.phone} {person.phone || 'No phone'}
                  </div>
                  {person.last_attended_date && (
                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                      {ICONS.calendar} Last attended: {new Date(person.last_attended_date).toLocaleDateString()}
                    </div>
                  )}
                  {person.last_contacted ? (
                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                      {ICONS.mail} Last contacted: {new Date(person.last_contacted).toLocaleDateString()}
                    </div>
                  ) : (
                    <div style={{ color: '#F59E0B', fontSize: 12, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                      {ICONS.mail} Never contacted
                    </div>
                  )}

                  {/* Expanded actions (tap) */}
                  {selectedPerson?.id === person.id && !selectMode && !editingPerson && (
                    <div
                      style={{ marginTop: 15, padding: '15px 0 0', borderTop: '1px solid rgba(255,255,255,0.06)' }}
                      onClick={stopProp}
                    >
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                        <button onClick={(e) => { e.stopPropagation(); generateDraft(person.id); }} className="fiducia-button fiducia-button-primary" style={actionBtnStyle}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{ICONS.mail} Draft & Send WhatsApp</span>
                        </button>
                        <Link href={`/person/${person.id}`} className="fiducia-button fiducia-button-secondary" style={actionBtnStyle}>Journey →</Link>
                        <button onClick={(e) => { e.stopPropagation(); setAddingNote(true); }} className="fiducia-button fiducia-button-ghost" style={actionBtnStyle}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{ICONS.note} Add pastoral note</span>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setImportingConversation(true); }} className="fiducia-button fiducia-button-ghost" style={actionBtnStyle}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{ICONS.importIcon} Import Conversation</span>
                        </button>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={(e) => handleDelete(person.id, e)} className="fiducia-button fiducia-button-ghost" style={actionBtnStyle}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{ICONS.trash} Remove</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Pastoral note form – glowing SVG prompts */}
                  {addingNote && selectedPerson?.id === person.id && (
                    <div style={{ marginTop: 12, background: 'rgba(20,25,40,0.9)', borderRadius: 12, padding: 12, border: '1px solid rgba(255,255,255,0.05)' }} onClick={stopProp}>
                      <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>What happened today?</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                        {[
                          { icon: ICONS.prayer, label: 'Asked for prayer' },
                          { icon: ICONS.heart, label: 'First-time visitor' },
                          { icon: ICONS.smile, label: 'Shared good news' },
                          { icon: ICONS.sick, label: 'Sick or recovering' },
                          { icon: ICONS.family, label: 'Family situation' },
                          { icon: ICONS.work, label: 'Work or school' },
                          { icon: ICONS.other, label: 'Other' },
                        ].map(prompt => (
                          <button key={prompt.label} onClick={(e) => { e.stopPropagation(); setNoteText(prompt.label + ': '); }} style={promptBtnStyle}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{prompt.icon} {prompt.label}</span>
                          </button>
                        ))}
                      </div>
                      <textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Add more details..." rows={3} style={textareaStyle} />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={(e) => { e.stopPropagation(); saveNote(); }} className="fiducia-button fiducia-button-primary" style={{ padding: '6px 12px', fontSize: 13 }}>Save</button>
                        <button onClick={(e) => { e.stopPropagation(); setAddingNote(false); setNoteText(''); }} className="fiducia-button fiducia-button-ghost" style={{ padding: '6px 12px', fontSize: 13 }}>Cancel</button>
                      </div>
                    </div>
                  )}

                  {/* Conversation Import form */}
                  {importingConversation && selectedPerson?.id === person.id && (
                    <div style={{ marginTop: 12, background: 'rgba(20,25,40,0.9)', borderRadius: 12, padding: 12, border: '1px solid rgba(255,255,255,0.05)' }} onClick={stopProp}>
                      <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>Paste your WhatsApp, SMS, or notes conversation here.</p>
                      <textarea value={conversationText} onChange={e => setConversationText(e.target.value)} placeholder="Paste conversation..." rows={4} style={textareaStyle} />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={(e) => { e.stopPropagation(); importConversation(); }} className="fiducia-button fiducia-button-primary" style={{ padding: '6px 12px', fontSize: 13 }}>Parse & Save</button>
                        <button onClick={(e) => { e.stopPropagation(); setImportingConversation(false); setConversationText(''); }} className="fiducia-button fiducia-button-ghost" style={{ padding: '6px 12px', fontSize: 13 }}>Cancel</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}

// Local styles
const miniInput = { padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(20,25,40,0.6)', color: '#fff', outline: 'none' };
const textareaStyle = { width: '100%', padding: 8, borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.03)', color: '#fff', resize: 'vertical', outline: 'none', marginBottom: 8 };
const actionBtnStyle = { padding: '6px 12px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 };
const promptBtnStyle = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#D4AF37', borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer' };
const selectBar = { position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: 'rgba(10,15,26,0.9)', backdropFilter: 'blur(20px)', borderRadius: 20, padding: '12px 24px', display: 'flex', gap: 16, zIndex: 1001, border: '1px solid rgba(255,255,255,0.06)' };
const barBtn = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', borderRadius: 10, padding: '8px 16px', fontSize: 13, cursor: 'pointer', backdropFilter: 'blur(10px)' };
