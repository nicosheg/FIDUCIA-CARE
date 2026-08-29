// components/OnboardingProvider.js
// ARIA Care onboarding state only.
// IMPORTANT: This provider does NOT perform auth redirects or subscribe to auth events.
// Authentication/route protection belongs to the individual application pages.

import{createContext,useContext,useEffect,useState,useCallback}from'react';
import{supabase}from'../lib/supabaseClient';

const OnboardingContext=createContext(null);

const INITIAL_STATE={
  loaded:false,
  enabled:false,
  experienced:{},
  ariaInstructions:''
};

export function OnboardingProvider({children}){
  const[state,setState]=useState(INITIAL_STATE);

  // Load onboarding only when a valid authenticated session exists.
  const load=useCallback(async()=>{
    try{
      const{data:{session}}=await supabase.auth.getSession();

      if(!session){
        setState(prev=>({...prev,loaded:true,enabled:false}));
        return;
      }

      const response=await fetch('/api/onboarding',{
        headers:{Authorization:`Bearer ${session.access_token}`}
      });

      if(!response.ok)throw new Error(`Onboarding request failed: ${response.status}`);

      const data=await response.json();

      setState({
        loaded:true,
        enabled:data.onboarding?.enabled===true,
        experienced:data.onboarding?.experienced||{},
        ariaInstructions:data.ariaInstructions||''
      });
    }catch(error){
      console.error('[ONBOARDING] Load error:',error);
      setState(prev=>({...prev,loaded:true}));
    }
  },[]);

  // One initial load. No auth listener here to avoid auth-event/getSession loops.
  useEffect(()=>{
    let active=true;
    const initialize=async()=>{
      if(active)await load();
    };
    initialize();
    return()=>{active=false;};
  },[load]);

  const completeExperience=useCallback(experience=>{
    setState(prev=>({
      ...prev,
      experienced:{...prev.experienced,[experience]:true}
    }));
  },[]);

  const isExperienced=useCallback(
    experience=>state.experienced?.[experience]===true,
    [state.experienced]
  );

  return(
    <OnboardingContext.Provider value={{
      ...state,
      isExperienced,
      completeExperience,
      reload:load
    }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding(){
  return useContext(OnboardingContext);
}
