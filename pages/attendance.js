import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';

const ORG_ID = 'demo-org';

export default function AttendancePage() {
  const router = useRouter();
  const [sessionId, setSessionId] = useState(null);
  const [sessionName, setSessionName] = useState('');
  const [serviceType, setServiceType] = useState('Sunday First Service');
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [people, setPeople] = useState([]);
  const [search, setSearch] = useState('');
  const [recentlySeen, setRecentlySeen] = useState([]);
  const [marked, setMarked] = useState(new Set());
  const [usherId, setUsherId] = useState('');
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [newPerson, setNewPerson] = useState({ name: '', phone: '', type: 'visitor' });
  const [offlineQueue, setOfflineQueue] = useState([]);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    window.addEventListener('online', () => setIsOnline(true));
    window.addEventListener('offline', () => setIsOnline(false));
    const storedUsher = localStorage.getItem('attendance_usher_id');
    if (storedUsher) setUsherId(storedUsher);
    else {
      const name = prompt('Enter your name (usher)');
      if (name) {
        localStorage.setItem('attendance_usher_id', name);
        setUsherId(name);
      }
    }
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    const res = await fetch(`/api/attendance/groups?organization_id=${ORG_ID}`);
    const data = await res.json();
    setGroups(data);
    if (data.length > 0) setSelectedGroup(data[0].id);
  };

  const startSession = async () => {
    const res = await fetch('/api/attendance/create-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organization_id: ORG_ID,
        name: sessionName || serviceType,
        service_type: serviceType,
        group_ids: groups.map(g => g.id),
      }),
    });
    const data = await res.json();
    setSessionId(data.id);
    // Preload recently seen for this usher
    loadRecentlySeen();
  };

  const loadRecentlySeen = async () => {
    if (!usherId) return;
    const res = await fetch(`/api/attendance/search?usher_id=${usherId}&organization_id=${ORG_ID}`);
    const data = await res.json();
    setRecentlySeen(data);
  };

  // Search people (used for both search and recently seen fallback)
  const searchPeople = async (query) => {
    if (!query.trim()) {
      setPeople(recentlySeen);
      return;
    }
    const res = await fetch(`/api/attendance/search?q=${encodeURIComponent(query)}&organization_id=${ORG_ID}`);
    const data = await res.json();
    setPeople(data);
  };

  useEffect(() => {
    if (!search.trim()) {
      setPeople(recentlySeen);
    } else {
      const timeout = setTimeout(() => searchPeople(search), 200);
      return () => clearTimeout(timeout);
    }
  }, [search, recentlySeen]);

  // Mark person present (offline-capable)
  const toggleMark = (personId) => {
    const newMarked = new Set(marked);
    if (newMarked.has(personId)) {
      newMarked.delete(personId);
    } else {
      newMarked.add(personId);
    }
    setMarked(newMarked);

    // Save locally
    const markEvent = { person_id: personId, present: newMarked.has(personId), timestamp: Date.now() };
    const queue = JSON.parse(localStorage.getItem('attendance_queue') || '[]');
    queue.push(markEvent);
    localStorage.setItem('attendance_queue', JSON.stringify(queue));

    // If online, try to send immediately
    if (isOnline) syncMarks();
  };

  const syncMarks = async () => {
    const queue = JSON.parse(localStorage.getItem('attendance_queue') || '[]');
    if (queue.length === 0) return;
    for (const item of queue) {
      await fetch('/api/attendance/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          person_id: item.person_id,
          present: item.present,
          usher_id: usherId,
          group_id: selectedGroup,
        }),
      });
    }
    localStorage.removeItem('attendance_queue');
    setOfflineQueue([]);
  };

  // Add new person
  const addNewPerson = async (e) => {
    e.preventDefault();
    if (!newPerson.name.trim()) return;
    const res = await fetch('/api/people', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        first_name: newPerson.name.trim(),
        last_name: '',
        phone: newPerson.phone,
        organization_id: ORG_ID,
        type: newPerson.type,
      }),
    });
    const data = await res.json();
    if (data.id) {
      setMarked(prev => new Set(prev).add(data.id)); // auto‑mark as present
      setNewPerson({ name: '', phone: '', type: 'visitor' });
      setShowAddPerson(false);
      // Refresh people list
      loadRecentlySeen();
    }
  };

  const closeSession = async () => {
    if (!sessionId) return;
    await fetch('/api/attendance/close-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    });
    router.push('/'); // back to dashboard
  };

  if (!sessionId) {
    return (
      <Layout>
        <div style={{ maxWidth: 500, margin: '40px auto', padding: '0 20px', textAlign: 'center' }}>
          <h1 style={{ color: '#f0f0f0', fontSize: 24 }}>Start Attendance</h1>
          <input
            type="text"
            placeholder="Session name (e.g., Sunday Worship)"
            value={sessionName}
            onChange={e => setSessionName(e.target.value)}
            style={inputStyle}
          />
          <button onClick={startSession} className="fiducia-button fiducia-button-primary" style={{ marginTop: 15 }}>
            Start Attendance
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h1 style={{ fontSize: 24, color: '#f0f0f0' }}>{sessionName || serviceType}</h1>
          <button onClick={closeSession} className="fiducia-button fiducia-button-secondary">Close Session</button>
        </div>

        {/* Group selector */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 15, flexWrap: 'wrap' }}>
          {groups.map(g => (
            <button
              key={g.id}
              onClick={() => setSelectedGroup(g.id)}
              style={{
                padding: '8px 14px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.1)',
                background: selectedGroup === g.id ? 'rgba(212,175,55,0.2)' : 'transparent',
                color: selectedGroup === g.id ? '#D4AF37' : 'rgba(255,255,255,0.7)',
                cursor: 'pointer', fontSize: 13,
              }}
            >
              {g.name}
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search by name or phone"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={inputStyle}
        />

        {/* Add new person button */}
        <button onClick={() => setShowAddPerson(!showAddPerson)} className="fiducia-button fiducia-button-ghost" style={{ margin: '10px 0' }}>
          + Add Visitor / Member
        </button>
        {showAddPerson && (
          <form onSubmit={addNewPerson} className="fiducia-card" style={{ padding: 15, marginBottom: 15, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input placeholder="Full name" value={newPerson.name} onChange={e => setNewPerson({ ...newPerson, name: e.target.value })} style={miniInput} />
            <input placeholder="Phone (optional)" value={newPerson.phone} onChange={e => setNewPerson({ ...newPerson, phone: e.target.value })} style={miniInput} />
            <select value={newPerson.type} onChange={e => setNewPerson({ ...newPerson, type: e.target.value })} style={miniInput}>
              <option value="visitor">Visitor</option>
              <option value="member">Member</option>
            </select>
            <button type="submit" className="fiducia-button fiducia-button-primary">Add & Mark Present</button>
          </form>
        )}

        {/* People list */}
        <div style={{ marginTop: 10 }}>
          {people.map(person => (
            <div
              key={person.id}
              onClick={() => toggleMark(person.id)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 12px', borderRadius: 12, marginBottom: 6,
                background: marked.has(person.id) ? 'rgba(52,211,153,0.1)' : 'rgba(255,255,255,0.03)',
                border: marked.has(person.id) ? '1px solid #34D399' : '1px solid rgba(255,255,255,0.06)',
                cursor: 'pointer', userSelect: 'none',
              }}
            >
              <div style={{ fontWeight: 500, color: '#f0f0f0' }}>{person.first_name}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {person.phone && <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>{person.phone}</span>}
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'rgba(212,175,55,0.15)', color: '#D4AF37' }}>
                  {person.type || 'visitor'}
                </span>
                {marked.has(person.id) ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2"><circle cx="12" cy="12" r="10" /></svg>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}

const inputStyle = {
  width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)',
  background: 'rgba(20,25,40,0.8)', color: '#fff', outline: 'none', fontSize: 16, marginBottom: 10,
};
const miniInput = { padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(20,25,40,0.6)', color: '#fff', outline: 'none' };
