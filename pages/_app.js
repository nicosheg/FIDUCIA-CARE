// pages/_app.js
// Nyeo Care — global first-experience provider.

import { OnboardingProvider } from '../components/OnboardingProvider';

// Keep your existing imports and existing App logic.

export default function App({ Component, pageProps }) {
  return (
    <>
      {/* Keep your existing global CSS here. */}

      <OnboardingProvider>
        <Component {...pageProps} />
      </OnboardingProvider>
    </>
  );
}
