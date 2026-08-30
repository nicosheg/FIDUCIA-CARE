// pages/section.js
// Organization-scoped section attendance.
// Uses the authenticated Supabase session for attendance requests.

import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabaseClient';

export default function SectionCheckin() {
  const router = useRouter();
  const { sessionId, section } = router.query;

  const [members, setMembers] = useState([]);
  const [search, setSearch] = useState('');
  const [presentIds, setPresentIds] = useState(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!sessionId || !section) return;

    // People-loading endpoint must use the current organization-scoped API.
    // Do not use the legacy /api/members?church_id=demo-church flow.
    async function loadPeople() {
      setLoading(true);
      setError('');

      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          router.replace('/login');
          return;
        }

        /*
         * TODO:
         * Replace this endpoint with the existing canonical people endpoint
         * after we verify its exact route/response shape.
         */
        const res = await fetch('/api/people', {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Could not load people.');
        }

        if (Array.isArray(data)) {
          setMembers(data);
        } else if (Array.isArray(data.people)) {
          setMembers(data.people);
        } else {
          setMembers([]);
        }
      } catch (err) {
        console.error('Load people error:', err);
        setError(err.message || 'Could not load people.');
      } finally {
        setLoading(false);
      }
    }

    loadPeople();
  }, [sessionId, section, router]);

  const togglePresent = (id) => {
    setPresentIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const submitSection = async () => {
    if (submitted) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        router.replace('/login');
        return;
      }

      const res = await fetch('/api/attendance/section-checkin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          session_id: sessionId,
          section_name: section,
          present_ids: [...presentIds],
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Could not submit attendance.');
      }

      setSubmitted(true);
    } catch (err) {
      console.error('Submit attendance error:', err);
      alert(err.message || 'Could not submit attendance.');
    }
  };

  const filtered = members.filter(m =>
    `${m.first_name || ''} ${m.last_name || ''}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  return (
    <Layout>
      <div style={{ maxWidth: 600, margin: '0 auto', padding: 20 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700 }}>
          Section: {section}
        </h2>

        <p style={{ color: '#666' }}>
          Tap a name to mark present
        </p>

        <input
          type="text"
          placeholder="🔍 Search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%',
            padding: 12,
            marginBottom: 15,
            borderRadius: 12,
            border: '1px solid #ddd',
            background: 'rgba(255,255,255,0.8)',
            backdropFilter: 'blur(5px)'
          }}
        />

        {loading && (
          <p style={{ color: '#666', textAlign: 'center' }}>
            Loading people...
          </p>
        )}

        {error && (
          <div style={{
            padding: 12,
            marginBottom: 15,
            borderRadius: 10,
            background: '#ffebee',
            color: '#c62828'
          }}>
            {error}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div style={{
            padding: 20,
            textAlign: 'center',
            color: '#666',
            background: 'rgba(255,255,255,0.7)',
            borderRadius: 12
          }}>
            No people found.
          </div>
        )}

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10
        }}>
          {filtered.map(m => (
            <div
              key={m.id}
              onClick={() => togglePresent(m.id)}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: 14,
                borderRadius: 12,
                background: presentIds.has(m.id)
                  ? '#e8f5e9'
                  : 'rgba(255,255,255,0.8)',
                border: presentIds.has(m.id)
                  ? '2px solid #4CAF50'
                  : '1px solid rgba(255,255,255,0.3)',
                backdropFilter: 'blur(5px)',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <span>
                {m.first_name} {m.last_name}
                {m.type && m.type !== 'member' ? ` (${m.type})` : ''}
              </span>

              <span style={{ fontSize: 24 }}>
                {presentIds.has(m.id) ? '✅' : '⬜'}
              </span>
            </div>
          ))}
        </div>

        <button
          onClick={submitSection}
          disabled={submitted || loading}
          style={{
            width: '100%',
            marginTop: 25,
            padding: 14,
            background: submitted
              ? '#aaa'
              : 'linear-gradient(135deg, #4CAF50, #2E7D32)',
            color: '#fff',
            border: 'none',
            borderRadius: 14,
            fontSize: 18,
            fontWeight: 600,
            cursor: submitted || loading ? 'default' : 'pointer',
            boxShadow: submitted
              ? 'none'
              : '0 4px 12px rgba(76,175,80,0.3)'
          }}
        >
          {submitted ? '✅ Submitted' : 'Submit Section Attendance'}
        </button>
      </div>
    </Layout>
  );
    }
