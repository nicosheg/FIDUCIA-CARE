// components/AttendanceModal.js
// Attendance modal — Home quick action.
// Users only mark people they actually see.
// IMPORTANT: No "Absent" action. Unmarked people remain unobserved.
// People are loaded from the authenticated organization via /api/people.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function AttendanceModal({ isOpen, onClose }) {
  const [people, setPeople] = useState([]);
  const [markedIds, setMarkedIds] = useState(() => new Set());
  const [search, setSearch] = useState('');
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // Load the current active session and organization-scoped people.
  const loadAttendance = useCallback(async () => {
    if (!isOpen) return;

    setLoading(true);
    setError('');
    setSubmitted(false);

    try {
      const { data: { session: authSession } } =
        await supabase.auth.getSession();

      if (!authSession) {
        setError('Your session has expired. Please log in again.');
        return;
      }

      const headers = {
        Authorization: `Bearer ${authSession.access_token}`,
      };

      // Active session comes from the authenticated organization.
      const sessionRes = await fetch('/api/attendance/active-session', {
        headers,
      });

      const sessionData = await sessionRes.json();

      if (!sessionRes.ok || !sessionData.active) {
        setSession(null);
        setError(
          sessionData.error ||
          'No active attendance session. Start one before marking attendance.'
        );
        return;
      }

      setSession(sessionData);

      // IMPORTANT: /api/people derives organization from auth.
      // Do not send organization_id from the browser.
      const peopleRes = await fetch('/api/people', { headers });
      const peopleData = await peopleRes.json();

      if (!peopleRes.ok || !Array.isArray(peopleData)) {
        throw new Error(
          peopleData.error || 'Could not load people.'
        );
      }

      setPeople(
        peopleData.filter(p => p.status === undefined || p.status === 'active')
      );
    } catch (err) {
      console.error('[AttendanceModal] Load error:', err);
      setError(err.message || 'Could not load attendance.');
    } finally {
      setLoading(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      loadAttendance();
    } else {
      document.body.style.overflow = '';
      setSearch('');
      setError('');
      setSubmitted(false);
      setMarkedIds(new Set());
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, loadAttendance]);

  // Search by full name or phone without changing the stored people list.
  const filteredPeople = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return people;

    return people.filter(person => {
      const name =
        `${person.first_name || ''} ${person.last_name || ''}`.toLowerCase();
      const phone = (person.phone || '').toLowerCase();
      return name.includes(q) || phone.includes(q);
    });
  }, [people, search]);

  const togglePerson = async person => {
    if (!session || savingId) return;

    const wasMarked = markedIds.has(person.id);
    const next = new Set(markedIds);

    if (wasMarked) {
      // The canonical attendance endpoint currently records presence.
      // We therefore remove the local selection only until the next
      // server refresh rather than inventing an "absent" state.
      next.delete(person.id);
      setMarkedIds(next);
      return;
    }

    setSavingId(person.id);
    setError('');

    try {
      const { data: { session: authSession } } =
        await supabase.auth.getSession();

      if (!authSession) {
        throw new Error('Your session has expired. Please log in again.');
      }

      const res = await fetch('/api/attendance/mark', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authSession.access_token}`,
        },
        body: JSON.stringify({
          session_id: session.session_id,
          people_id: person.id,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(
          data.error || 'Could not mark attendance.'
        );
      }

      setMarkedIds(prev => {
        const nextSet = new Set(prev);
        nextSet.add(person.id);
        return nextSet;
      });
    } catch (err) {
      console.error('[AttendanceModal] Mark error:', err);
      setError(err.message || 'Could not mark attendance.');
    } finally {
      setSavingId(null);
    }
  };

  const closeAfterAttendance = () => {
    onClose?.();
  };

  if (!isOpen) return null;

  const markedCount = markedIds.size;

  return (
    <div className="attendance-overlay">
      <div className="attendance-modal">
        {/* Header */}
        <header className="attendance-header">
          <div>
            <div className="eyebrow">Attendance</div>
            <h1>{session?.name || 'Record attendance'}</h1>
            <p>Tap the people you see.</p>
          </div>

          <button
            type="button"
            className="close-button"
            onClick={closeAfterAttendance}
            aria-label="Close attendance"
          >
            ×
          </button>
        </header>

        {/* Session status */}
        {session && (
          <div className="session-bar">
            <div>
              <strong>{session.name}</strong>
              <span>Active session</span>
            </div>
            <div className="count">
              <strong>{markedCount}</strong>
              <span>present</span>
            </div>
          </div>
        )}

        {/* Error / empty state */}
        {error && (
          <div className="attendance-error">
            <div>{error}</div>
            {!session && (
              <button type="button" onClick={loadAttendance}>
                Try again
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div className="loading-state">
            <div className="loading-line" />
            <div className="loading-line short" />
            <div className="loading-grid">
              {Array.from({ length: 12 }).map((_, i) => (
                <div className="loading-person" key={i} />
              ))}
            </div>
          </div>
        ) : session ? (
          <>
            {/* Search */}
            <div className="search-wrap">
              <span className="search-icon">⌕</span>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search people..."
                aria-label="Search people"
              />
              {search && (
                <button
                  type="button"
                  className="clear-search"
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>

            {/* People */}
            {people.length === 0 ? (
              <div className="empty-state">
                <div className="empty-title">No people have been added yet.</div>
                <div className="empty-text">
                  Add people first, then they will appear here for attendance.
                </div>
              </div>
            ) : filteredPeople.length === 0 ? (
              <div className="empty-state">
                <div className="empty-title">No match found.</div>
                <div className="empty-text">
                  Try another name or phone number.
                </div>
              </div>
            ) : (
              <div className="people-grid">
                {filteredPeople.map(person => {
                  const marked = markedIds.has(person.id);
                  const saving = savingId === person.id;

                  return (
                    <button
                      key={person.id}
                      type="button"
                      className={`person-card ${marked ? 'marked' : ''}`}
                      onClick={() => togglePerson(person)}
                      disabled={savingId !== null && !saving}
                    >
                      <div className="person-main">
                        <div className="avatar">
                          {(person.first_name || '?')
                            .charAt(0)
                            .toUpperCase()}
                        </div>

                        <div className="person-details">
                          <div className="person-name">
                            {person.first_name} {person.last_name || ''}
                          </div>

                          {person.phone && (
                            <div className="person-phone">
                              {person.phone}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className={`mark-indicator ${marked ? 'active' : ''}`}>
                        {saving ? '…' : marked ? '✓' : ''}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Bottom action */}
            <div className="attendance-footer">
              <div className="footer-summary">
                <strong>{markedCount}</strong>
                <span>people marked present</span>
              </div>

              <button
                type="button"
                className="done-button"
                onClick={() => {
                  setSubmitted(true);
                  setTimeout(closeAfterAttendance, 350);
                }}
              >
                {submitted ? '✓ Saved' : 'Done'}
              </button>
            </div>
          </>
        ) : null}
      </div>

      <style jsx>{`
        .attendance-overlay {
          position: fixed;
          inset: 0;
          z-index: 2000;
          background: rgba(3, 8, 24, 0.82);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 12px;
        }

        .attendance-modal {
          width: min(1180px, 100%);
          height: min(94vh, 900px);
          background: rgba(10, 17, 40, 0.97);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 30px;
          box-shadow: 0 30px 100px rgba(0, 0, 0, 0.45);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          color: #f5f5f5;
        }

        .attendance-header {
          flex: 0 0 auto;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 20px;
          padding: 22px 26px 14px;
        }

        .eyebrow {
          color: rgba(255, 255, 255, 0.38);
          font-size: 11px;
          letter-spacing: 1.6px;
          text-transform: uppercase;
          margin-bottom: 5px;
        }

        .attendance-header h1 {
          margin: 0;
          font-size: clamp(24px, 4vw, 34px);
          line-height: 1.1;
          font-weight: 600;
          letter-spacing: -0.025em;
        }

        .attendance-header p {
          margin: 6px 0 0;
          color: rgba(255, 255, 255, 0.48);
          font-size: 14px;
        }

        .close-button {
          width: 38px;
          height: 38px;
          flex: 0 0 38px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.05);
          color: rgba(255, 255, 255, 0.72);
          font-size: 25px;
          line-height: 1;
          cursor: pointer;
        }

        .session-bar {
          flex: 0 0 auto;
          margin: 0 26px 12px;
          padding: 10px 14px;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.045);
          border: 1px solid rgba(255, 255, 255, 0.06);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
        }

        .session-bar strong {
          display: block;
          font-size: 14px;
          font-weight: 550;
        }

        .session-bar span {
          display: block;
          color: rgba(255, 255, 255, 0.38);
          font-size: 11px;
          margin-top: 2px;
        }

        .session-bar .count {
          text-align: right;
        }

        .session-bar .count strong {
          font-size: 20px;
          color: #d4af37;
        }

        .search-wrap {
          position: relative;
          flex: 0 0 auto;
          margin: 0 26px 14px;
        }

        .search-wrap input {
          width: 100%;
          box-sizing: border-box;
          padding: 11px 42px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          outline: none;
          background: rgba(255, 255, 255, 0.055);
          color: #f5f5f5;
          font-size: 14px;
        }

        .search-wrap input::placeholder {
          color: rgba(255, 255, 255, 0.3);
        }

        .search-icon {
          position: absolute;
          left: 15px;
          top: 50%;
          transform: translateY(-52%);
          color: rgba(255, 255, 255, 0.4);
          font-size: 21px;
          pointer-events: none;
        }

        .clear-search {
          position: absolute;
          right: 9px;
          top: 50%;
          transform: translateY(-50%);
          width: 28px;
          height: 28px;
          border: 0;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.08);
          color: rgba(255, 255, 255, 0.6);
          cursor: pointer;
        }

        .people-grid {
          flex: 1 1 auto;
          min-height: 0;
          overflow-y: auto;
          padding: 0 26px 18px;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 8px;
          align-content: start;
        }

        .person-card {
          min-width: 0;
          min-height: 58px;
          padding: 9px 10px;
          border-radius: 15px;
          border: 1px solid rgba(255, 255, 255, 0.065);
          background: rgba(255, 255, 255, 0.045);
          color: #f5f5f5;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          text-align: left;
          cursor: pointer;
          transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease;
        }

        .person-card:hover {
          transform: translateY(-1px);
          background: rgba(255, 255, 255, 0.075);
        }

        .person-card.marked {
          background: rgba(212, 175, 55, 0.11);
          border-color: rgba(212, 175, 55, 0.45);
        }

        .person-main {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 9px;
        }

        .avatar {
          width: 32px;
          height: 32px;
          flex: 0 0 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          background: rgba(212, 175, 55, 0.12);
          color: #d4af37;
          font-size: 12px;
          font-weight: 650;
        }

        .person-details {
          min-width: 0;
        }

        .person-name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 13px;
          font-weight: 500;
        }

        .person-phone {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: rgba(255, 255, 255, 0.3);
          font-size: 10px;
          margin-top: 2px;
        }

        .mark-indicator {
          width: 22px;
          height: 22px;
          flex: 0 0 22px;
          border-radius: 50%;
          border: 1px solid rgba(255, 255, 255, 0.16);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #d4af37;
          font-size: 13px;
          font-weight: 700;
        }

        .mark-indicator.active {
          border-color: #d4af37;
          background: #d4af37;
          color: #0a1128;
        }

        .attendance-footer {
          flex: 0 0 auto;
          min-height: 62px;
          padding: 10px 26px;
          border-top: 1px solid rgba(255, 255, 255, 0.07);
          background: rgba(10, 17, 40, 0.98);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
        }

        .footer-summary {
          display: flex;
          align-items: baseline;
          gap: 6px;
          color: rgba(255, 255, 255, 0.38);
          font-size: 12px;
        }

        .footer-summary strong {
          color: #d4af37;
          font-size: 20px;
        }

        .done-button {
          border: 0;
          border-radius: 999px;
          padding: 10px 22px;
          background: #d4af37;
          color: #0a1128;
          font-weight: 650;
          cursor: pointer;
        }

        .attendance-error {
          flex: 0 0 auto;
          margin: 0 26px 12px;
          padding: 10px 13px;
          border-radius: 13px;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: rgba(255, 255, 255, 0.75);
          font-size: 13px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .attendance-error button {
          border: 0;
          border-radius: 999px;
          padding: 6px 11px;
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
          cursor: pointer;
        }

        .empty-state {
          flex: 1 1 auto;
          min-height: 180px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          text-align: center;
          padding: 30px;
        }

        .empty-title {
          color: rgba(255, 255, 255, 0.72);
          font-size: 15px;
        }

        .empty-text {
          margin-top: 6px;
          max-width: 420px;
          color: rgba(255, 255, 255, 0.35);
          font-size: 12px;
          line-height: 1.5;
        }

        .loading-state {
          flex: 1;
          padding: 10px 26px 20px;
          overflow: hidden;
        }

        .loading-line {
          width: 180px;
          height: 15px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.06);
          margin-bottom: 8px;
        }

        .loading-line.short {
          width: 100px;
        }

        .loading-grid {
          margin-top: 16px;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 8px;
        }

        .loading-person {
          height: 58px;
          border-radius: 15px;
          background: rgba(255, 255, 255, 0.045);
        }

        @media (max-width: 850px) {
          .attendance-modal {
            height: 96vh;
            border-radius: 24px;
          }

          .people-grid,
          .loading-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }

        @media (max-width: 600px) {
          .attendance-overlay {
            padding: 0;
            align-it
