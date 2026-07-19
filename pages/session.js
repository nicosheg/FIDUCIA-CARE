import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';

const CHURCH_ID = 'demo-church';

export default function SessionPage() {
  const router = useRouter();
  const [sessionName, setSessionName] = useState('Sunday Service');
  const [sections, setSections] = useState(['All']);
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
    <Layout>
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '20px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>Create Attendance Session</h1>

        <div style={{ backdropFilter: 'blur(10px)', background: 'rgba(255,255,255,0.7)', borderRadius: 16, padding: 20, marginTop: 20, boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}>
          <label style={{ fontWeight: 600 }}>Session Name</label>
          <input value={sessionName} onChange={e => setSessionName(e.target.value)} style={{ width: '100%', padding: '10px 12px', margin: '8px 0', borderRadius: 8, border: '1px solid #ddd', background: 'rgba(255,255,255,0.9)' }} />

          <label style={{ fontWeight: 600, marginTop: 15, display: 'block' }}>Sections</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 0' }}>
            {sections.map(s => <span key={s} style={{ background: '#e0e7ff', padding: '4px 12px', borderRadius: 12, fontSize: 14 }}>{s}</span>)}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={newSection} onChange={e => setNewSection(e.target.value)} placeholder="Add section" style={{ flex: 1, padding: '8px', borderRadius: 8, border: '1px solid #ddd', background: 'rgba(255,255,255,0.9)' }} />
            <button onClick={addSection} style={{ background: '#4F46E5', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>Add</button>
          </div>
        </div>

        <div style={{ backdropFilter: 'blur(10px)', background: 'rgba(255,255,255,0.7)', borderRadius: 16, padding: 20, marginTop: 20, boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}>
          <h2 style={{ marginBottom: 15 }}>Message Templates</h2>
          {Object.entries(templates).map(([cat, body]) => (
            <div key={cat} style={{ marginBottom: 15, background: 'rgba(255,255,255,0.5)', borderRadius: 10, padding: 12 }}>
              <strong>{cat.replace(/_/g, ' ')}</strong>
              {editCategory === cat ? (
                <div>
                  <textarea value={editBody} onChange={e => setEditBody(e.target.value)} rows={4} style={{ width: '100%', marginTop: 8, borderRadius: 6, border: '1px solid #ccc', padding: 8 }} />
                  <button onClick={() => saveTemplate(cat)} style={{ background: '#4F46E5', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', marginRight: 6, cursor: 'pointer' }}>Save</button>
                  <button onClick={() => setEditCategory(null)} style={{ background: '#ccc', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer' }}>Cancel</button>
                </div>
              ) : (
                <div>
                  <p style={{ whiteSpace: 'pre-wrap', margin: '8px 0' }}>{body}</p>
                  <button onClick={() => { setEditCategory(cat); setEditBody(body); }} style={{ background: '#4F46E5', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>Edit</button>
                </div>
              )}
            </div>
          ))}
        </div>

        <button onClick={startSession} style={{ marginTop: 25, width: '100%', padding: '14px', background: 'linear-gradient(135deg, #4F46E5, #7C3AED)', color: '#fff', border: 'none', borderRadius: 14, fontSize: 18, fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 12px rgba(79,70,229,0.3)' }}>
          Start Session →
        </button>
      </div>
    </Layout>
  );
        }
