// pages/attendance.js – Premium Responsive Attendance Page (with group wrapping & inline button)
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
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── Fetch groups ───
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

  // ─── Mark attendance ───
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
        <div className="attendance-loading">
          <div className="loading-skeleton" />
          <div className="loading-skeleton" style={{ width: '70%' }} />
          <div className="loading-skeleton" style={{ width: '50%' }} />
        </div>
        <style jsx>{`
          .attendance-loading {
            max-width: 800px;
            margin: 0 auto;
            padding: var(--space-xl) var(--space-md);
            display: flex;
            flex-direction: column;
            gap: var(--space-md);
          }
          .loading-skeleton {
            height: 60px;
            border-radius: 12px;
            background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 75%);
            background-size: 200% 100%;
            animation: shimmer 1.5s ease-in-out infinite;
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
        <header className="attendance-header">
          <h1 className="attendance-title">Attendance</h1>
          {session && (
            <span className="session-status-badge">
              {session.name}
            </span>
          )}
        </header>

        {error && (
          <div className="attendance-error">
            {error}
          </div>
        )}

        <section className="session-card">
          {session ? (
            <>
              <div className="session-info">
                <span className="session-name">{session.name}</span>
                <span className="session-date">
                  {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </span>
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
                className="button button-ghost session-refresh"
              >
                Refresh
              </button>
            </>
          ) : (
            <>
              <p className="no-session-message">No active session.</p>
              <button onClick={createSession} className="button button-primary">
                Start Attendance
              </button>
            </>
          )}
        </section>

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
          <section className="groups-section">
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
          </section>
        )}

        {session && selectedGroup && (
          <div className="claim-section">
            <button
              onClick={() => claimGroup(selectedGroup)}
              disabled={claimedGroups[selectedGroup]}
              className={`button button-secondary ${claimedGroups[selectedGroup] ? 'claimed' : ''}`}
            >
              {claimedGroups[selectedGroup] ? '✓ Claimed' : 'Claim this group'}
            </button>
          </div>
        )}

        {session && people.length > 0 && (
          <section className="people-section">
            <div className="people-header">
              <h2 className="section-title">People</h2>
              <span className="people-count">{markedCount} marked</span>
            </div>
            <div className="people-list">
              {people.map(p => (
                <div
                  key={p.id}
                  className={`person-card ${p.marked ? 'marked' : ''}`}
                >
                  <div className="person-info">
                    <span className="person-name">{p.first_name}</span>
                    <span className="person-phone">{p.phone || 'No phone'}</span>
                  </div>
                  <button
                    onClick={() => markAttendance(p.id, !p.marked)}
                    className={`button button-mark ${p.marked ? 'marked' : ''}`}
                  >
                    {p.marked ? 'Present ✓' : 'Mark Present'}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <style jsx>{`
        :root {
          --space-xs: 4px;
          --space-sm: 8px;
          --space-md: 16px;
          --space-lg: 24px;
          --space-xl: 32px;
          --radius: 12px;
          --font-base: clamp(14px, 1.5vw, 16px);
          --color-gold: #D4AF37;
          --color-bg: rgba(255,255,255,0.03);
          --color-border: rgba(255,255,255,0.06);
          --color-text: #f0f0f0;
          --color-text-muted: rgba(255,255,255,0.5);
        }

        .attendance-container {
          max-width: 900px;
          margin: 0 auto;
          padding: var(--space-md);
          padding-bottom: 100px;
          overflow-x: hidden;
          font-size: var(--font-base);
          line-height: 1.5;
        }

        @media (min-width: 768px) {
          .attendance-container {
            padding: var(--space-lg) var(--space-xl);
          }
        }

        /* ─── Header ─── */
        .attendance-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: var(--space-lg);
          flex-wrap: wrap;
          gap: var(--space-sm);
        }
        .attendance-title {
          font-size: clamp(20px, 4vw, 28px);
          font-weight: 600;
          color: var(--color-text);
          margin: 0;
        }
        .session-status-badge {
          font-size: 0.8rem;
          padding: 4px 12px;
          border-radius: 20px;
          background: rgba(212, 175, 55, 0.15);
          color: var(--color-gold);
          border: 1px solid rgba(212, 175, 55, 0.2);
          white-space: nowrap;
        }

        .attendance-error {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid #EF4444;
          border-radius: var(--radius);
          padding: var(--space-md);
          margin-bottom: var(--space-lg);
          color: #EF4444;
          font-size: 0.9rem;
        }

        /* ─── Session Card ─── */
        .session-card {
          background: var(--color-bg);
          border: 1px solid var(--color-border);
          border-radius: var(--radius);
          padding: var(--space-md) var(--space-lg);
          margin-bottom: var(--space-lg);
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: var(--space-md);
        }
        .session-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .session-name {
          font-weight: 600;
          color: var(--color-text);
          font-size: 1.1rem;
        }
        .session-date {
          color: var(--color-text-muted);
          font-size: 0.8rem;
        }
        .session-progress {
          flex: 1;
          min-width: 120px;
        }
        .progress-label {
          display: flex;
          justify-content: space-between;
          font-size: 0.8rem;
          color: var(--color-text-muted);
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
          background: var(--color-gold);
          border-radius: 4px;
          transition: width 0.4s ease;
        }
        .session-refresh {
          margin-left: auto;
        }
        .no-session-message {
          color: var(--color-text-muted);
          margin: 0;
        }

        .button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 10px 20px;
          border-radius: 30px;
          font-weight: 500;
          font-size: 0.9rem;
          border: 1px solid transparent;
          cursor: pointer;
          transition: all 0.2s;
          touch-action: manipulation;
          min-height: 44px;
          text-decoration: none;
          background: transparent;
          color: var(--color-text);
        }
        .button-primary {
          background: rgba(212, 175, 55, 0.15);
          border-color: rgba(212, 175, 55, 0.3);
          color: var(--color-gold);
        }
        .button-primary:active {
          background: rgba(212, 175, 55, 0.25);
          transform: scale(0.98);
        }
        .button-secondary {
          background: rgba(255,255,255,0.04);
          border-color: rgba(255,255,255,0.08);
          color: var(--color-text);
        }
        .button-secondary:active {
          background: rgba(255,255,255,0.08);
        }
        .button-ghost {
          background: transparent;
          border-color: rgba(255,255,255,0.08);
          color: var(--color-text-muted);
        }
        .button-ghost:active {
          background: rgba(255,255,255,0.04);
        }
        .button-mark {
          padding: 6px 16px;
          font-size: 0.8rem;
          background: rgba(255,255,255,0.04);
          border-color: rgba(255,255,255,0.08);
          color: var(--color-text);
          min-height: 36px;
          flex-shrink: 0;
        }
        .button-mark.marked {
          background: rgba(52, 211, 153, 0.15);
          border-color: rgba(52, 211, 153, 0.2);
          color: #34D399;
        }
        .button-mark:active {
          transform: scale(0.96);
        }
        .button.claimed {
          opacity: 0.6;
          cursor: default;
        }

        .username-section {
          margin-bottom: var(--space-lg);
        }
        .username-label {
          display: block;
          color: var(--color-text-muted);
          font-size: 0.8rem;
          margin-bottom: var(--space-xs);
        }
        .username-input {
          width: 100%;
          padding: 10px 14px;
          border-radius: var(--radius);
          border: 1px solid var(--color-border);
          background: var(--color-bg);
          color: var(--color-text);
          font-size: 1rem;
          outline: none;
          transition: border-color 0.2s;
        }
        .username-input:focus {
          border-color: rgba(212, 175, 55, 0.4);
        }

        /* ─── Groups – now wrap (no horizontal scroll) ─── */
        .groups-section {
          margin-bottom: var(--space-lg);
        }
        .section-title {
          font-size: 1rem;
          font-weight: 600;
          color: var(--color-text);
          margin: 0 0 var(--space-sm) 0;
        }
        .groups-wrap {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-sm);
          align-items: center;
        }
        .group-tab {
          padding: 8px 16px;
          border-radius: 20px;
          border: 1px solid var(--color-border);
          background: transparent;
          color: var(--color-text-muted);
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.2s;
          touch-action: manipulation;
          white-space: nowrap;
          min-height: 40px;
          flex-shrink: 0;
        }
        .group-tab.active {
          background: rgba(212, 175, 55, 0.12);
          border-color: rgba(212, 175, 55, 0.3);
          color: var(--color-gold);
          font-weight: 500;
        }
        .group-tab:active {
          transform: scale(0.96);
        }

        .claim-section {
          margin-bottom: var(--space-lg);
        }

        /* ─── People List – button stays inline ─── */
        .people-section {
          margin-top: var(--space-lg);
        }
        .people-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: var(--space-md);
        }
        .people-count {
          font-size: 0.85rem;
          color: var(--color-text-muted);
        }
        .people-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-sm);
        }
        .person-card {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: var(--color-bg);
          border: 1px solid var(--color-border);
          border-radius: var(--radius);
          padding: 10px 14px;
          transition: all 0.2s;
          gap: var(--space-sm);
          flex-wrap: nowrap;  /* keep everything on one line */
        }
        .person-card.marked {
          background: rgba(52, 211, 153, 0.04);
          border-color: rgba(52, 211, 153, 0.1);
        }
        .person-info {
          display: flex;
          flex-direction: column;
          min-width: 0;
          flex: 1;
        }
        .person-name {
          font-weight: 500;
          color: var(--color-text);
          font-size: 1rem;
          line-height: 1.3;
          word-break: break-word;
        }
        .person-phone {
          font-size: 0.8rem;
          color: var(--color-text-muted);
        }
        @media (max-width: 480px) {
          .person-card {
            padding: 8px 12px;
          }
          .button-mark {
            padding: 4px 12px;
            font-size: 0.75rem;
            min-height: 32px;
          }
          .group-tab {
            padding: 6px 12px;
            font-size: 0.75rem;
            min-height: 32px;
          }
        }
        @media (min-width: 481px) {
          .person-card {
            padding: 12px 18px;
          }
          .button-mark {
            padding: 8px 20px;
            font-size: 0.85rem;
            min-height: 40px;
          }
        }
        @media (min-width: 768px) {
          .person-card {
            padding: 14px 20px;
          }
          .groups-wrap {
            gap: var(--space-sm);
          }
        }
      `}</style>
    </Layout>
  );
}
