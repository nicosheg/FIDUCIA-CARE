// components/OnboardingProvider.js
// Loads onboarding once and makes its state available throughout nyeo Care.

import {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';

const OnboardingContext = createContext(null);

export function OnboardingProvider({ children }) {
  const router = useRouter();

  const [state, setState] = useState({
    loaded: false,
    enabled: false,
    experienced: {},
    ariaInstructions: '',
  });

  const load = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setState(prev => ({ ...prev, loaded: true }));
      return;
    }

    try {
      const response = await fetch('/api/onboarding', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Unable to load onboarding');
      }

      const data = await response.json();

      setState({
        loaded: true,
        enabled: data.onboarding?.enabled === true,
        experienced: data.onboarding?.experienced || {},
        ariaInstructions: data.ariaInstructions || '',
      });
    } catch (error) {
      console.error('[ONBOARDING] Load error:', error);
      setState(prev => ({ ...prev, loaded: true }));
    }
  };

  useEffect(() => {
    load();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.push('/login');
        return;
      }

      load();
    });

    return () => subscription.unsubscribe();
  }, [router]);

  const completeExperience = experience => {
    setState(prev => ({
      ...prev,
      experienced: {
        ...prev.experienced,
        [experience]: true,
      },
    }));
  };

  const isExperienced = experience =>
    state.experienced?.[experience] === true;

  return (
    <OnboardingContext.Provider
      value={{
        ...state,
        isExperienced,
        completeExperience,
        reload: load,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  return useContext(OnboardingContext);
      }
