import Link from 'next/link';
import { useRouter } from 'next/router';

export default function Layout({ children }) {
  const router = useRouter();

  return (
    <>
      {/* ---------- Living Canvas ---------- */}
      <div className="livingCanvas">
        <div className="ambientDrift1" />
        <div className="ambientDrift2" />
      </div>

      {/* ---------- Navigation ---------- */}
      <nav className="fiduciaNav">
        <Link href="/" className={router.pathname === '/' ? 'navLink active' : 'navLink'}>
          Home
        </Link>
        <Link href="/scan" className={router.pathname === '/scan' ? 'navLink active' : 'navLink'}>
          Scan
        </Link>
        <Link href="/attendance" className={router.pathname === '/attendance' ? 'navLink active' : 'navLink'}>
          Attendance
        </Link>
        <Link href="/community" className={router.pathname === '/community' ? 'navLink active' : 'navLink'}>
          Community
        </Link>
      </nav>

      <main className="mainContent">{children}</main>

      <footer className="fiduciaFooter">
        Every Person. Every Story. Remembered.
      </footer>

      <style jsx global>{`
        .livingCanvas {
          position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 0; overflow: hidden;
          background: radial-gradient(ellipse at 50% 50%, #141c2b 0%, #0A0F1A 70%);
          animation: canvasAwaken 1.2s ease-out forwards;
        }
        @keyframes canvasAwaken { 0% { opacity: 0.8; } 100% { opacity: 1; } }
        .ambientDrift1, .ambientDrift2 { position: absolute; width: 150%; height: 150%; top: -25%; left: -25%; }
        .ambientDrift1 {
          background: radial-gradient(ellipse at 40% 50%, rgba(212,175,55,0.02) 0%, transparent 60%);
          animation: drift1 30s ease-in-out infinite;
        }
        .ambientDrift2 {
          background: radial-gradient(ellipse at 60% 40%, rgba(212,175,55,0.02) 0%, transparent 60%);
          animation: drift2 40s ease-in-out infinite;
        }
        @keyframes drift1 { 0% { transform: translateX(0) translateY(0); } 50% { transform: translateX(-1%) translateY(-1%); } 100% { transform: translateX(0) translateY(0); } }
        @keyframes drift2 { 0% { transform: translateX(0) translateY(0); } 50% { transform: translateX(1%) translateY(0.5%); } 100% { transform: translateX(0) translateY(0); } }
        .fiduciaNav {
          position: sticky; top: 0; z-index: 999;
          background: rgba(10,15,26,0.8); border-bottom: 1px solid rgba(255,255,255,0.04);
          padding: 14px 24px; display: flex; justify-content: center; gap: 36px; flex-wrap: wrap;
        }
        .navLink {
          text-decoration: none; color: rgba(255,255,255,0.55); font-weight: 450; font-size: 15px;
          position: relative; padding: 4px 0; transition: color 0.3s, text-shadow 0.3s;
        }
        .navLink.active {
          color: #D4AF37; font-weight: 600; text-shadow: 0 0 8px rgba(212,175,55,0.2);
        }
        .navLink.active::after {
          content: ''; position: absolute; bottom: -2px; left: 50%; transform: translateX(-50%);
          width: 60%; height: 2px;
          background: radial-gradient(ellipse at center, rgba(212,175,55,0.6) 0%, transparent 80%);
          border-radius: 50%;
        }
        .mainContent { position: relative; z-index: 1; padding-bottom: 100px; min-height: 100vh; }
        .fiduciaFooter {
          position: fixed; bottom: 0; left: 0; width: 100%;
          background: rgba(10,15,26,0.8); color: #fff; text-align: center; padding: 10px 0;
          font-size: 12px; z-index: 1000; border-top: 1px solid rgba(255,255,255,0.04);
          letter-spacing: 1px; opacity: 0.2;
        }
        body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #e0e0e0; background: #0A0F1A; }
        * { box-sizing: border-box; }
      `}</style>
    </>
  );
    }
