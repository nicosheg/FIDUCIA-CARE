import Link from 'next/link';
import { useRouter } from 'next/router';

// Permanent node positions – the universe is fixed
const NODES = [
  { x: 18, y: 25, dur: 7.4, bright: 0.3 },
  { x: 74, y: 31, dur: 8.8, bright: 0.25 },
  { x: 42, y: 58, dur: 10.2, bright: 0.35 },
  { x: 88, y: 12, dur: 9.1, bright: 0.28 },
  { x: 10, y: 72, dur: 11.4, bright: 0.32 },
  { x: 55, y: 85, dur: 6.8, bright: 0.27 },
  { x: 32, y: 14, dur: 12.1, bright: 0.22 },
  { x: 67, y: 45, dur: 8.3, bright: 0.31 },
  { x: 90, y: 67, dur: 9.7, bright: 0.29 },
  { x: 24, y: 92, dur: 10.5, bright: 0.26 },
  { x: 78, y: 7,  dur: 7.9, bright: 0.33 },
  { x: 49, y: 38, dur: 11.0, bright: 0.24 },
  { x: 5,  y: 48, dur: 8.6, bright: 0.3 },
  { x: 96, y: 55, dur: 9.4, bright: 0.28 },
  { x: 60, y: 73, dur: 10.8, bright: 0.25 },
];

// Pre‑defined faint connections (indices)
const LINES = [
  [0, 2], [1, 3], [4, 6], [5, 8], [9, 11], [13, 14]
];

export default function Layout({ children }) {
  const router = useRouter();

  return (
    <>
      {/* ---------- Living Canvas ---------- */}
      <div className="livingCanvas" id="livingCanvas">
        <div className="ambientDrift1" />
        <div className="ambientDrift2" />

        {/* Constellation with parallax */}
        <div className="constellation" id="constellation">
          <svg className="constellationLines" viewBox="0 0 100 100" preserveAspectRatio="none">
            {LINES.map(([a, b], i) => (
              <line key={i}
                x1={NODES[a].x} y1={NODES[a].y} x2={NODES[b].x} y2={NODES[b].y}
                className="relationshipLine"
                stroke="rgba(212,175,55,0.04)"
                strokeWidth="0.3"
              />
            ))}
          </svg>
          {NODES.map((node, i) => (
            <div
              key={i}
              className="constellationNode"
              style={{
                left: `${node.x}%`,
                top: `${node.y}%`,
                animationDuration: `${node.dur}s`,
                opacity: node.bright,
              }}
            />
          ))}
        </div>
      </div>

      {/* ---------- Navigation ---------- */}
      <nav className="fiduciaNav">
        <Link href="/" className={router.pathname === '/' ? 'navLink active' : 'navLink'}>
          Home
        </Link>
        <Link href="/scan" className={router.pathname === '/scan' ? 'navLink active' : 'navLink'}>
          Scan
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
        /* ---------- Living Canvas ---------- */
        .livingCanvas {
          position: fixed;
          top: 0; left: 0; width: 100%; height: 100%;
          z-index: 0; overflow: hidden;
          background: radial-gradient(ellipse at 50% 50%, #141c2b 0%, #0A0F1A 70%);
          animation: canvasAwaken 1.2s ease-out forwards;
        }
        @keyframes canvasAwaken {
          0% { opacity: 0.8; }
          100% { opacity: 1; }
        }

        .ambientDrift1, .ambientDrift2 {
          position: absolute;
          width: 150%; height: 150%; top: -25%; left: -25%;
        }
        .ambientDrift1 {
          background: radial-gradient(ellipse at 40% 50%, rgba(212,175,55,0.02) 0%, transparent 60%);
          animation: drift1 30s ease-in-out infinite;
        }
        .ambientDrift2 {
          background: radial-gradient(ellipse at 60% 40%, rgba(212,175,55,0.02) 0%, transparent 60%);
          animation: drift2 40s ease-in-out infinite;
        }
        @keyframes drift1 {
          0% { transform: translateX(0) translateY(0); }
          50% { transform: translateX(-1%) translateY(-1%); }
          100% { transform: translateX(0) translateY(0); }
        }
        @keyframes drift2 {
          0% { transform: translateX(0) translateY(0); }
          50% { transform: translateX(1%) translateY(0.5%); }
          100% { transform: translateX(0) translateY(0); }
        }

        /* ---------- Constellation (parallax via slightly slower scroll) ---------- */
        .constellation {
          position: absolute;
          width: 100%; height: 120%; top: -10%; left: 0;
          transform: translateZ(0);
          transition: transform 0.1s linear;
        }
        .constellationLines {
          position: absolute;
          width: 100%; height: 100%;
          opacity: 0.6;
        }
        .relationshipLine {
          transition: stroke 1.5s ease;
        }
        .constellationNode {
          position: absolute;
          width: 4px; height: 4px;
          border-radius: 50%;
          background: rgba(212,175,55,0.25);
          box-shadow: 0 0 6px rgba(212,175,55,0.3);
          animation: nodeBreathe var(--dur, 8s) ease-in-out infinite alternate;
        }
        @keyframes nodeBreathe {
          0% { opacity: 0.25; transform: scale(1); }
          100% { opacity: 0.5; transform: scale(1.3); }
        }

        /* ---------- Navigation ---------- */
        .fiduciaNav {
          position: sticky; top: 0; z-index: 999;
          background: rgba(10,15,26,0.8);
          border-bottom: 1px solid rgba(255,255,255,0.04);
          padding: 14px 24px;
          display: flex; justify-content: center; gap: 36px; flex-wrap: wrap;
        }
        .navLink {
          text-decoration: none;
          color: rgba(255,255,255,0.55);
          font-weight: 450; font-size: 15px;
          position: relative;
          padding: 4px 0;
          transition: color 0.3s, text-shadow 0.3s;
        }
        .navLink.active {
          color: #D4AF37; font-weight: 600;
          text-shadow: 0 0 8px rgba(212,175,55,0.2);
        }
        .navLink.active::after {
          content: '';
          position: absolute;
          bottom: -2px; left: 50%;
          transform: translateX(-50%);
          width: 60%; height: 2px;
          background: radial-gradient(ellipse at center, rgba(212,175,55,0.6) 0%, transparent 80%);
          border-radius: 50%;
        }

        /* ---------- Main Content ---------- */
        .mainContent {
          position: relative; z-index: 1; padding-bottom: 100px; min-height: 100vh;
        }

        /* ---------- Footer ---------- */
        .fiduciaFooter {
          position: fixed; bottom: 0; left: 0; width: 100%;
          background: rgba(10,15,26,0.8); color: #fff;
          text-align: center; padding: 10px 0; font-size: 12px; z-index: 1000;
          border-top: 1px solid rgba(255,255,255,0.04);
          letter-spacing: 1px; opacity: 0.2;
        }

        /* ---------- Cards – breathing, staggered emergence ---------- */
        .fiducia-card {
          background: rgba(20,25,40,0.9);
          border-radius: 26px;
          border: 1px solid rgba(255,255,255,0.05);
          box-shadow: inset 0 0 10px rgba(212,175,55,0.03);
          transition: border-color 0.4s ease, box-shadow 0.4s ease, transform 0.2s ease;
          animation: cardEmerge 0.6s ease-out backwards, cardBreathe 20s ease-in-out infinite alternate;
        }
        @keyframes cardEmerge {
          0% { opacity: 0; filter: blur(4px); transform: scale(0.98); }
          100% { opacity: 1; filter: blur(0); transform: scale(1); }
        }
        @keyframes cardBreathe {
          0% { box-shadow: inset 0 0 10px rgba(212,175,55,0.03); }
          100% { box-shadow: inset 0 0 14px rgba(212,175,55,0.06); }
        }
        .fiducia-card:active {
          border-color: rgba(212,175,55,0.25);
          box-shadow: inset 0 0 15px rgba(212,175,55,0.08);
          transform: scale(0.99);
        }

        /* ---------- Buttons – Invitation Hierarchy ---------- */
        .fiducia-button {
          padding: 12px 24px; border-radius: 30px;
          font-weight: 500; font-size: 15px; cursor: pointer;
          transition: background 0.2s, box-shadow 0.2s, transform 0.1s;
          display: inline-block; text-decoration: none; text-align: center;
          user-select: none; border: 1px solid transparent;
        }
        .fiducia-button-primary {
          background: rgba(212,175,55,0.1); border-color: rgba(212,175,55,0.2);
          color: #D4AF37;
        }
        .fiducia-button-primary:active {
          background: rgba(212,175,55,0.2);
          box-shadow: 0 0 18px rgba(212,175,55,0.12);
          transform: scale(0.98);
        }
        .fiducia-button-secondary {
          background: rgba(59,130,246,0.1); border-color: rgba(59,130,246,0.2);
          color: #60A5FA;
        }
        .fiducia-button-secondary:active {
          background: rgba(59,130,246,0.2);
          box-shadow: 0 0 18px rgba(59,130,246,0.12);
          transform: scale(0.98);
        }
        .fiducia-button-ghost {
          background: transparent; border-color: rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.6);
        }
        .fiducia-button-ghost:active {
          background: rgba(255,255,255,0.05);
          box-shadow: 0 0 10px rgba(255,255,255,0.05);
          transform: scale(0.98);
        }

        /* ---------- ARIA's Voice ---------- */
        .aria-speaks {
          color: #f0ead6;
          font-weight: 400;
          line-height: 1.6;
          letter-spacing: 0.01em;
        }

        /* ---------- Global ---------- */
        body {
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          color: #e0e0e0;
          background: #0A0F1A;
        }
        * { box-sizing: border-box; }
      `}</style>
    </>
  );
   }
