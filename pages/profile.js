// pages/profile.js
import Layout from '../components/Layout';
import ChurchProfileTab from '../components/ChurchProfileTab';

export default function ProfilePage() {
  return (
    <Layout>
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '40px 20px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, color: '#f0f0f0', marginBottom: 30 }}>Profile</h1>

        <div style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 20, fontWeight: 500, color: '#f0f0f0', marginBottom: 16 }}>Church Profile</h2>
          <ChurchProfileTab />
        </div>

        <div style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: 20, fontWeight: 500, color: '#f0f0f0', marginBottom: 16 }}>Account</h2>
          <div className="fiducia-card" style={{ padding: 24 }}>
            <p style={{ color: 'rgba(255,255,255,0.5)' }}>Account settings will appear here.</p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
