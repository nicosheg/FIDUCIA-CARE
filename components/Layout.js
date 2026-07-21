import Link from 'next/link';
import { useRouter } from 'next/router';

export default function Layout({ children }) {
  const router = useRouter();
  return (
    <>
      {/* Background gradient – deep navy, slow animation */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 0,
          background: 'linear-gradient(135deg, #0b0f19 0%, #1a1f2b 50%, #0b0f19 100%)',
          backgroundSize: '400% 400%',
          animation: 'bgShift 20s ease infinite',
        }}
      />
      {/* Navigation */}
      <nav
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 999,
          backdropFilter: 'blur(20px)',
          background: 'rgba(11,15,25,0.6)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          padding: '12px 24px',
          display: 'flex',
          justifyContent: 'center',
          gap: 28,
          flexWrap: 'wrap',
        }}
      >
        <Link href="/" style={router.pathname === '/' ? activeLink : link}>
          <span style={{ marginRight: 6 }}>📊</span> Dashboard
        </Link>
        <Link href="/scan" style={router.pathname === '/scan' ? activeLink : link}>
          <span style={{ marginRight: 6 }}>📷</span> Scan
        </Link>
        <Link href="/members" style={router.pathname === '/members' ? activeLink : link}>
          <span style={{ marginRight: 6 }}>👥</span> Members
        </Link>
        <Link href="/session" style={router.pathname === '/session' ? activeLink : link}>
          <span style={{ marginRight: 6 }}>📋</span> Session
        </Link>
      </nav>

      {/* Page content */}
      <main style={{ position: 'relative', zIndex: 1, paddingBottom: 80, minHeight: '100vh' }}>
        {children}
      </main>

      {/* Premium footer */}
      <footer
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          width: '100%',
          backdropFilter: 'blur(20px)',
          background: 'rgba(11,15,25,0.7)',
          color: '#fff',
          textAlign: 'center',
          padding: '10px 0',
          fontSize: 13,
          zIndex: 1000,
          borderTop: '1px solid rgba(255,255,255,0.06)',
          letterSpacing: 0.5,
        }}
      >
        <span style={{ opacity: 0.6 }}>FIDUCIA CARE </span>
        <span style={{ fontWeight: 600 }}>· Intelligence by FIDUCIA</span>
      </footer>

      <style jsx global>{`
        @keyframes bgShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        body {
          margin: 0;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          color: #e0e0e0;
        }
        * {
          box-sizing: border-box;
        }
        ::selection {
          background: rgba(79, 70, 229, 0.4);
        }
      `}</style>
    </>
  );
}

const link = {
  textDecoration: 'none',
  color: 'rgba(255,255,255,0.65)',
  fontWeight: 500,
  fontSize: 15,
  transition: 'all 0.2s',
};

const activeLink = {
  ...link,
  color: '#fff',
  fontWeight: 600,
  borderBottom: '2px solid #4F46E5',
  paddingBottom: 4,
};
