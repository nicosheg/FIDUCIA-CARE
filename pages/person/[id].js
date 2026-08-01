import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';

export default function PersonStory() {
  const router = useRouter();
  const { id } = router.query;
  const [timeline, setTimeline] = useState([]);
  const [person, setPerson] = useState(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/people?organization_id=demo-org`)
      .then(r => r.json())
      .then(people => setPerson(people.find(p => p.id === id) || null));

    fetch(`/api/timeline?person_id=${id}&organization_id=demo-org`)
      .then(r => r.json())
      .then(data => setTimeline(data));
  }, [id]);

  if (!person) return <Layout><p>…</p></Layout>;

  return (
    <Layout>
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '30px 20px' }}>
        <div style={profileHeader}>
          <div style={avatar}>
            {person.first_name[0]}{person.last_name?.[0] || ''}
          </div>
          <div>
            <h1 style={name}>{person.first_name} {person.last_name}</h1>
            <p style={phone}>{person.phone || 'No phone'}</p>
          </div>
        </div>

        <h2 style={sectionTitle}>Journey</h2>
        <div style={timelineContainer}>
          {timeline.map((event, i) => (
            <div key={event.id} style={eventDot}>
              <div style={dot} />
              <div style={eventContent}>
                <div style={eventType}>{event.event_type}</div>
                <div style={eventDesc}>{event.description}</div>
                <div style={eventTime}>{new Date(event.created_at).toLocaleDateString()}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Ambient AI insight */}
        {timeline.length > 0 && (
          <div style={ambientInsight}>
            AI has noticed this person responds better to evening messages.
          </div>
        )}
      </div>
    </Layout>
  );
}

// Styles
const profileHeader = { display: 'flex', gap: 16, alignItems: 'center', marginBottom: 30 };
const avatar = {
  width: 56, height: 56, borderRadius: '50%', background: 'rgba(212,175,55,0.2)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: '#D4AF37', fontWeight: 600, fontSize: 22,
};
const name = { fontSize: 24, fontWeight: 600, color: '#f0f0f0', margin: 0 };
const phone = { color: 'rgba(255,255,255,0.5)', fontSize: 14, margin: '4px 0 0' };
const sectionTitle = { fontSize: 18, fontWeight: 600, color: '#D4AF37', marginBottom: 20 };
const timelineContainer = { display: 'flex', flexDirection: 'column', gap: 0, position: 'relative' };
const dot = {
  width: 10, height: 10, borderRadius: '50%', background: '#D4AF37',
  marginRight: 16, flexShrink: 0, marginTop: 6,
};
const eventDot = { display: 'flex', alignItems: 'flex-start', marginBottom: 16 };
const eventContent = { flex: 1 };
const eventType = { fontSize: 13, color: '#D4AF37', fontWeight: 600, marginBottom: 4 };
const eventDesc = { fontSize: 14, color: '#f0f0f0' };
const eventTime = { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 };
const ambientInsight = {
  marginTop: 30, padding: '14px 20px', borderRadius: 16,
  background: 'rgba(212,175,55,0.05)', border: '1px solid rgba(212,175,55,0.1)',
  color: '#D4AF37', fontSize: 14,
};
