import { useState, useEffect } from 'react';
import Layout from '../components/Layout';

export default function ChurchProfile() {
  const [services, setServices] = useState([{ day: 'Sunday', time: '09:00' }]);
  const [programs, setPrograms] = useState([{ name: '' }]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/church-profile?organization_id=demo-org')
      .then(r => r.json())
      .then(data => {
        if (data.services) setServices(data.services);
        if (data.programs) setPrograms(data.programs);
      });
  }, []);

  const saveProfile = async () => {
    await fetch('/api/church-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organization_id: 'demo-org',
        services: services.filter(s => s.day),
        programs: programs.filter(p => p.name),
      }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const addService = () => setServices([...services, { day: '', time: '' }]);
  const addProgram = () => setPrograms([...programs, { name: '' }]);

  return (
    <Layout>
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '40px 20px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, color: '#f0f0f0', marginBottom: 30 }}>Church Profile</h1>
        <div className="fiducia-card" style={{ padding: 24, marginBottom: 20 }}>
          <h3 style={{ color: '#D4AF37', marginBottom: 16 }}>Service Times</h3>
          {services.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <input placeholder="Day" value={s.day} onChange={e => { const newS = [...services]; newS[i].day = e.target.value; setServices(newS); }} style={miniInput} />
              <input placeholder="Time" value={s.time} onChange={e => { const newS = [...services]; newS[i].time = e.target.value; setServices(newS); }} style={miniInput} />
              <button onClick={() => setServices(services.filter((_, idx) => idx !== i))} style={removeBtn}>✕</button>
            </div>
          ))}
          <button onClick={addService} className="fiducia-button fiducia-button-ghost" style={{ marginTop: 8 }}>+ Add Service</button>
        </div>

        <div className="fiducia-card" style={{ padding: 24, marginBottom: 30 }}>
          <h3 style={{ color: '#D4AF37', marginBottom: 16 }}>Programs / Events</h3>
          {programs.map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <input placeholder="Program name" value={p.name} onChange={e => { const newP = [...programs]; newP[i].name = e.target.value; setPrograms(newP); }} style={miniInput} />
              <button onClick={() => setPrograms(programs.filter((_, idx) => idx !== i))} style={removeBtn}>✕</button>
            </div>
          ))}
          <button onClick={addProgram} className="fiducia-button fiducia-button-ghost" style={{ marginTop: 8 }}>+ Add Program</button>
        </div>

        <button onClick={saveProfile} className="fiducia-button fiducia-button-primary" style={{ width: '100%' }}>
          {saved ? 'Saved ✓' : 'Save Profile'}
        </button>
      </div>
    </Layout>
  );
}

const miniInput = {
  padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.03)', color: '#fff', outline: 'none', flex: 1,
};
const removeBtn = {
  background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 16,
};
