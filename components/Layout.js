import Link from 'next/link';
import { useRouter } from 'next/router';

export default function Layout({ children }) {
  const router = useRouter();

  return (
    <>
      {/* ---------- Living Canvas ---------- */}
      <div style={atmosphere}>
        <div style={wave1} />
        <div style={wave2} />
        <div style={wave3} />
      </div>

      {/* ---------- Quiet Navigation ---------- */}
      <nav style={nav}>
        <Link href="/" style={router.pathname === '/' ? activeLink : link}>
          Home
        </Link>
        <Link href="/scan" style={router.pathname === '/scan' ? activeLink : link}>
          Scan
        </Link>
        <Link href="/community" style={router.pathname === '/community' ? activeLink : link}>
          Community
        </Link>
      </nav>

      <main style={main}>{children}</main>

      <footer style={footer}>
        Every Person. Every Story. Remembered.
      </footer>

      <style jsx global>{`
        @keyframes drift1 { 0%{transform:translateX(0)translateY(0)rotate(0)}50%{transform:translateX(-3%)translateY(-2%)rotate(1deg)}100%{transform:translateX(0)translateY(0)rotate(0)} }
        @keyframes drift2 { 0%{transform:translateX(0)translateY(0)rotate(0)}50%{transform:translateX(4%)translateY(1%)rotate(-.5deg)}100%{transform:translateX(0)translateY(0)rotate(0)} }
        @keyframes drift3 { 0%{transform:translateX(0)translateY(0)rotate(0)}50%{transform:translateX(-5%)translateY(3%)rotate(.2deg)}100%{transform:translateX(0)translateY(0)rotate(0)} }
        @keyframes floatParticle { 0%{transform:translateY(0)translateX(0);opacity:0}10%{opacity:.8}90%{opacity:.8}100%{transform:translateY(-100vh)translateX(-50px);opacity:0} }
        @keyframes scanMove { 0%{transform:translateX(-100%)}100%{transform:translateX(400%)} }
        body { margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color:#e0e0e0; background:#0A0F1A; }
        * { box-sizing:border-box; }
      `}</style>
    </>
  );
}

// ----- Atmosphere (deep navy, soft center illumination) -----
const atmosphere = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  zIndex: 0,
  overflow: 'hidden',
  background: 'radial-gradient(ellipse at 50% 50%, #141c2b 0%, #0A0F1A 70%)',
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
  background: 'radial-gradient(ellipse at 30% 50%, rgba(212,175,55,0.04) 0%, transparent 60%)',
  animationName: 'drift1',
};

const wave2 = {
  ...waveBase,
  background: 'radial-gradient(ellipse at 70% 40%, rgba(180,160,100,0.03) 0%, transparent 60%)',
  animationName: 'drift2',
  animationDuration: '40s',
};

const wave3 = {
  ...waveBase,
  background: 'radial-gradient(ellipse at 50% 70%, rgba(212,175,55,0.03) 0%, transparent 60%)',
  animationName: 'drift3',
  animationDuration: '45s',
};

// ----- Navigation (minimal, no emoji) -----
const nav = {
  position: 'sticky',
  top: 0,
  zIndex: 999,
  background: 'rgba(10,15,26,0.8)',
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

// ----- Main content area -----
const main = {
  position: 'relative',
  zIndex: 1,
  paddingBottom: 100,
  minHeight: '100vh',
};

// ----- Footer (simple, no emoji) -----
const footer = {
  position: 'fixed',
  bottom: 0,
  left: 0,
  width: '100%',
  background: 'rgba(10,15,26,0.8)',
  color: '#fff',
  textAlign: 'center',
  padding: '10px 0',
  fontSize: 12,
  zIndex: 1000,
  borderTop: '1px solid rgba(255,255,255,0.04)',
  letterSpacing: 1,
  opacity: 0.6,
};
