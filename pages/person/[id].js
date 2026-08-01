import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';

export default function PersonTimeline() {
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
      .then(setTimeline);
  }, [id]);

  if (!person) return <Layout><p style={{ color: '#fff' }}>Loading...</p></Layout>;

  return (
    <Layout>
      <div style={{ maxWidth: 600, margin: '0 auto', padding: 20, color: '#f0f0f0' }}>
        <h1>{person.first_name} {person.last_name}</h1>
        <p>{person.phone}</p>

        <h2 style={{ marginTop: 30 }}>Timeline</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 15 }}>
          {timeline.map(event => (
            <div key={event.id} style={{ background: 'rgba(255,255,255,0.05)', padding: 12, borderRadius: 8 }}>
              <div style={{ fontWeight: 600 }}>{event.event_type}</div>
              <div style={{ fontSize: 13, opacity: 0.7 }}>{new Date(event.created_at).toLocaleString()}</div>
              <div>{event.description}</div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
        }
