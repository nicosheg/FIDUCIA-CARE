// pages/attendance.js – FIDUCIA design system only
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

  if (loading) {
    return (
      <Layout>
        <div className="loading-container">
          <div className="loading-skeleton" />
          <div className="loading-skeleton" style={{ width: '70%' }} />
          <div className="loading-skeleton" style={{ width: '50%' }} />
        </div>
        <style jsx>{`
          .loading-container {
            max-width: 700px;
            margin: 40px auto;
            padding: 0 20px;
            display: flex;
            flex-direction: column;
            gap: 16px;
          }
          .loading-skeleton {
            height: 60px;
            border-radius: 26px;
            background: linear-gradient(110deg, 
              rgba(255,255,255,0.02) 25%, 
              rgba(255,255,255,0.05) 50%, 
              rgba(255,255,255,0.02) 75%
            );
            background-size: 200% 100%;
            animation: shimmer 5s ease-in-out infinite;
          }
          @keyframes shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
        `}</style>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="attendance-container">
        <div className="attendance-header">
          <h1 className="attendance-title">Attendance</h1>
          {session && (
            <span className="session-badge">
              {session.name}
            </span>
          )}
        </div>

        {error && (
          <div className="attendance-error">
            {error}
          </div>
        )}

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
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: people.length > 0 ? `${(markedCount / people.length) * 100}%` : 0 }}
                  />
                </div>
              </div>
              <button
                onClick={fetchActiveSession}
                className="fiducia-button fiducia-button-ghost session-refresh"
              >
                Refresh
              </button>
            </>
          ) : (
            <>
              <p className="no-session-message">No active session.</p>
              <button onClick={createSession} className="fiducia-button fiducia-button-primary">
                Start Attendance
              </button>
            </>
          )}
        </div>

        <div className="username-section">
          <label htmlFor="username-input" className="username-label">
            Your Name (for claiming groups)
          </label>
          <input
            id="username-input"
            type="text"
            value={userName}
            onChange={e => setUserName(e.target.value)}
            placeholder="Enter your name"
            className="username-input"
          />
        </div>

        {session && groups.length > 0 && (
          <div className="groups-section">
            <h2 className="section-title">Groups</h2>
            <div className="groups-wrap">
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
                  className={`fiducia-card person-card ${p.marked ? 'marked' : ''}`}
                >
                  <div className="person-info">
                    <div className="person-name">{p.first_name}</div>
                    <div className="person-phone">{p.phone || 'No phone'}</div>
                  </div>
                  <button
                    onClick={() => markAttendance(p.id, !p.marked)}
                    className={`fiducia-button fiducia-button-ghost button-mark ${p.marked ? 'marked' : ''}`}
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
          max-width: 700px;
          margin: 0 auto;
          padding: 20px;
          padding-bottom: 80px;
        }

        @media (min-width: 768px) {
          .attendance-container {
            padding: 40px 20px;
          }
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
          font-size: clamp(24px, 4vw, 32px);
          font-weight: 600;
          color: #f0f0f0;
          margin: 0;
        }
        .session-badge {
          font-size: 0.8rem;
          padding: 4px 14px;
          border-radius: 20px;
          background: rgba(212, 175, 55, 0.15);
          color: #D4AF37;
          border: 1px solid rgba(212, 175, 55, 0.2);
          white-space: nowrap;
        }

        .attendance-error {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid #EF4444;
          border-radius: 12px;
          padding: 12px 16px;
          margin-bottom: 20px;
          color: #EF4444;
          font-size: 0.9rem;
        }

        .session-card {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 20px 24px;
          margin-bottom: 24px;
        }
        .session-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
          flex: 1;
        }
        .session-name {
          font-weight: 600;
          color: #f0f0f0;
          font-size: 1.1rem;
        }
        .session-date {
          color: rgba(255,255,255,0.5);
          font-size: 0.8rem;
        }
        .session-progress {
          flex: 2;
          min-width: 120px;
        }
        .progress-label {
          display: flex;
          justify-content: space-between;
          font-size: 0.8rem;
          color: rgba(255,255,255,0.5);
          margin-bottom: 4px;
        }
        .progress-bar {
          height: 4px;
          background: rgba(255,255,255,0.06);
          border-radius: 4px;
          overflow: hidden;
        }
        .progress-fill {
          height: 100%;
          background: #D4AF37;
          border-radius: 4px;
          transition: width 0.4s ease;
        }
        .session-refresh {
          margin-left: auto;
        }
        .no-session-message {
          color: rgba(255,255,255,0.5);
          margin: 0;
        }

        .username-section {
          margin-bottom: 24px;
        }
        .username-label {
          display: block;
          color: rgba(255,255,255,0.5);
          font-size: 0.85rem;
          margin-bottom: 4px;
        }
        .username-input {
          width: 100%;
          padding: 10px 14px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.06);
          background: rgba(20,25,40,0.8);
          color: #f0f0f0;
          font-size: 1rem;
          outline: none;
          transition: border-color 0.2s;
        }
        .username-input:focus {
          border-color: rgba(212, 175, 55, 0.3);
        }

        .groups-section {
          margin-bottom: 24px;
        }
        .section-title {
          font-size: 1rem;
          font-weight: 600;
          color: #f0f0f0;
          margin: 0 0 8px 0;
        }
        .groups-wrap {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
        }
        .group-tab {
          padding: 8px 16px;
          border-radius: 30px;
          border: 1px solid rgba(255,255,255,0.08);
          background: transparent;
          color: rgba(255,255,255,0.6);
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.2s;
          touch-action: manipulation;
          white-space: nowrap;
          min-height: 40px;
          flex-shrink: 0;
        }
        .group-tab.active {
          background: rgba(212, 175, 55, 0.1);
          border-color: rgba(212, 175, 55, 0.3);
          color: #D4AF37;
          font-weight: 500;
        }
        .group-tab:active {
          transform: scale(0.96);
        }

        .claim-section {
          margin-bottom: 24px;
        }
        .claim-section .fiducia-button {
          width: 100%;
        }
        .claim-section .claimed {
          opacity: 0.5;
          cursor: default;
        }

        .people-section {
          margin-top: 24px;
        }
        .people-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }
        .people-count {
          font-size: 0.85rem;
          color: rgba(255,255,255,0.5);
        }
        .people-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .person-card {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          gap: 12px;
          flex-wrap: nowrap;
          transition: border-color 0.3s, background 0.3s;
          border-radius: 26px;
        }
        .person-card.marked {
          background: rgba(52, 211, 153, 0.04);
          border-color: rgba(52, 211, 153, 0.15);
        }
        .person-info {
          display: flex;
          flex-direction: column;
          min-width: 0;
          flex: 1;
        }
        .person-name {
          font-weight: 600;
          color: #f0f0f0;
          font-size: 1.05rem;
          line-height: 1.3;
        }
        .person-phone {
          font-size: 0.8rem;
          color: rgba(255,255,255,0.4);
        }

        .button-mark {
          padding: 6px 16px;
          font-size: 0.8rem;
          min-height: 36px;
          flex-shrink: 0;
          white-space: nowrap;
        }
        .button-mark.marked {
          background: rgba(52, 211, 153, 0.1);
          border-color: rgba(52, 211, 153, 0.2);
          color: #34D399;
        }

        @media (max-width: 480px) {
          .person-card {
            padding: 12px 14px;
          }
          .person-name {
            font-size: 0.95rem;
          }
          .button-mark {
            padding: 4px 12px;
            font-size: 0.7rem;
            min-height: 32px;
          }
          .group-tab {
            padding: 6px 12px;
            font-size: 0.75rem;
            min-height: 32px;
          }
          .session-card {
            flex-direction: column;
            align-items: stretch;
          }
          .session-refresh {
            margin-left: 0;
            align-self: flex-start;
          }
        }
        @media (min-width: 481px) {
          .person-card {
            padding: 14px 20px;
          }
          .person-name {
            font-size: 1.05rem;
          }
          .button-mark {
            padding: 8px 20px;
            font-size: 0.85rem;
            min-height: 40px;
          }
        }
        @media (min-width: 768px) {
          .person-card {
            padding: 16px 24px;
          }
        }
      `}</style>
    </Layout>
  );
        }
