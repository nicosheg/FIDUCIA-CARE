import Link from 'next/link';
import { useRouter } from 'next/router';

export default function Layout({ children }) {
  const router = useRouter();

  return (
    <>
      {/* ---------- Living Presence Background ---------- */}
      <div style={bg}>
        <div style={wave1} />
        <div style={wave2} />
        <div style={wave3} />
        <div style={particlesContainer}>
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                width: 3,
                height: 3,
                background: 'rgba(212,175,55,0.2)',
                borderRadius: '50%',
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animation: `floatParticle ${15 + Math.random() * 20}s linear infinite`,
                animationDelay: `${Math.random() * 10}s`,
              }}
            />
          ))}
        </div>
      </div>

      {/* ---------- Glass Navigation ---------- */}
      <nav style={nav}>
        <Link href="/" style={router.pathname === '/' ? activeLink : link}>
          🏠 Home
        </Link>
        <Link href="/scan" style={router.pathname === '/scan' ? activeLink : link}>
          📷 Scan
        </Link>
        <Link href="/community" style={router.pathname === '/community' ? activeLink : link}>
          👥 Community
        </Link>
      </nav>

      {/* ---------- Page Content ---------- */}
      <main style={main}>{children}</main>

      {/* ---------- Footer – futuristic, minimal ---------- */}
      <footer
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          width: '100%',
          backdropFilter: 'blur(30px)',
          background: 'rgba(10, 15, 26, 0.7)',
          color: '#fff',
          textAlign: 'center',
          padding: '10px 0',
          fontSize: 12,
          zIndex: 1000,
          borderTop: '1px solid rgba(255,255,255,0.04)',
          letterSpacing: 1,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span style={{ opacity: 0.5 }}>FIDUCIA CARE</span>
        <span style={{ opacity: 0.3, fontWeight: 300 }}>·</span>
        <span style={{ opacity: 0.5, fontWeight: 300 }}>Every Person. Every Story. Remembered.</span>
      </footer>

      <style jsx global>{`
        @keyframes drift1 {
          0% { transform: translateX(0%) translateY(0%) rotate(0deg); }
          50% { transform: translateX(-3%) translateY(-2%) rotate(1deg); }
          100% { transform: translateX(0%) translateY(0%) rotate(0deg); }
        }
        @keyframes drift2 {
          0% { transform: translateX(0%) translateY(0%) rotate(0deg); }
          50% { transform: translateX(4%) translateY(1%) rotate(-0.5deg); }
          100% { transform: translateX(0%) translateY(0%) rotate(0deg); }
        }
        @keyframes drift3 {
          0% { transform: translateX(0%) translateY(0%) rotate(0deg); }
          50% { transform: translateX(-5%) translateY(3%) rotate(0.2deg); }
          100% { transform: translateX(0%) translateY(0%) rotate(0deg); }
        }
        @keyframes floatParticle {
          0% { transform: translateY(0) translateX(0); opacity: 0; }
          10% { opacity: 0.8; }
          90% { opacity: 0.8; }
          100% { transform: translateY(-100vh) translateX(-50px); opacity: 0; }
        }
        @keyframes scanMove {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
        body {
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          color: #e0e0e0;
          background: #0A0F1A;
        }
        * { box-sizing: border-box; }
        ::selection { background: rgba(212, 175, 55, 0.3); }
      `}</style>
    </>
  );
}

// ---------- Background layers ----------
const bg = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  zIndex: 0,
  overflow: 'hidden',
  background: 'linear-gradient(135deg, #0A0F1A 0%, #0E1625 50%, #0A0F1A 100%)',
};

const waveBase = {
  position: 'absolute',
  width: '200%',
  height: '200%',
  top: '-50%',
  left: '-50%',
  animationDuration: '35s',
  animationTimingFunction: 'ease-in-out',
  animationIterationCount: 'infinite',
};

const wave1 = {
  ...waveBase,
  background: 'radial-gradient(ellipse at 30% 50%, rgba(212, 175, 55, 0.06) 0%, transparent 60%)',
  animationName: 'drift1',
};

const wave2 = {
  ...waveBase,
  background: 'radial-gradient(ellipse at 70% 40%, rgba(180, 160, 100, 0.04) 0%, transparent 60%)',
  animationName: 'drift2',
  animationDuration: '40s',
};

const wave3 = {
  ...waveBase,
  background: 'radial-gradient(ellipse at 50% 70%, rgba(212, 175, 55, 0.04) 0%, transparent 60%)',
  animationName: 'drift3',
  animationDuration: '45s',
};

const particlesContainer = {
  position: 'absolute',
  width: '100%',
  height: '100%',
  top: 0,
  left: 0,
};

// ---------- Navigation ----------
const nav = {
  position: 'sticky',
  top: 0,
  zIndex: 999,
  backdropFilter: 'blur(30px)',
  background: 'rgba(10, 15, 26, 0.6)',
  borderBottom: '1px solid rgba(255,255,255,0.04)',
  padding: '14px 24px',
  display: 'flex',
  justifyContent: 'center',
  gap: 36,
  flexWrap: 'wrap',
};

const link = {
  textDecoration: 'none',
  color: 'rgba(255,255,255,0.55)',
  fontWeight: 450,
  fontSize: 15,
  transition: 'color 0.3s',
};

const activeLink = {
  ...link,
  color: '#D4AF37',
  fontWeight: 600,
};

// ---------- Main content area ----------
const main = {
  position: 'relative',
  zIndex: 1,
  paddingBottom: 100,
  minHeight: '100vh',
};
