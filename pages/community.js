import { useState, useEffect, useCallback, useRef } from 'react';
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
  const [form, setForm] = useState({ first_name: '', last_name: '', phone: '', type: 'visitor' });
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({ first_name: '', phone: '', type: '' });
  const [showDeleted, setShowDeleted] = useState(false);

  // Selection state
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const longPressTimer = useRef(null);

  useEffect(() => {
    fetchPeople();
  }, [showDeleted]);

  const fetchPeople = async () => {
    const res = await fetch(`/api/people?organization_id=${ORG_ID}&include_deleted=${showDeleted}`);
    const data = await res.json();
    if (Array.isArray(data)) {
      setPeople(data);
      setLoading(false);
    }
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

  // ----- OPTIMISTIC DELETE (single) -----
  const handleDeleteSingle = async (personId, e) => {
    if (e) e.stopPropagation();
    if (!confirm('Move to trash?')) return;

    // Remove from UI instantly
    const backup = people.find(p => p.id === personId);
    setPeople(prev => prev.filter(p => p.id !== personId));

    try {
      const res = await fetch('/api/people/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: personId }),
      });
      const data = await res.json();
      if (!data.success) {
        // Restore if API failed
        setPeople(prev => [...prev, backup]);
        alert('Delete failed: ' + (data.error || 'Unknown'));
      }
    } catch (err) {
      // Network error – restore
      setPeople(prev => [...prev, backup]);
      alert('Network error – person not deleted.');
    }
  };

  // ----- OPTIMISTIC BULK DELETE -----
  const bulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Move ${selectedIds.size} selected people to trash?`)) return;

    // Backup for rollback
    const backup = people.filter(p => selectedIds.has(p.id));
    setPeople(prev => prev.filter(p => !selectedIds.has(p.id)));
    setSelectedIds(new Set());
    setSelectMode(false);

    for (const id of selectedIds) {
      try {
        await fetch('/api/people/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        });
      } catch (err) {
        // Rollback all on any error – you can also do per‑item
        setPeople(prev => [...backup, ...prev]);
        alert('One or more deletes failed. Rolled back.');
        break;
      }
    }
    setMessage(`🗑️ Trashed ${selectedIds.size} people`);
    setTimeout(() => setMessage(''), 3000);
  };

  const handleRestore = async personId => {
    const res = await fetch('/api/people/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: personId }),
    });
    const data = await res.json();
    if (data.success) {
      fetchPeople();
      setMessage('🔄 Restored');
      setTimeout(() => setMessage(''), 3000);
    }
  };

  // Long press logic
  const onPointerDown = useCallback((personId) => {
    longPressTimer.current = setTimeout(() => {
      setSelectMode(true);
      setSelectedIds(prev => new Set(prev).add(personId));
      if (navigator.vibrate) navigator.vibrate(50);
    }, 2000);
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

  const cancelSelectMode = () => { setSelectMode(false); setSelectedIds(new Set()); };
  const selectAll = () => setSelectedIds(new Set(filtered.map(p => p.id)));

  if (loading) return <Layout><div style={{padding:20}}><p>…</p></div></Layout>;

  return (
    <Layout>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px' }}>
        <h1 style={pageTitle}>{people.length} lives remembered</h1>

        {selectMode && (
          <div style={selectBar}>
            <span style={{ color: '#f0f0f0', fontWeight: 600 }}>{selectedIds.size} selected</span>
            <button onClick={selectAll} style={glassBtn}>Select All</button>
            <button onClick={(e) => { e.stopPropagation(); bulkDelete(); }} style={{ ...glassBtn, borderColor: '#EF4444' }}>
              Remove
            </button>
            <button onClick={cancelSelectMode} style={glassBtn}>Cancel</button>
          </div>
        )}

        <div style={controlsRow}>
          <input type="text" placeholder="Search by name or phone" value={search} onChange={e => setSearch(e.target.value)} style={searchStyle} />
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={selectStyle}>
            <option value="all">All</option>
            <option value="visitor">Visitor</option>
            <option value="member">Member</option>
          </select>
          <button onClick={() => setShowDeleted(!showDeleted)} style={glassBtn}>
            {showDeleted ? 'Active' : 'Trash'}
          </button>
          <button onClick={() => setShowAddForm(!showAddForm)} style={glassBtn}>
            + Add Person
          </button>
        </div>

        {showAddForm && (
          <form onSubmit={addPerson} style={formCard}>
            <input placeholder="Full name" value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} required style={miniInput} />
            <input placeholder="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required style={miniInput} />
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} style={miniInput}>
              <option value="visitor">Visitor</option>
              <option value="member">Member</option>
            </select>
            <button type="submit" style={glassBtn}>Save</button>
          </form>
        )}

        {message && <div style={msgStyle}>{message}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {filtered.map(person => (
            <div
              key={person.id}
              onPointerDown={() => onPointerDown(person.id)}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerLeave}
              onClick={() => toggleSelection(person.id)}
              style={{
                background: selectedIds.has(person.id) ? 'rgba(212,175,55,0.08)' : 'rgba(255,255,255,0.02)',
                backdropFilter: 'blur(20px)',
                borderRadius: 20,
                padding: 20,
                border: selectedIds.has(person.id) ? '1px solid #D4AF37' : '1px solid rgba(255,255,255,0.04)',
                cursor: 'pointer',
                userSelect: 'none',
                transition: 'all 0.3s',
              }}
            >
              {editingId === person.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input value={editValues.first_name} onChange={e => setEditValues({ ...editValues, first_name: e.target.value })} style={editInput} />
                  <input value={editValues.phone} onChange={e => setEditValues({ ...editValues, phone: e.target.value })} style={editInput} />
                  <select value={editValues.type} onChange={e => setEditValues({ ...editValues, type: e.target.value })} style={editInput}>
                    <option value="visitor">Visitor</option>
                    <option value="member">Member</option>
                  </select>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => saveEdit(person.id)} style={glassBtn}>💾 Save</button>
                    <button onClick={cancelEdit} style={glassBtn}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ fontWeight: 600, fontSize: 17, color: '#f0f0f0' }}>{person.first_name}</div>
                    {person.type && (
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'rgba(212,175,55,0.15)', color: '#D4AF37' }}>
                        {person.type}
                      </span>
                    )}
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 14 }}>{person.phone || 'No phone'}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => startEdit(person)} style={actionLink}>✏️ Edit</button>
                    <Link href={`/person/${person.id}`} style={actionLink}>📋 Journey</Link>
                    <button onClick={(e) => handleDeleteSingle(person.id, e)} style={actionBtn}>
                      Remove
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.4)' }}>
            No people found.
          </div>
        )}
      </div>
    </Layout>
  );
}

// Styles (same as before)
const pageTitle = { fontSize: 28, fontWeight: 600, color: '#f0f0f0', marginBottom: 25 };
const selectBar = {
  position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
  background: 'rgba(10,15,26,0.9)', backdropFilter: 'blur(20px)',
  borderRadius: 20, padding: '12px 24px', display: 'flex', gap: 16, zIndex: 1001,
  border: '1px solid rgba(255,255,255,0.06)',
};
const glassBtn = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)',
  color: '#fff', borderRadius: 10, padding: '8px 16px', fontSize: 13, cursor: 'pointer',
  backdropFilter: 'blur(10px)',
};
const controlsRow = { display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' };
const searchStyle = {
  flex: 1, minWidth: 200, padding: '10px 14px', borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.03)',
  color: '#fff', outline: 'none', backdropFilter: 'blur(10px)',
};
const selectStyle = { ...searchStyle, flex: 'none', width: 120 };
const formCard = {
  background: 'rgba(255,255,255,0.02)', backdropFilter: 'blur(20px)',
  borderRadius: 20, padding: 20, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 10,
  border: '1px solid rgba(255,255,255,0.04)',
};
const miniInput = {
  padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)',
  background: 'rgba(255,255,255,0.03)', color: '#fff', outline: 'none',
};
const msgStyle = { background: 'rgba(52,211,153,0.1)', padding: 10, borderRadius: 12, marginBottom: 15, color: '#34D399' };
const editInput = { ...miniInput, width: '100%' };
const actionLink = {
  textDecoration: 'none', fontSize: 13, color: '#D4AF37', padding: '4px 10px',
  borderRadius: 8, border: '1px solid rgba(212,175,55,0.2)', background: 'rgba(212,175,55,0.05)',
  cursor: 'pointer', display: 'inline-block',
};
const actionBtn = {
  background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)',
  borderRadius: 8, padding: '4px 10px', fontSize: 13, cursor: 'pointer',
};
