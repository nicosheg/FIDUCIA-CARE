// pages/attendance.js
import { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';

export default function AttendancePage() {
  const [session, setSession] = useState(null);
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [people, setPeople] = useState([]);
  const [userName, setUserName] = useState('');
  const [claimedGroups, setClaimedGroups] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const orgId = 'demo-org';

  // ─── Fetch active session ───
  const fetchActiveSession = useCallback(async () => {
    try {
      const res = await fetch(`/api/attendance/active-session?organization_id=${orgId}`);
      const data = await res.json();
      if (data.active) {
        setSession(data);
        await fetchGroups(data.session_id);
      } else {
        setSession(null);
        setGroups([]);
        setPeople([]);
      }
    } catch (err) {
      console.error('Error fetching active session:', err);
      setError('Could not load active session.');
    }
  }, []);

  // ─── Fetch groups for session ───
  const fetchGroups = async (sessionId) => {
    try {
      const res = await fetch(`/api/attendance/groups?organization_id=${orgId}`);
      const data = await res.json();
      setGroups(data);
      if (data.length > 0) {
        setSelectedGroup(data[0].id);
        await fetchPeopleForGroup(data[0].id);
      }
    } catch (err) {
      console.error('Error fetching groups:', err);
      setError('Could not load groups.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Fetch people for a group ───
  const fetchPeopleForGroup = async (groupId) => {
    try {
      const res = await fetch(`/api/attendance/people-for-group?group_id=${groupId}&organization_id=${orgId}`);
      const data = await res.json();
      setPeople(data);
    } catch (err) {
      console.error('Error fetching people:', err);
      setError('Could not load people for this group.');
    }
  };

  // ─── Create a new session ───
  const createSession = async () => {
    const name = prompt('Enter session name (e.g., Sunday Worship):');
    if (!name) return;
    try {
      const res = await fetch('/api/attendance/create-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organization_id: orgId,
          name,
          group_ids: groups.map(g => g.id),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        await fetchActiveSession();
      } else {
        alert('Failed to create session: ' + data.error);
      }
    } catch (err) {
      console.error('Error creating session:', err);
      alert('Could not create session.');
    }
  };

  // ─── Claim a group ───
  const claimGroup = async (groupId) => {
    if (!userName.trim()) {
      alert('Please enter your name first.');
      return;
    }
    try {
      const res = await fetch('/api/attendance/claim-group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: session.session_id,
          group_id: groupId,
          user_name: userName,   // ✅ changed from usher_name
        }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.claimed) {
          setClaimedGroups(prev => ({ ...prev, [groupId]: true }));
          alert('Group claimed successfully!');
        } else if (data.conflict) {
          alert(`This group is already claimed by ${data.owner}.`);
        }
      } else {
        alert('Could not claim this group. Please try again.');
      }
    } catch (err) {
      console.error('Error claiming group:', err);
      alert('Could not claim this group. Please try again.');
    }
  };

  // ─── Mark attendance for a person ───
  const markAttendance = async (personId, present) => {
    if (!session) return;
    try {
      const res = await fetch('/api/attendance/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: session.session_id,
          people_id: personId,
          present,
          user_id: userName, // using userName as identifier (could be user ID, but we use name for now)
          group_id: selectedGroup,
        }),
      });
      if (res.ok) {
        // Update local state to reflect change
        setPeople(prev => prev.map(p =>
          p.id === personId ? { ...p, marked: present } : p
        ));
      } else {
        const data = await res.json();
        alert('Failed to mark attendance: ' + data.error);
      }
    } catch (err) {
      console.error('Error marking attendance:', err);
      alert('Could not mark attendance.');
    }
  };

  useEffect(() => {
    fetchActiveSession();
  }, [fetchActiveSession]);

  if (loading) {
    return (
      <Layout>
        <div style={{ padding: '40px', textAlign: 'center' }}>Loading attendance…</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '20px' }}>
        <h1 style={{ color: '#f0f0f0', fontSize: 28, fontWeight: 600, marginBottom: 20 }}>Attendance</h1>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid #EF4444', borderRadius: 8, padding: 12, marginBottom: 16, color: '#EF4444' }}>
            {error}
          </div>
        )}

        {/* Active session */}
        {session ? (
          <div className="fiducia-card" style={{ padding: '16px 20px', marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ color: '#D4AF37', fontWeight: 600 }}>Active Session:</span>
                <span style={{ color: '#f0f0f0', marginLeft: 8 }}>{session.name}</span>
              </div>
              <button
                onClick={fetchActiveSession}
                className="fiducia-button fiducia-button-ghost"
                style={{ padding: '4px 12px', fontSize: 13 }}
              >
                Refresh
              </button>
            </div>
          </div>
        ) : (
          <div className="fiducia-card" style={{ padding: '16px 20px', marginBottom: 20, textAlign: 'center' }}>
            <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: 12 }}>No active session.</p>
            <button onClick={createSession} className="fiducia-button fiducia-button-primary">
              Start Attendance
            </button>
          </div>
        )}

        {/* User name input */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: 14, marginBottom: 4 }}>
            Your Name (for claiming groups)
          </label>
          <input
            type="text"
            value={userName}
            onChange={e => setUserName(e.target.value)}
            placeholder="Enter your name"
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.05)',
              color: '#f0f0f0',
              outline: 'none',
            }}
          />
        </div>

        {/* Groups */}
        {session && groups.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ color: '#f0f0f0', fontSize: 18, fontWeight: 600, marginBottom: 12 }}>Groups</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {groups.map(g => (
                <button
                  key={g.id}
                  onClick={() => {
                    setSelectedGroup(g.id);
                    fetchPeopleForGroup(g.id);
                  }}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 20,
                    border: selectedGroup === g.id ? '2px solid #D4AF37' : '1px solid rgba(255,255,255,0.1)',
                    background: selectedGroup === g.id ? 'rgba(212,175,55,0.15)' : 'transparent',
                    color: selectedGroup === g.id ? '#D4AF37' : 'rgba(255,255,255,0.7)',
                    cursor: 'pointer',
                    fontWeight: selectedGroup === g.id ? 600 : 400,
                  }}
                >
                  {g.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Claim group button */}
        {session && selectedGroup && (
          <div style={{ marginBottom: 20 }}>
            <button
              onClick={() => claimGroup(selectedGroup)}
              disabled={claimedGroups[selectedGroup]}
              className="fiducia-button fiducia-button-secondary"
              style={{ padding: '6px 16px', fontSize: 14, opacity: claimedGroups[selectedGroup] ? 0.5 : 1 }}
            >
              {claimedGroups[selectedGroup] ? 'Claimed' : 'Claim this group'}
            </button>
          </div>
        )}

        {/* People list with attendance toggle */}
        {session && people.length > 0 && (
          <div>
            <h2 style={{ color: '#f0f0f0', fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
              People ({people.filter(p => p.marked).length} marked)
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {people.map(p => (
                <div
                  key={p.id}
                  className="fiducia-card"
                  style={{
                    padding: '12px 16px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: p.marked ? 'rgba(52,211,153,0.08)' : 'transparent',
                    border: p.marked ? '1px solid rgba(52,211,153,0.2)' : '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  <span style={{ color: '#f0f0f0' }}>{p.first_name}</span>
                  <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>{p.phone || 'No phone'}</span>
                  <button
                    onClick={() => markAttendance(p.id, !p.marked)}
                    className={p.marked ? 'fiducia-button fiducia-button-primary' : 'fiducia-button fiducia-button-ghost'}
                    style={{ padding: '4px 12px', fontSize: 13 }}
                  >
                    {p.marked ? 'Present ✓' : 'Mark Present'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
