// pages/_app.js
// Nyeo Care — global application wrapper.
// OnboardingProvider makes the organization's first-experience state
// available to Home, People, Review, Profile, and other pages.

import { OnboardingProvider } from '../components/OnboardingProvider';

export default function App({ Component, pageProps }) {
  return (
    <>
      <style jsx global>{`
        @keyframes gradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        body {
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          color: #1a1a2e;
        }

        * {
          box-sizing: border-box;
        }
      `}</style>

      <OnboardingProvider>
        <Component {...pageProps} />
      </OnboardingProvider>
    </>
  );
  }
