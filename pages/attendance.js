// pages/attendance.js – FIDUCIA CARE Premium Attendance
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

  // ─── Data fetching (unchanged) ───
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
    } finally {
      setLoading(false);
    }
  }, []);

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
    }
  };

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
          user_name: userName,
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
          user_id: userName,
          group_id: selectedGroup,
        }),
      });
      if (res.ok) {
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

  const markedCount = people.filter(p => p.marked).length;

  // ─── Shimmer loading ───
  if (loading) {
    return (
      <Layout>
        <div className="shimmer-container">
          <div className="shimmer-line" style={{ height: 60, width: '100%' }} />
          <div className="shimmer-line" style={{ height: 40, width: '70%' }} />
          <div className="shimmer-line" style={{ height: 40, width: '50%' }} />
          <div className="shimmer-line" style={{ height: 60, width: '100%' }} />
          <div className="shimmer-line" style={{ height: 60, width: '100%' }} />
        </div>
        <style jsx>{`
          .shimmer-container {
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            display: flex;
            flex-direction: column;
            gap: 16px;
          }
          .shimmer-line {
            border-radius: 12px;
            background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 75%);
            background-size: 200% 100%;
            animation: shimmer 1.8s ease-in-out infinite;
          }
          @keyframes shimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
          }
        `}</style>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="attendance-container">
        {/* ─── Header ─── */}
        <div className="attendance-header">
          <h1 className="attendance-title">Attendance</h1>
          {session && (
            <span className="session-badge">{session.name}</span>
          )}
        </div>

        {error && (
          <div className="error-box">{error}</div>
        )}

        {/* ─── Session Card ─── */}
        <div className="fiducia-card session-card">
          {session ? (
            <>
              <div className="session-info">
                <div className="session-name">{session.name}</div>
                <div className="session-date">
                  {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </div>
              </div>
              <div className="session-progress">
                <div className="progress-label">
                  <span>{markedCount} present</span>
                  <span>of {people.length}</span>
                </div>
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{ width: people.length > 0 ? `${(markedCount / people.length) * 100}%` : 0 }}
                  />
                </div>
              </div>
              <button
                onClick={fetchActiveSession}
                className="fiducia-button fiducia-button-ghost"
                style={{ padding: '6px 16px', fontSize: 14 }}
              >
                Refresh
              </button>
            </>
          ) : (
            <>
              <p className="no-session">No active session.</p>
              <button onClick={createSession} className="fiducia-button fiducia-button-primary">
                Start Attendance
              </button>
            </>
          )}
        </div>

        {/* ─── Username ─── */}
        <div className="username-section">
          <label className="username-label">Your Name (for claiming groups)</label>
          <input
            type="text"
            value={userName}
            onChange={e => setUserName(e.target.value)}
            placeholder="Enter your name"
            className="username-input"
          />
        </div>

        {/* ─── Groups ─── */}
        {session && groups.length > 0 && (
          <div className="groups-section">
            <h2 className="section-title">Groups</h2>
            <div className="groups-scroll">
              {groups.map(g => (
                <button
                  key={g.id}
                  onClick={() => {
                    setSelectedGroup(g.id);
                    fetchPeopleForGroup(g.id);
                  }}
                  className={`group-tab ${selectedGroup === g.id ? 'active' : ''}`}
                >
                  {g.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ─── Claim ─── */}
        {session && selectedGroup && (
          <div className="claim-section">
            <button
              onClick={() => claimGroup(selectedGroup)}
              disabled={claimedGroups[selectedGroup]}
              className={`fiducia-button fiducia-button-secondary ${claimedGroups[selectedGroup] ? 'claimed' : ''}`}
            >
              {claimedGroups[selectedGroup] ? '✓ Claimed' : 'Claim this group'}
            </button>
          </div>
        )}

        {/* ─── People List ─── */}
        {session && people.length > 0 && (
          <div className="people-section">
            <div className="people-header">
              <h2 className="section-title">People</h2>
              <span className="people-count">{markedCount} marked</span>
            </div>
            <div className="people-list">
              {people.map(p => (
                <div
                  key={p.id}
                  className={`person-row ${p.marked ? 'marked' : ''}`}
                >
                  <div className="person-info">
                    <span className="person-name">{p.first_name}</span>
                    <span className="person-phone">{p.phone || 'No phone'}</span>
                  </div>
                  <button
                    onClick={() => markAttendance(p.id, !p.marked)}
                    className={`fiducia-button ${p.marked ? 'fiducia-button-primary' : 'fiducia-button-ghost'}`}
                    style={{ padding: '6px 16px', fontSize: 13, flexShrink: 0 }}
                  >
                    {p.marked ? 'Present ✓' : 'Mark Present'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .attendance-container {
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
          padding-bottom: 100px;
        }
        @media (min-width: 768px) {
          .attendance-container { padding: 30px 40px; }
        }

        .attendance-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
          flex-wrap: wrap;
          gap: 8px;
        }
        .attendance-title {
          font-size: clamp(22px, 4vw, 28px);
          font-weight: 600;
          color: #f0f0f0;
          margin: 0;
        }
        .session-badge {
          font-size: 14px;
          padding: 4px 14px;
          border-radius: 20px;
          background: rgba(212,175,55,0.12);
          color: #D4AF37;
          border: 1px solid rgba(212,175,55,0.2);
          white-space: nowrap;
        }
        .error-box {
          background: rgba(239,68,68,0.08);
          border: 1px solid #EF4444;
          border-radius: 12px;
          padding: 12px 16px;
          color: #EF4444;
          margin-bottom: 20px;
        }

        /* ─── Session Card ─── */
        .session-card {
          padding: 20px 24px;
          margin-bottom: 24px;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 16px;
        }
        .session-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .session-name {
          font-weight: 600;
          font-size: 18px;
          color: #f0f0f0;
        }
        .session-date {
          font-size: 14px;
          color: rgba(255,255,255,0.5);
        }
        .session-progress {
          flex: 1;
          min-width: 120px;
        }
        .progress-label {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          color: rgba(255,255,255,0.5);
          margin-bottom: 4px;
        }
        .progress-track {
          height: 4px;
          border-radius: 4px;
          background: rgba(255,255,255,0.06);
          overflow: hidden;
        }
        .progress-fill {
          height: 100%;
          background: #D4AF37;
          border-radius: 4px;
          transition: width 0.5s ease;
        }
        .no-session {
          color: rgba(255,255,255,0.5);
          margin: 0;
        }

        /* ─── Username ─── */
        .username-section {
          margin-bottom: 20px;
        }
        .username-label {
          display: block;
          font-size: 14px;
          color: rgba(255,255,255,0.5);
          margin-bottom: 4px;
        }
        .username-input {
          width: 100%;
          padding: 10px 14px;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.06);
          background: rgba(255,255,255,0.03);
          color: #f0f0f0;
          font-size: 16px;
          outline: none;
        }
        .username-input:focus {
          border-color: rgba(212,175,55,0.3);
        }

        /* ─── Groups ─── */
        .groups-section {
          margin-bottom: 20px;
        }
        .section-title {
          font-size: 16px;
          font-weight: 600;
          color: #f0f0f0;
          margin: 0 0 10px 0;
        }
        .groups-scroll {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding-bottom: 8px;
          -webkit-overflow-scrolling: touch;
        }
        .groups-scroll::-webkit-scrollbar {
          height: 4px;
        }
        .groups-scroll::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.1);
          border-radius: 4px;
        }
        .group-tab {
          flex-shrink: 0;
          padding: 8px 16px;
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,0.06);
          background: transparent;
          color: rgba(255,255,255,0.6);
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
          min-height: 40px;
        }
        .group-tab.active {
          background: rgba(212,175,55,0.08);
          border-color: rgba(212,175,55,0.2);
          color: #D4AF37;
        }

        /* ─── Claim ─── */
        .claim-section {
          margin-bottom: 20px;
        }
        .claimed {
          opacity: 0.5;
          cursor: default;
        }

        /* ─── People ─── */
        .people-section {
          margin-top: 20px;
        }
        .people-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }
        .people-count {
          font-size: 14px;
          color: rgba(255,255,255,0.4);
        }
        .people-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .person-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 16px;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.04);
          border-radius: 12px;
          gap: 12px;
          transition: all 0.2s;
        }
        .person-row.marked {
          background: rgba(52,211,153,0.04);
          border-color: rgba(52,211,153,0.1);
        }
        .person-info {
          display: flex;
          flex-direction: column;
          min-width: 0;
          flex: 1;
        }
        .person-name {
          font-weight: 500;
          font-size: 16px;
          color: #f0f0f0;
        }
        .person-phone {
          font-size: 13px;
          color: rgba(255,255,255,0.4);
        }
        @media (max-width: 480px) {
          .session-card {
            flex-direction: column;
            align-items: stretch;
          }
          .person-row {
            flex-wrap: wrap;
          }
          .person-info {
            flex: 1 1 60%;
          }
          .person-name {
            font-size: 15px;
          }
        }
        @media (min-width: 768px) {
          .groups-scroll {
            overflow-x: visible;
            flex-wrap: wrap;
          }
        }
      `}</style>
    </Layout>
  );
    }
