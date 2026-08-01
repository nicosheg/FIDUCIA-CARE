import Link from 'next/link';
import { useRouter } from 'next/router';

export default function Layout({ children }) {
  const router = useRouter();

  return (
    <>
      {/* ---------- Deep-water animated background ---------- */}
      <div style={backgroundContainer}>
        <div style={wave1} />
        <div style={wave2} />
        <div style={wave3} />
      </div>

      {/* ---------- Frosted navigation ---------- */}
      <nav style={navStyle}>
        <Link href="/" style={router.pathname === '/' ? activeLink : link}>📊 Dashboard</Link>
        <Link href="/scan" style={router.pathname === '/scan' ? activeLink : link}>📷 Scan</Link>
        <Link href="/community" style={router.pathname === '/community' ? activeLink : link}>👥 Community</Link>
        <Link href="/session" style={router.pathname === '/session' ? activeLink : link}>📋 Session</Link>
      </nav>

      {/* ---------- Page content on glass ---------- */}
      <main style={mainStyle}>{children}</main>

      {/* ---------- Premium footer ---------- */}
      <footer style={footerStyle}>
        <span style={{ opacity: 0.6 }}>FIDUCIA CARE </span>
        <span style={{ fontWeight: 600 }}>· Intelligence by FIDUCIA</span>
      </footer>

      <style jsx global>{`
        @keyframes drift1 {
          0% { transform: translateX(0%) translateY(0%) rotate(0deg); }
          50% { transform: translateX(-5%) translateY(-3%) rotate(1deg); }
          100% { transform: translateX(0%) translateY(0%) rotate(0deg); }
        }
        @keyframes drift2 {
          0% { transform: translateX(0%) translateY(0%) rotate(0deg); }
          50% { transform: translateX(5%) translateY(2%) rotate(-1deg); }
          100% { transform: translateX(0%) translateY(0%) rotate(0deg); }
        }
        @keyframes drift3 {
          0% { transform: translateX(0%) translateY(0%) rotate(0deg); }
          50% { transform: translateX(-8%) translateY(4%) rotate(0.5deg); }
          100% { transform: translateX(0%) translateY(0%) rotate(0deg); }
        }
        body {
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          color: #e0e0e0;
          background: #0A1128;
        }
        * { box-sizing: border-box; }
        ::selection { background: rgba(212, 175, 55, 0.3); }
      `}</style>
    </>
  );
}

// ---------- Background ----------
const backgroundContainer = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  zIndex: 0,
  overflow: 'hidden',
  background: 'linear-gradient(135deg, #0A1128 0%, #0D1B2A 50%, #0A1128 100%)',
};

const waveBase = {
  position: 'absolute',
  width: '200%',
  height: '200%',
  top: '-50%',
  left: '-50%',
  background: 'radial-gradient(ellipse at 30% 50%, rgba(212, 175, 55, 0.08) 0%, transparent 60%)',
  animationDuration: '25s',
  animationTimingFunction: 'ease-in-out',
  animationIterationCount: 'infinite',
};

const wave1 = {
  ...waveBase,
  background: 'radial-gradient(ellipse at 30% 50%, rgba(212, 175, 55, 0.08) 0%, transparent 60%)',
  animationName: 'drift1',
};

const wave2 = {
  ...waveBase,
  background: 'radial-gradient(ellipse at 70% 40%, rgba(100, 180, 255, 0.06) 0%, transparent 60%)',
  animationName: 'drift2',
  animationDuration: '30s',
};

const wave3 = {
  ...waveBase,
  background: 'radial-gradient(ellipse at 50% 70%, rgba(212, 175, 55, 0.05) 0%, transparent 60%)',
  animationName: 'drift3',
  animationDuration: '35s',
};

// ---------- Navigation ----------
const navStyle = {
  position: 'sticky',
  top: 0,
  zIndex: 999,
  backdropFilter: 'blur(20px)',
  background: 'rgba(10, 17, 40, 0.7)',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
  padding: '12px 24px',
  display: 'flex',
  justifyContent: 'center',
  gap: 28,
  flexWrap: 'wrap',
};

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
  borderBottom: '2px solid #D4AF37',
  paddingBottom: 4,
};

// ---------- Main content area ----------
const mainStyle = {
  position: 'relative',
  zIndex: 1,
  paddingBottom: 80,
  minHeight: '100vh',
};

// ---------- Footer ----------
const footerStyle = {
  position: 'fixed',
  bottom: 0,
  left: 0,
  width: '100%',
  backdropFilter: 'blur(20px)',
  background: 'rgba(10, 17, 40, 0.8)',
  color: '#fff',
  textAlign: 'center',
  padding: '10px 0',
  fontSize: 13,
  zIndex: 1000,
  borderTop: '1px solid rgba(255,255,255,0.06)',
  letterSpacing: 0.5,
};
