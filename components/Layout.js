import Link from 'next/link';

export default function Layout({ children }) {
  return (
    <>
      {/* Top Navigation */}
      <nav style={{
        position: 'sticky',
        top: 0,
        zIndex: 999,
        background: '#fff',
        borderBottom: '1px solid #eee',
        padding: '12px 20px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 20,
        justifyContent: 'center',
        boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
      }}>
        <Link href="/" style={navLinkStyle}>📊 Dashboard</Link>
        <Link href="/scan" style={navLinkStyle}>📷 Scan</Link>
        <Link href="/members" style={navLinkStyle}>👥 Members</Link>
        <Link href="/session" style={navLinkStyle}>📋 New Session</Link>
      </nav>

      {/* Page Content */}
      <main style={{ minHeight: '100vh', paddingBottom: 60 }}>{children}</main>

      {/* Premium Footer */}
      <footer style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        width: '100%',
        background: 'linear-gradient(90deg, #1a1a2e, #16213e)',
        color: '#fff',
        textAlign: 'center',
        padding: '12px 0',
        fontSize: 14,
        fontWeight: 500,
        letterSpacing: 0.5,
        zIndex: 1000,
        boxShadow: '0 -2px 10px rgba(0,0,0,0.15)',
        borderTop: '1px solid rgba(255,255,255,0.05)',
      }}>
        <span style={{ opacity: 0.85 }}>Intelligence by </span>
        <span style={{ fontWeight: 700 }}>FIDUCIA</span>
      </footer>
    </>
  );
}

const navLinkStyle = {
  textDecoration: 'none',
  color: '#333',
  fontWeight: 500,
  fontSize: 16,
};
