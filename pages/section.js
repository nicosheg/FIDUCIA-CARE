import { useState, useEffect } from 'react';
import Link from 'next/link';

const SECTIONS = ['Section A', 'Section B', 'Section C', 'All'];
const CHURCH_ID = 'demo-church';

export default function SectionAttendance() {
  const [selectedSection, setSelectedSection] = useState('Section A');
  const [members, setMembers] = useState([]);
  const [search, setSearch] = useState('');
  const [presentIds, setPresentIds] = useState(new Set());
  const [offlineQueue, setOfflineQueue] = useState([]);
  const [synced, setSynced] = useState(false);

  // Load members for the selected section (or all)
  useEffect(() => {
    fetch(`/api/members?church_id=${CHURCH_ID}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setMembers(data.filter(m => selectedSection === 'All' || m.section === selectedSection));
        }
      });
  }, [selectedSection]);

  // Toggle present status (offline-capable)
  const togglePresent = (memberId) => {
    const newSet = new Set(presentIds);
    if (newSet.has(memberId)) {
      newSet.delete(memberId);
    } else {
      newSet.add(memberId);
    }
    setPresentIds(newSet);

    // Save to offline queue
    const queue = JSON.parse(localStorage.getItem('offlineCheckins') || '[]');
    queue.push({ member_id: memberId, present: newSet.has(memberId), timestamp: Date.now() });
    localStorage.setItem('offlineCheckins', JSON.stringify(queue));
  };

  // Filter members by search
  const filtered = members.filter(m =>
    `${m.first_name} ${m.last_name}`.toLowerCase().includes(search.toLowerCase())
  );

  // Sync offline check-ins when online
  const syncOffline = async () => {
    const queue = JSON.parse(localStorage.getItem('offlineCheckins') || '[]');
    if (queue.length === 0) return;
    try {
      await fetch('/api/attendance/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ church_id: CHURCH_ID, checkins: queue }),
      });
      localStorage.removeItem('offlineCheckins');
      setSynced(true);
    } catch (e) {
      console.log('Sync later');
    }
  };

  useEffect(() => {
    window.addEventListener('online', syncOffline);
    return () => window.removeEventListener('online', syncOffline);
  }, []);

  return (
    <div style={{ padding: 20, maxWidth: 600, margin: '0 auto' }}>
      <nav style={navStyle}>
        <Link href="/">📊 Dashboard</Link>
        <Link href="/scan">📷 Scan</Link>
        <Link href="/section" style={{ fontWeight: 'bold' }}>✅ Section Attendance</Link>
        <Link href="/members">👥 Members</Link>
      </nav>

      <h1>Section Check-in</h1>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        {SECTIONS.map(sec => (
          <button
            key={sec}
            onClick={() => setSelectedSection(sec)}
            style={{
              padding: '12px 18px',
              background: selectedSection === sec ? '#4F46E5' : '#eee',
              color: selectedSection === sec ? '#fff' : '#333',
              border: 'none',
              borderRadius: 8,
              fontSize: 16,
              cursor: 'pointer',
            }}
          >
            {sec}
          </button>
        ))}
      </div>

      <input
        type="text"
        placeholder="🔍 Search member..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ width: '100%', padding: 12, borderRadius: 8, border: '1px solid #ccc', marginBottom: 15 }}
      />

      <button onClick={syncOffline} style={{ ...buttonStyle, background: synced ? '#aaa' : '#ff9800' }}>
        {synced ? '✅ Synced' : '📤 Sync now'}
      </button>

      <div style={{ marginTop: 20 }}>
        {filtered.map(m => (
          <div
            key={m.id}
            onClick={() => togglePresent(m.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '15px',
              marginBottom: 8,
              borderRadius: 10,
              background: presentIds.has(m.id) ? '#e8f5e9' : '#fff',
              border: presentIds.has(m.id) ? '2px solid #4CAF50' : '1px solid #ddd',
              fontSize: 18,
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <span>{m.first_name} {m.last_name}</span>
            <span style={{ fontSize: 24 }}>
              {presentIds.has(m.id) ? '✅' : '⬜'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const navStyle = {
  display: 'flex', gap: 20, marginBottom: 30,
  borderBottom: '1px solid #eee', paddingBottom: 15,
};

const buttonStyle = {
  padding: '10px 20px',
  border: 'none',
  borderRadius: 8,
  color: 'white',
  cursor: 'pointer',
};
