// pages/index.js
// ARIA Today — daily organizational intelligence.
// Source of truth: /api/aria/daily.
// ARIA observes, identifies patterns and recommends; the human decides.

import{useEffect,useState}from'react';
import{useRouter}from'next/router';
import{supabase}from'../lib/supabaseClient';
import Layout from'../components/Layout';
import CareQueueList from'../components/CareQueueList';
import ScanModal from'../components/ScanModal';
import FirstExperience from'../components/FirstExperience';
import{useOnboarding}from'../components/OnboardingProvider';

export default function ARIAHome(){
  const router=useRouter();
  const onboarding=useOnboarding();
  const[data,setData]=useState(null);
  const[loading,setLoading]=useState(true);
  const[showScanModal,setShowScanModal]=useState(false);

  useEffect(()=>{
    let active=true;

    async function init(){
      try{
        const{data:{session}}=await supabase.auth.getSession();
        if(!active)return;

        if(!session){
          await router.replace('/login');
          return;
        }

        const res=await fetch('/api/aria/daily',{
          headers:{Authorization:`Bearer ${session.access_token}`}
        });

        if(!active)return;

        if(res.ok){
          setData(await res.json());
        }else{
          console.error('[ARIA] Daily endpoint failed:',res.status);
          setData(null);
        }
      }catch(err){
        if(active)console.error('[ARIA] Home load error:',err);
      }finally{
        if(active)setLoading(false);
      }
    }

    init();
    return()=>{active=false;};
  },[router]);

  if(loading){
    return(
      <Layout>
        <div style={{padding:40,maxWidth:900,margin:'0 auto'}}>
          <div className="fiducia-card shimmer" style={{padding:24,height:220}}/>
        </div>
      </Layout>
    );
  }

  const showExperience=
    onboarding?.loaded&&
    onboarding.enabled&&
    !onboarding.isExperienced('home');

  const signals=data?.signals||{};
  const observations=signals.observations||[];
  const patterns=signals.patterns||[];
  const actions=signals.actions||[];
  const hasSignals=observations.length||patterns.length||actions.length;

  return(
    <Layout>
      <div style={{maxWidth:900,margin:'0 auto',padding:'40px 20px'}}>

        {showExperience&&(
          <FirstExperience
            experience="home"
            onComplete={()=>onboarding.completeExperience('home')}
          />
        )}

        <h1 style={{fontSize:28,fontWeight:600,color:'#f0f0f0',marginBottom:8}}>
          ARIA Today
        </h1>

        <p className="aria-speaks" style={{fontSize:18,color:'rgba(255,255,255,.7)',marginBottom:24,whiteSpace:'pre-line'}}>
          {data?.summary||'ARIA is ready and watching for meaningful changes.'}
        </p>

        {data?.organization&&(
          <div className="fiducia-card" style={{padding:'16px 20px',marginBottom:28}}>
            <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
              <div>
                <div style={{fontSize:12,color:'rgba(255,255,255,.4)'}}>PEOPLE</div>
                <div style={{fontSize:24,color:'#f0f0f0'}}>{data.organization.peopleCount}</div>
              </div>
              <div>
                <div style={{fontSize:12,color:'rgba(255,255,255,.4)'}}>30-DAY SESSIONS</div>
                <div style={{fontSize:24,color:'#f0f0f0'}}>{data.organization.sessionsLast30Days}</div>
              </div>
              <div>
                <div style={{fontSize:12,color:'rgba(255,255,255,.4)'}}>ACTIVE ATTENDEES</div>
                <div style={{fontSize:24,color:'#f0f0f0'}}>{data.organization.activeAttendeesLast30Days}</div>
              </div>
            </div>
          </div>
        )}

        <div style={{marginBottom:32}}>
          <h2 style={{fontSize:20,fontWeight:500,color:'#f0f0f0',marginBottom:12}}>
            What should I do?
          </h2>
          <div className="fiducia-card" style={{padding:'18px 20px'}}>
            <p style={{margin:0,color:'#f0f0f0',fontSize:16}}>
              {data?.nextAction||'Nothing needs your attention today.'}
            </p>
          </div>
        </div>

        {patterns.length>0&&(
          <div style={{marginBottom:32}}>
            <h2 style={{fontSize:20,fontWeight:500,color:'#f0f0f0',marginBottom:12}}>
              Patterns ARIA noticed
            </h2>

            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {patterns.slice(0,5).map((p,i)=>(
                <div key={p.personId||i} className="fiducia-card" style={{padding:'14px 20px'}}>
                  <div style={{color:'#f0f0f0',fontWeight:500}}>
                    {p.name||'Person'}
                  </div>
                  <div style={{color:'rgba(255,255,255,.55)',fontSize:14,marginTop:4}}>
                    {p.message}
                  </div>
                  <div style={{color:'rgba(255,255,255,.35)',fontSize:12,marginTop:6}}>
                    Pattern · {p.evidence.sessionsAttended}/{p.evidence.sessionsObserved} recent sessions attended
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {observations.length>0&&(
          <div style={{marginBottom:32}}>
            <h2 style={{fontSize:20,fontWeight:500,color:'#f0f0f0',marginBottom:12}}>
              Signals
            </h2>

            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {observations.slice(0,5).map((o,i)=>(
                <div key={o.id||i} className="fiducia-card" style={{padding:'14px 20px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',gap:12}}>
                    <span style={{color:'#f0f0f0',fontWeight:500}}>
                      {o.name||o.observationType?.replace(/_/g,' ')||'ARIA signal'}
                    </span>
                    <span style={{color:'rgba(255,255,255,.45)',fontSize:12}}>
                      {o.severity||'medium'}
                    </span>
                  </div>
                  <div style={{color:'rgba(255,255,255,.5)',fontSize:13,marginTop:5}}>
                    Confidence: {Math.round(o.confidence*100)}% · Attention: {o.attentionScore}
                  </div>
                  {o.evidence?.inference&&(
                    <div style={{color:'rgba(255,255,255,.4)',fontSize:13,marginTop:5}}>
                      {o.evidence.inference}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {actions.length>0&&(
          <div style={{marginBottom:32}}>
            <h2 style={{fontSize:20,fontWeight:500,color:'#f0f0f0',marginBottom:12}}>
              Recommended actions
            </h2>

            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {actions.slice(0,5).map((a,i)=>(
                <div key={a.id||i} className="fiducia-card" style={{padding:'14px 20px'}}>
                  <div style={{color:'#f0f0f0',fontWeight:500}}>
                    {a.name||'Organization'}
                  </div>
                  <div style={{color:'rgba(255,255,255,.55)',fontSize:14,marginTop:4}}>
                    {a.nextAction}
                  </div>
                  <div style={{color:'rgba(255,255,255,.35)',fontSize:12,marginTop:6}}>
                    {a.priority} · {a.status}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!hasSignals&&(
          <div className="fiducia-card" style={{padding:20,marginBottom:32}}>
            <div style={{color:'#f0f0f0',fontWeight:500}}>
              Every Person. Every Story. Remembered.
            </div>
            <p style={{color:'rgba(255,255,255,.45)',fontSize:14,margin:'6px 0 0'}}>
              ARIA is watching for meaningful changes and will surface patterns when there is enough evidence.
            </p>
          </div>
        )}

        <CareQueueList/>

        <div style={{display:'flex',gap:12,marginTop:24,flexWrap:'wrap'}}>
          <button
            onClick={()=>setShowScanModal(true)}
            className="fiducia-button fiducia-button-primary"
          >
            Scan Register
          </button>

          <a href="/people?tab=community" className="fiducia-button fiducia-button-secondary">
            People
          </a>

          <a href="/people?tab=review" className="fiducia-button fiducia-button-ghost">
            Review
          </a>

          <a href="/people?tab=attendance" className="fiducia-button fiducia-button-ghost">
            Attendance
          </a>
        </div>
      </div>

      <ScanModal
        isOpen={showScanModal}
        onClose={()=>setShowScanModal(false)}
      />
    </Layout>
  );
    }
