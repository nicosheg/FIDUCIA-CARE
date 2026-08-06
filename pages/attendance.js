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
  const [groupOwners, setGroupOwners] = useState({});   // { groupId: usherName }
  const [usherName, setUsherName] = useState('');
  const [people, setPeople] = useState([]);
  const [search, setSearch] = useState('');
  const [likelyPeople, setLikelyPeople] = useState([]);
  const [marked, setMarked] = useState(new Set());
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [newPerson, setNewPerson] = useState({ name: '', phone: '', type: 'visitor' });
  const [offlineQueue, setOfflineQueue] = useState([]);
  const [isOnline, setIsOnline] = useState(true);
  const [sessionActive, setSessionActive] = useState(false);
  const [progress, setProgress] = useState({});
  const pollRef = useRef(null);

  // ── Usher identity from localStorage ──
  useEffect(() => {
    const stored = localStorage.getItem('attendance_usher');
    if (stored) {
      const usher = JSON.parse(stored);
      setUsherName(usher.name);
    } else {
      router.push('/usher-setup');   // redirect to setup if not configured
    }
  }, []);

  // Network status
  useEffect(() => {
    setIsOnline(navigator.onLine);
    window.addEventListener('online', () => setIsOnline(true));
    window.addEventListener('offline', () => setIsOnline(false));
    return () => {
      window.removeEventListener('online', () => {});
      window.removeEventListener('offline', () => {});
    };
  }, []);

  // Load groups
  useEffect(() => {
    fetch('/api/attendance/groups?organization_id=' + ORG_ID)
      .then(r => r.json())
      .then(setGroups);
  }, []);

  // ── Start session ──
  const startSession = async () => {
    const res = await fetch('/api/attendance/create-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organization_id: ORG_ID,
        name: sessionName || serviceType,
        service_type: serviceType,
        started_by: usherName,
        group_ids: groups.map(g => g.id),
      }),
    });
    const data = await res.json();
    setSessionId(data.id);
    setSessionActive(true);
    // Auto‑claim the first group (or the group passed in URL)
    const firstGroup = router.query.group || (groups[0]?.id);
    if (firstGroup) claimGroup(firstGroup);
    // Load likely people for this usher
    loadLikelyPeople();
  };

  // ── Claim a group (conflict detection) ──
  const claimGroup = async (groupId) => {
    const res = await fetch('/api/attendance/claim-group', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, group_id: groupId, usher_name: usherName }),
    });
    const data = await res.json();
    if (data.claimed) {
      setSelectedGroup(groupId);
      setGroupOwners(prev => ({ ...prev, [groupId]: usherName }));
      // Fetch people for this group
      fetchPeopleForGroup(groupId);
    } else if (data.conflict) {
      alert(`"${data.owner}" is currently taking attendance for this group. You may wait or contact an admin.`);
    } else {
      // Admin override: pastor/admin can always access
      if (usherName.toLowerCase() === 'pastor' || usherName.toLowerCase() === 'admin') {
        setSelectedGroup(groupId);
        fetchPeopleForGroup(groupId);
      } else {
        alert('Could not claim this group. Please try again.');
      }
    }
  };

  const fetchPeopleForGroup = async (groupId) => {
    // Fetch people in this group (or all if group is Everyone)
    const res = await fetch(`/api/attendance/people-for-group?group_id=${groupId}&organization_id=${ORG_ID}`);
    const data = await res.json();
    setPeople(data);
  };

  // ── Likely people (frequently marked by this usher) ──
  const loadLikelyPeople = async () => {
    if (!usherName) return;
    const res = await fetch(`/api/attendance/likely-people?usher=${encodeURIComponent(usherName)}&organization_id=${ORG_ID}`);
    const data = await res.json();
    setLikelyPeople(data);
  };

  // ── Search (with display_name) ──
  useEffect(() => {
    if (!selectedGroup) return;
    const timeout = setTimeout(async () => {
      if (!search.trim()) {
        fetchPeopleForGroup(selectedGroup);
        return;
      }
      const res = await fetch(`/api/attendance/search?q=${encodeURIComponent(search)}&group_id=${selectedGroup}&organization_id=${ORG_ID}`);
      const data = await res.json();
      setPeople(data);
    }, 200);
    return () => clearTimeout(timeout);
  }, [search, selectedGroup]);

  // ── Mark person present / absent ──
  const toggleMark = (personId) => {
    const newMarked = new Set(marked);
    if (newMarked.has(personId)) {
      newMarked.delete(personId);
    } else {
      newMarked.add(personId);
    }
    setMarked(newMarked);

    // Offline queue
    const event = { person_id: personId, present: newMarked.has(personId), timestamp: Date.now() };
    const queue = JSON.parse(localStorage.getItem('attendance_queue') || '[]');
    queue.push(event);
    localStorage.setItem('attendance_queue', JSON.stringify(queue));

    if (isOnline) syncMarks();
    // Update progress locally
    updateLocalProgress(personId, newMarked.has(personId));
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
          usher_id: usherName,
          group_id: selectedGroup,
        }),
      });
    }
    localStorage.removeItem('attendance_queue');
    setOfflineQueue([]);
  };

  const updateLocalProgress = (personId, present) => {
    // Simple: just refresh progress after marking
    fetchProgress();
  };

  const fetchProgress = async () => {
    if (!sessionId) return;
    const res = await fetch(`/api/attendance/progress?session_id=${sessionId}&organization_id=${ORG_ID}`);
    const data = await res.json();
    setProgress(data);
  };

  // Poll progress every 10 seconds
  useEffect(() => {
    if (sessionActive) {
      pollRef.current = setInterval(fetchProgress, 10000);
      fetchProgress();
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [sessionActive, sessionId]);

  // ── Add new person ──
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
        attendance_group_id: selectedGroup,       // auto‑assign to current group
        display_name: newPerson.name.trim(),
      }),
    });
    const data = await res.json();
    if (data.id) {
      setMarked(prev => new Set(prev).add(data.id));
      setNewPerson({ name: '', phone: '', type: 'visitor' });
      setShowAddPerson(false);
      fetchPeopleForGroup(selectedGroup);
      loadLikelyPeople();
    }
  };

  // ── Close session & show summary ──
  const closeSession = async () => {
    if (!sessionId) return;
    await fetch('/api/attendance/close-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, closed_by: usherName }),
    });
    // Fetch summary
    const res = await fetch(`/api/attendance/summary?session_id=${sessionId}`);
    const summary = await res.json();
    alert(`Attendance Complete\n${summary.total_attended} Present\n${summary.visitors} Visitors\n${summary.new_members} New Members\n${summary.needs_followup} Need Follow‑up`);
    router.push('/');
  };

  // If no usher setup, show a link to setup
  if (!usherName) {
    return (
      <Layout>
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <h1 style={{ color: '#f0f0f0', fontSize: 24 }}>Welcome</h1>
          <p style={{ color: 'rgba(255,255,255,0.6)' }}>Please set up your usher profile first.</p>
          <a href="/usher-setup" className="fiducia-button fiducia-button-primary">Set Up Usher</a>
        </div>
      </Layout>
    );
  }

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

  const groupProgress = progress[selectedGroup] || { total: 0, marked: 0 };
  const percent = groupProgress.total > 0 ? Math.round((groupProgress.marked / groupProgress.total) * 100) : 0;

  return (
    <Layout>
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h1 style={{ fontSize: 24, color: '#f0f0f0' }}>{sessionName || serviceType}</h1>
          <button onClick={closeSession} className="fiducia-button fiducia-button-secondary">Close Session</button>
        </div>

        {/* Group selector & progress */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 15, flexWrap: 'wrap' }}>
          {groups.map(g => {
            const owner = groupOwners[g.id];
            const isOwn = owner === usherName;
            const isAvailable = !owner || isOwn || usherName.toLowerCase() === 'pastor' || usherName.toLowerCase() === 'admin';
            return (
              <button
                key={g.id}
                onClick={() => { if (isAvailable) claimGroup(g.id); }}
                style={{
                  padding: '8px 14px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.1)',
                  background: selectedGroup === g.id ? 'rgba(212,175,55,0.2)' : 'transparent',
                  color: selectedGroup === g.id ? '#D4AF37' : isAvailable ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.3)',
                  cursor: isAvailable ? 'pointer' : 'not-allowed', fontSize: 13,
                  opacity: isAvailable ? 1 : 0.5,
                }}
                disabled={!isAvailable}
              >
                {g.name}
                {owner && owner !== usherName && ` (${owner})`}
              </button>
            );
          })}
        </div>

        {/* Progress bar */}
        <div style={{ marginBottom: 15, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
            <div style={{ width: `${percent}%`, height: '100%', background: '#D4AF37', borderRadius: 3, transition: 'width 0.3s' }} />
          </div>
          <span style={{ color: '#D4AF37', fontSize: 13, fontWeight: 600 }}>{groupProgress.marked} / {groupProgress.total}</span>
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search by name or phone"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={inputStyle}
        />

        {/* Likely people (shown when search empty) */}
        {!search.trim() && likelyPeople.length > 0 && (
          <div style={{ marginBottom: 15 }}>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>Likely People</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {likelyPeople.map(p => (
                <div
                  key={p.id}
                  onClick={() => toggleMark(p.id)}
                  style={{
                    padding: '8px 14px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.1)',
                    background: marked.has(p.id) ? 'rgba(52,211,153,0.2)' : 'rgba(255,255,255,0.03)',
                    color: marked.has(p.id) ? '#34D399' : 'rgba(255,255,255,0.7)',
                    cursor: 'pointer', fontSize: 13, userSelect: 'none',
                  }}
                >
                  {p.display_name || p.first_name}
                </div>
              ))}
            </div>
          </div>
        )}

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
              <div style={{ fontWeight: 500, color: '#f0f0f0' }}>{person.display_name || person.first_name}</div>
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
