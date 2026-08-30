// pages/_app.js
// NYEO Care global app wrapper.
// Provides onboarding state and global visual foundations.

import { OnboardingProvider } from '../components/OnboardingProvider';

export default function App({ Component, pageProps }) {
  return (
    <OnboardingProvider>
      <style jsx global>{`
        *{box-sizing:border-box}
        html,body,#__next{margin:0;min-height:100%;width:100%}
        body{
          font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text","Segoe UI",Roboto,sans-serif;
          color:#e8edf7;
          background:#050a14;
          -webkit-font-smoothing:antialiased;
          text-rendering:optimizeLegibility;
        }
        button,input,textarea,select{font:inherit}
        button{color:inherit}
        a{-webkit-tap-highlight-color:transparent}
        ::selection{background:rgba(212,175,55,.25);color:#fff}

        /* ---------- Atmospheric motion ---------- */
        @keyframes skyDrift{
          0%{transform:translate3d(-2%,-1%,0) scale(1.08)}
          50%{transform:translate3d(2%,1%,0) scale(1.1)}
          100%{transform:translate3d(-2%,-1%,0) scale(1.08)}
        }
        @keyframes cloudDrift{
          0%{transform:translate3d(-5%,2%,0) scale(1.08)}
          50%{transform:translate3d(5%,-2%,0) scale(1.12)}
          100%{transform:translate3d(-5%,2%,0) scale(1.08)}
        }
        @keyframes cloudDriftReverse{
          0%{transform:translate3d(4%,-2%,0) scale(1.12)}
          50%{transform:translate3d(-4%,2%,0) scale(1.08)}
          100%{transform:translate3d(4%,-2%,0) scale(1.12)}
        }

        /* ---------- ARIA ambient life ---------- */
        @keyframes ariaBreath{
          0%,100%{opacity:.72}
          50%{opacity:.9}
        }

        /* ---------- Respect reduced motion ---------- */
        @media(prefers-reduced-motion:reduce){
          *,*::before,*::after{
            animation-duration:.01ms!important;
            animation-iteration-count:1!important;
            scroll-behavior:auto!important;
          }
        }
      `}</style>
      <Component {...pageProps}/>
    </OnboardingProvider>
  );
  }
