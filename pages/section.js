import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';

export default function SectionCheckin() {
  const router = useRouter();
  const { sessionId, section } = router.query;
  const [members, setMembers] = useState([]);
  const [search, setSearch] = useState('');
  const [presentIds, setPresentIds] = useState(new Set());
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!sessionId || !section) return;
    fetch(`/api/members?church_id=demo-church`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setMembers(data); });
  }, [sessionId, section]);

  const togglePresent = (memberId) => {
    const newSet = new Set(presentIds);
    newSet.has(memberId) ? newSet.delete(memberId) : newSet.add(memberId);
    setPresentIds(newSet);
  };

  const submitSection = async () => {
    const res = await fetch('/api/attendance/section-checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        section_name: section,
        present_ids: [...presentIds],
      }),
    });
    const data = await res.json();
    if (data.success) setSubmitted(true);
  };

  const filtered = members.filter(m =>
    `${m.first_name} ${m.last_name}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ padding: 20, maxWidth: 600, margin: '0 auto' }}>
      <h2>Section: {section}</h2>
      <input
        type="text"
        placeholder="Search members..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ width: '100%', padding: 12, marginBottom: 16, borderRadius: 8, border: '1px solid #ccc' }}
      />

      {filtered.map(m => (
        <div
          key={m.id}
          onClick={() => togglePresent(m.id)}
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: 14, marginBottom: 8, borderRadius: 8,
            background: presentIds.has(m.id) ? '#e8f5e9' : '#fff',
            border: presentIds.has(m.id) ? '2px solid #4CAF50' : '1px solid #ddd',
            cursor: 'pointer', userSelect: 'none',
          }}
        >
          <span>{m.first_name} {m.last_name}</span>
          <span style={{ fontSize: 20 }}>{presentIds.has(m.id) ? '✅' : '⬜'}</span>
        </div>
      ))}

      <button
        onClick={submitSection}
        disabled={submitted}
        style={{
          padding: '14px 24px', background: submitted ? '#aaa' : '#4CAF50',
          color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer',
          marginTop: 20, fontSize: 16,
        }}
      >
        {submitted ? '✅ Submitted' : 'Submit Attendance'}
      </button>
    </div>
  );
            }
