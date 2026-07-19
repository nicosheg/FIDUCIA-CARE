import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

const CHURCH_ID = 'demo-church';

export default function SessionPage() {
  const router = useRouter();
  const [sessionName, setSessionName] = useState('Sunday Service');
  const [sections, setSections] = useState(['Main Hall', 'Youth', 'Children', 'Choir']);
  const [newSection, setNewSection] = useState('');
  const [templates, setTemplates] = useState({});
  const [editCategory, setEditCategory] = useState(null);
  const [editBody, setEditBody] = useState('');

  useEffect(() => {
    fetch(`/api/templates?church_id=${CHURCH_ID}`)
      .then(r => r.json())
      .then(data => { if (data && typeof data === 'object') setTemplates(data); });
  }, []);

  const addSection = () => {
    if (newSection.trim() && !sections.includes(newSection.trim())) {
      setSections([...sections, newSection.trim()]);
      setNewSection('');
    }
  };

  const startSession = async () => {
    const res = await fetch('/api/session/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: sessionName, sections, church_id: CHURCH_ID }),
    });
    const data = await res.json();
    if (data.id) {
      router.push(`/section?sessionId=${data.id}&section=${encodeURIComponent(sections[0])}`);
    } else {
      alert('Error creating session');
    }
  };

  const saveTemplate = async (category) => {
    await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ church_id: CHURCH_ID, category, body: editBody }),
    });
    setTemplates({ ...templates, [category]: editBody });
    setEditCategory(null);
  };

  return (
    <div style={{ padding: 20, maxWidth: 650, margin: '0 auto' }}>
      <h1>Create Attendance Session</h1>

      <div style={{ marginBottom: 20 }}>
        <label>Session Name</label>
        <input value={sessionName} onChange={e => setSessionName(e.target.value)} style={inputStyle} />
      </div>

      <div style={{ marginBottom: 20 }}>
        <label>Sections (Usher Assignments)</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 0' }}>
          {sections.map(s => (<span key={s} style={tagStyle}>{s}</span>))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={newSection} onChange={e => setNewSection(e.target.value)} placeholder="New section" style={inputStyle} />
          <button onClick={addSection} style={smallBtn}>Add</button>
        </div>
      </div>

      <h2>WhatsApp Message Templates</h2>
      <p style={{ fontSize: 14, color: '#555' }}>Ushers can personalize these messages before sending.</p>

      {Object.entries(templates).map(([category, body]) => (
        <div key={category} style={{ marginBottom: 15, border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
          <strong>{category.replace(/_/g, ' ')}</strong>
          {editCategory === category ? (
            <div>
              <textarea value={editBody} onChange={e => setEditBody(e.target.value)} rows={4} style={{ width: '100%', marginTop: 8 }} />
              <button onClick={() => saveTemplate(category)} style={smallBtn}>Save</button>
              <button onClick={() => setEditCategory(null)} style={{ ...smallBtn, background: '#ccc' }}>Cancel</button>
            </div>
          ) : (
            <div>
              <p style={{ whiteSpace: 'pre-wrap', margin: '8px 0' }}>{body}</p>
              <button onClick={() => { setEditCategory(category); setEditBody(body); }} style={smallBtn}>Edit</button>
            </div>
          )}
        </div>
      ))}

      <button onClick={startSession} style={bigBtn}>Start Session →</button>
    </div>
  );
}

const inputStyle = { width: '100%', padding: 8, margin: '4px 0', borderRadius: 4, border: '1px solid #ccc' };
const tagStyle = { background: '#e0e7ff', padding: '4px 10px', borderRadius: 12, fontSize: 14 };
const smallBtn = { padding: '6px 12px', marginLeft: 8, background: '#4F46E5', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' };
const bigBtn = { padding: '14px 28px', background: '#4F46E5', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 16, marginTop: 20 };
