// components/AttendanceTab.js
// FIDUCIA CARE — Simple Attendance Workspace
// Shows the organization's people directly.
// No groups, no separate attendance page, no group claiming.
// Used inside the Home-page Attendance modal.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function AttendanceTab({ onClose }) {
  const [session, setSession] = useState(null);
  const [people, setPeople] = useState([]);
  const [search, setSearch] = useState('');
  const [markedIds, setMarkedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const getAuthSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  };

  // Load the active session and the organization's people.
  const loadAttendance = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const authSession = await getAuthSession();

      if (!authSession) {
        setError('You must be logged in.');
        return;
      }

      const headers = {
        Authorization: `Bearer ${authSession.access_token}`,
      };

      // Get current active attendance session.
      const sessionRes = await fetch('/api/attendance/active-session', {
        headers,
      });

      const sessionData = await sessionRes.json();

      if (!sessionRes.ok) {
        throw new Error(sessionData.error || 'Could not load attendance session.');
      }

      let activeSession = sessionData.active
        ? sessionData
        : null;

      // If there is no active session, create one automatically.
      // This keeps Attendance as a simple Home-page tool.
      if (!activeSession) {
        setCreating(true);

        const createRes = await fetch('/api/attendance/create-session', {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: 'Sunday Service',
          }),
        });

        const createData = await createRes.json();

        if (!createRes.ok || !createData.id) {
          throw new Error(
            createData.error || 'Could not create attendance session.'
          );
        }

        activeSession = {
          active: true,
          session_id: createData.id,
          name: createData.name || 'Sunday Service',
        };

        setCreating(false);
      }

      setSession(activeSession);

      // IMPORTANT:
      // People come from the canonical /api/people endpoint.
      // We deliberately do NOT use groups or people-for-group.
      const peopleRes = await fetch('/api/people', {
        headers,
      });

      const peopleData = await peopleRes.json();

      if (!peopleRes.ok) {
        throw new Error(
          peopleData.error || 'Could not load people.'
        );
      }

      if (!Array.isArray(peopleData)) {
        throw new Error('Invalid people response.');
      }

      setPeople(peopleData);

      // Restore people already marked present in this session.
      // This lets multiple ushers/users see the same attendance state.
      const attendanceRes = await fetch(
        `/api/attendance/session-people?session_id=${encodeURIComponent(activeSession.session_id)}`,
        { headers }
      );

      if (attendanceRes.ok) {
        const attendanceData = await attendanceRes.json();

        if (Array.isArray(attendanceData.present_ids)) {
          setMarkedIds(new Set(attendanceData.present_ids));
        }
      }
    } catch (err) {
      console.error('[ATTENDANCE] Load error:', err);
      setError(err.message || 'Could not load attendance.');
      setCreating(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

  // Mark one person present.
  const markAttendance = async personId => {
    if (!session || marking) return;

    try {
      setMarking(personId);
      setError('');

      const authSession = await getAuthSession();

      if (!authSession) {
        setError('You must be logged in.');
        return;
      }

      const res = await fetch('/api/attendance/mark', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authSession.access_token}`,
        },
        body: JSON.stringify({
          session_id: session.session_id,
          people_id: personId,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(
          data.error || 'Could not mark attendance.'
        );
      }

      // Optimistic UI update after successful database write.
      setMarkedIds(prev => {
        const next = new Set(prev);
        next.add(personId);
        return next;
      });
    } catch (err) {
      console.error('[ATTENDANCE] Mark error:', err);
      setError(err.message || 'Could not mark attendance.');
    } finally {
      setMarking(null);
    }
  };

  const filteredPeople = people.filter(person => {
    const name = `${person.first_name || ''} ${person.last_name || ''}`.toLowerCase();
    const phone = (person.phone || '').toLowerCase();
    const query = search.toLowerCase().trim();

    return !query || name.includes(query) || phone.includes(query);
  });

  const markedCount = markedIds.size;

  if (loading) {
    return (
      <ModalShell onClose={onClose}>
        <div style={{ padding: 28 }}>
          <div className="attendance-loading">
            <div className="loading-line" />
            <div className="loading-line short" />
            <div className="loading-line" />
            <div className="loading-line" />
          </div>
        </div>

        <style jsx>{`
          .attendance-loading {
            display: flex;
            flex-direction: column;
            gap: 12px;
          }

          .loading-line {
            height: 62px;
            border-radius: 18px;
            background: rgba(255,255,255,.06);
            animation: pulse 1.6s ease-in-out infinite;
          }

          .loading-line.short {
            width: 60%;
          }

          @keyframes pulse {
            0%,100% { opacity: .45; }
            50% { opacity: 1; }
          }
        `}</style>
      </ModalShell>
    );
  }

  return (
    <ModalShell onClose={onClose}>
      <div className="attendance-modal">
        <div className="attendance-top">
          <div>
            <div className="eyebrow">Attendance</div>
            <h2>{session?.name || 'Attendance'}</h2>
            <p>
              Tap a person when you see them.
            </p>
          </div>

          <button
            onClick={onClose}
            className="close-button"
            aria-label="Close attendance"
          >
            ×
          </button>
        </div>

        {error && (
          <div className="error-box">
            {error}
            <button onClick={loadAttendance}>Try again</button>
          </div>
        )}

        <div className="attendance-summary">
          <div>
            <strong>{markedCount}</strong>
            <span>present</span>
          </div>

          <div>
            <strong>{people.length}</strong>
            <span>people</span>
          </div>
        </div>

        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search people..."
          className="search-input"
        />

        {creating && (
          <div className="creating">
            Preparing today's attendance...
          </div>
        )}

        <div className="people-list">
          {filteredPeople.length === 0 ? (
            <div className="empty-state">
              {people.length === 0
                ? 'No people have been added yet.'
                : 'No person matches your search.'}
            </div>
          ) : (
            filteredPeople.map(person => {
              const present = markedIds.has(person.id);
              const isMarking = marking === person.id;

              return (
                <div
                  key={person.id}
                  className={`person-row ${present ? 'present' : ''}`}
                >
                  <div className="person-details">
                    <div className="person-name">
                      {person.first_name} {person.last_name || ''}
                    </div>

                    <div className="person-meta">
                      {person.phone || person.type || 'Person'}
                    </div>
                  </div>

                  <button
                    onClick={() => !present && markAttendance(person.id)}
                    disabled={present || marking !== null}
                    className={`mark-button ${present ? 'done' : ''}`}
                  >
                    {isMarking
                      ? 'Saving...'
                      : present
                      ? 'Present ✓'
                      : 'Mark Present'}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      <style jsx>{`
        .attendance-modal {
          padding: 26px;
          max-height: 88vh;
          overflow-y: auto;
        }

        .attendance-top {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          align-items: flex-start;
          margin-bottom: 20px;
        }

        .eyebrow {
          font-size: 12px;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: rgba(255,255,255,.38);
          margin-bottom: 6px;
        }

        h2 {
          margin: 0;
          color: #f5f5f5;
          font-size: 28px;
          font-weight: 600;
        }

        .attendance-top p {
          margin: 7px 0 0;
          color: rgba(255,255,255,.5);
          font-size: 15px;
        }

        .close-button {
          width: 38px;
          height: 38px;
          border: 0;
          border-radius: 50%;
          background: rgba(255,255,255,.07);
          color: #fff;
          font-size: 28px;
          line-height: 1;
          cursor: pointer;
        }

        .attendance-summary {
          display: flex;
          gap: 10px;
          margin-bottom: 16px;
        }

        .attendance-summary > div {
          flex: 1;
          padding: 14px 16px;
          border-radius: 18px;
          background: rgba(255,255,255,.045);
          border: 1px solid rgba(255,255,255,.07);
        }

        .attendance-summary strong {
          display: block;
          font-size: 25px;
          color: #f5f5f5;
        }

        .attendance-summary span {
          font-size: 12px;
          color: rgba(255,255,255,.4);
        }

        .search-input {
          width: 100%;
          box-sizing: border-box;
          padding: 14px 16px;
          margin-bottom: 14px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,.1);
          background: rgba(255,255,255,.055);
          color: #fff;
          outline: none;
          font-size: 15px;
        }

        .search-input::placeholder {
          color: rgba(255,255,255,.35);
        }

        .people-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .person-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 14px;
          border-radius: 18px;
          background: rgba(255,255,255,.045);
          border: 1px solid rgba(255,255,255,.07);
        }

        .person-row.present {
          background: rgba(76,175,80,.1);
          border-color: rgba(76,175,80,.3);
        }

        .person-details {
          min-width: 0;
        }

        .person-name {
          color: #f3f3f3;
          font-weight: 500;
          word-break: break-word;
        }

        .person-meta {
          color: rgba(255,255,255,.35);
          font-size: 12px;
          margin-top: 4px;
        }

        .mark-button {
          flex-shrink: 0;
          border: 0;
          border-radius: 999px;
          padding: 9px 13px;
          background: rgba(255,255,255,.08);
          color: #f5f5f5;
          cursor: pointer;
          font-weight: 500;
        }

        .mark-button.done {
          background: rgba(76,175,80,.18);
          color: #8ee09a;
          cursor: default;
        }

        .mark-button:disabled:not(.done) {
          opacity: .6;
          cursor: wait;
        }

        .error-box {
          padding: 12px 14px;
          border-radius: 14px;
          background: rgba(239,68,68,.1);
          border: 1px solid rgba(239,68,68,.3);
          color: #ff8f8f;
          margin-bottom: 14px;
        }

        .error-box button {
          display: block;
          margin-top: 8px;
          border: 0;
          background: transparent;
          color: #fff;
          text-decoration: underline;
          cursor: pointer;
        }

        .creating,
        .empty-state {
          text-align: center;
          padding: 30px 15px;
          color: rgba(255,255,255,.4);
        }

        @media (max-width: 520px) {
          .attendance-modal {
            padding: 20px;
          }

          .person-row {
            align-items: flex-start;
          }

          .mark-button {
            padding: 8px 10px;
            font-size: 12px;
          }
        }
      `}</style>
    </ModalShell>
  );
}

function ModalShell({ children, onClose }) {
  return (
    <div
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,.72)',
        backdropFilter: 'blur(14px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        className="fiducia-card"
        style={{
          width: '100%',
          maxWidth: 620,
          maxHeight: '92vh',
          overflow: 'hidden',
          borderRadius: 28,
        }}
      >
        {children}
      </div>
    </div>
  );
      }
