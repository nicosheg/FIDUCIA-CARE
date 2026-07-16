import { useState, useEffect } from 'react';
import api from '../lib/api';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const churchId = 'demo-church'; // replace with real auth

  useEffect(() => {
    api.get(`/api/dashboard/${churchId}`).then(res => setStats(res.data));
  }, []);

  if (!stats) return <div>Loading...</div>;

  return (
    <div style={{ padding: 20 }}>
      <h1>Secretary Dashboard</h1>
      <p>Date: {stats.attendance_date}</p>
      <div style={{ display: 'flex', gap: 20 }}>
        <StatCard label="Present" value={stats.present_count} />
        <StatCard label="Absent" value={stats.absent_count} />
        <StatCard label="Calls Completed" value={stats.calls_completed} />
        <StatCard label="Prayer Requests" value={stats.prayer_requests} />
        <StatCard label="Needs Pastor" value={stats.needs_pastor} />
        <StatCard label="Wrong Numbers" value={stats.wrong_numbers} />
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div style={{ border: '1px solid #ccc', padding: 15, borderRadius: 8 }}>
      <h3>{label}</h3>
      <p style={{ fontSize: 24 }}>{value}</p>
    </div>
  );
    }
