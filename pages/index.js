import { useEffect, useState } from 'react';
import Layout from '../components/Layout';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const churchId = 'demo-org';

  useEffect(() => {
    fetch(`/api/dashboard?church_id=${churchId}`)
      .then(r => r.json())
      .then(setStats);
  }, []);

  const sendBulkWhatsApp = async (sessionName, messageTemplate) => {
    const res = await fetch('/api/send-whatsapp-bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ church_id: churchId, session_name: sessionName, message_template: messageTemplate }),
    });
    const data = await res.json();
    alert(`Sent: ${data.sent || 0}, Failed: ${data.failed || 0}`);
  };

  if (!stats) {
    return (
      <Layout>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px' }}>
          <p style={{ color: 'rgba(255,255,255,0.6)' }}>Loading insights…</p>
        </div>
      </Layout>
    );
  }

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // Build ARIA insight message dynamically
  const insightParts = [];
  if (stats.present_count > 0) {
    insightParts.push(`${stats.present_count} people attended today.`);
  }
  if (stats.new_members && stats.new_members > 0) {
    insightParts.push(`${stats.new_members} are first‑time visitors.`);
  }
  if (stats.absent_count > 0) {
    insightParts.push(`${stats.absent_count} were absent.`);
  }
  if (stats.prayer_requests > 0) {
    insightParts.push(`${stats.prayer_requests} requested prayer.`);
  }
  if (stats.needs_pastor > 0) {
    insightParts.push(`${stats.needs_pastor} require pastoral attention.`);
  }
  if (stats.wrong_numbers > 0) {
    insightParts.push(`${stats.wrong_numbers} have invalid phone numbers.`);
  }
  const ariaInsight = insightParts.length > 0
    ? insightParts.join(' ')
    : 'No attendance data yet. Scan or check back later.';

  return (
    <Layout>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '20px' }}>
        {/* Header */}
        <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 5, color: '#f0f0f0' }}>
          Good morning, Pastor.
        </h1>
        <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.6)', marginBottom: 30 }}>
          {today}
        </p>

        {/* ARIA Insights Panel */}
        <div
          style={{
            background: 'rgba(79,70,229,0.12)',
            backdropFilter: 'blur(12px)',
            borderRadius: 20,
            padding: 20,
            marginBottom: 30,
            border: '1px solid rgba(79,70,229,0.3)',
            display: 'flex',
            gap: 16,
            alignItems: 'flex-start',
          }}
        >
          <div style={{ fontSize: 28 }}>🤖</div>
          <div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 600,
                marginBottom: 8,
                color: '#a5b4fc',
              }}
            >
              ARIA Insights
            </div>
            <p style={{ margin: 0, color: '#e0e0e0', lineHeight: 1.6, fontSize: 15 }}>
              {ariaInsight}
            </p>
            {stats.absent_count > 0 && (
              <p style={{ margin: '10px 0 0', color: '#f59e0b', fontStyle: 'italic' }}>
                Consider following up with those who were absent.
              </p>
            )}
          </div>
        </div>

        {/* Key Metrics Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 16,
            marginBottom: 30,
          }}
        >
          <MetricCard
            icon="✅"
            label="Present Today"
            value={stats.present_count}
            color="#34D399"
          />
          <MetricCard
            icon="🔴"
            label="Need Follow‑up"
            value={stats.absent_count}
            color="#F59E0B"
            caption="Absent today"
          />
          <MetricCard
            icon="🟡"
            label="New Visitors"
            value={stats.new_members || 0}
            color="#60A5FA"
          />
          <MetricCard
            icon="❤️"
            label="Prayer Requests"
            value={stats.prayer_requests}
            color="#F472B6"
          />
          <MetricCard
            icon="⚠️"
            label="Invalid Numbers"
            value={stats.wrong_numbers}
            color="#9CA3AF"
          />
          <MetricCard
            icon="🚨"
            label="Urgent (Pastor)"
            value={stats.needs_pastor}
            color="#EF4444"
          />
        </div>

        {/* Quick Actions */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 14,
            marginBottom: 20,
          }}
        >
          <button
            onClick={() =>
              sendBulkWhatsApp(
                'GIBEON',
                '⛪ *Havilah Christian Church*\n\nDear {first_name}, thank you for worshipping with us at GIBEON 2026! We are grateful for your presence. Stay blessed! 🙏'
              )
            }
            style={actionButtonStyle}
          >
            📩 Send GIBEON Thank‑You
          </button>
          <button
            onClick={() =>
              sendBulkWhatsApp(
                'GIBEON',
                '📖 *Bible Study Reminder*\n\nHello {first_name}, join us tomorrow (Tuesday) for our weekly Bible Study. Time: 6 PM. Come expectant!'
              )
            }
            style={actionButtonStyle}
          >
            📖 Bible Study Reminder
          </button>
        </div>

        {/* Optional: Latest activity or timeline preview could go here */}
      </div>
    </Layout>
  );
}

// Reusable metric card
function MetricCard({ icon, label, value, color = '#E0E0E0', caption }) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.03)',
        backdropFilter: 'blur(8px)',
        borderRadius: 18,
        padding: 20,
        textAlign: 'center',
        border: '1px solid rgba(255,255,255,0.06)',
        transition: 'transform 0.2s, border-color 0.2s',
        cursor: 'default',
      }}
      onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-3px)')}
      onMouseLeave={e => (e.currentTarget.style.transform = 'none')}
    >
      <div style={{ fontSize: 28, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 36, fontWeight: 700, color }}>{value}</div>
      {caption && (
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
          {caption}
        </div>
      )}
    </div>
  );
}

const actionButtonStyle = {
  padding: '12px 24px',
  background: 'rgba(79,70,229,0.8)',
  backdropFilter: 'blur(5px)',
  color: '#fff',
  borderRadius: 14,
  fontWeight: 600,
  fontSize: 15,
  border: '1px solid rgba(255,255,255,0.1)',
  cursor: 'pointer',
  transition: 'background 0.2s',
};
