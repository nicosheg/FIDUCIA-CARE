// pages/index.js
// ARIA Today — calm daily home.
// One Moment leads. Signals, patterns and actions support it.
// ARIA observes; humans decide.

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

        if(res.ok)setData(await res.json());
        else console.error('[ARIA] Daily endpoint failed:',res.status);
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
        <div style={{maxWidth:900,margin:'0 auto',padding:'40px 20px'}}>
          <div className="fiducia-card shimmer" style={{height:220,padding:24}}/>
        </div>
      </Layout>
    );
  }

  const signals=data?.signals||{};
  const observations=signals.observations||[];
  const patterns=signals.patterns||[];
  const actions=signals.actions||[];

  const hasSignals=
    observations.length>0||
    patterns.length>0||
    actions.length>0;

  const peopleCount=Number(data?.organization?.peopleCount)||0;
  const sessions=Number(data?.organization?.sessionsLast30Days)||0;

  // The first-time state is intentionally different from a healthy
  // organization with no current signals.
  const isJustStarting=
    peopleCount<=1&&
    sessions===0&&
    !hasSignals;

  const moment=isJustStarting
    ? "You're just getting started."
    : data?.summary||'ARIA is watching for meaningful changes.';

  const nextAction=isJustStarting
    ? 'Scan your first register and ARIA will begin learning the people and patterns in your community.'
    : data?.nextAction||'Nothing needs your attention right now.';

  return(
    <Layout>
      <div style={{
        maxWidth:900,
        margin:'0 auto',
        padding:'40px 20px 60px'
      }}>

        {onboarding?.loaded&&
         onboarding.enabled&&
         !onboarding.isExperienced('home')&&(
          <FirstExperience
            experience="home"
            onComplete={()=>onboarding.completeExperience('home')}
          />
        )}

        {/* ARIA MOMENT — the emotional center of the home. */}
        <section style={{
          padding:'28px 0 36px',
          maxWidth:720
        }}>
          <div style={{
            color:'rgba(255,255,255,.35)',
            fontSize:12,
            letterSpacing:1.2,
            textTransform:'uppercase',
            marginBottom:12
          }}>
            ARIA Today
          </div>

          <h1 style={{
            fontSize:'clamp(30px,5vw,46px)',
            lineHeight:1.12,
            fontWeight:500,
            letterSpacing:-1.2,
            color:'#f0f0f0',
            margin:0
          }}>
            {moment}
          </h1>

          {!isJustStarting&&(
            <p style={{
              fontSize:17,
              lineHeight:1.6,
              color:'rgba(255,255,255,.55)',
              margin:'16px 0 0',
              maxWidth:650
            }}>
              {data?.summary}
            </p>
          )}
        </section>

        {/* FIRST MOMENT — give a new organization one clear path forward. */}
        {isJustStarting&&(
          <section className="fiducia-card" style={{
            padding:'22px 20px',
            marginBottom:36
          }}>
            <div style={{
              color:'#f0f0f0',
              fontSize:16,
              fontWeight:500,
              marginBottom:7
            }}>
              Begin with your people.
            </div>

            <p style={{
              color:'rgba(255,255,255,.5)',
              fontSize:14,
              lineHeight:1.55,
              margin:'0 0 18px',
              maxWidth:600
            }}>
              Scan your first register and ARIA will start building the
              memory needed to notice meaningful changes over time.
            </p>

            <button
              onClick={()=>setShowScanModal(true)}
              className="fiducia-button fiducia-button-primary"
            >
              Scan First Register
            </button>
          </section>
        )}

        {/* NEXT ACTION — always one clear recommendation. */}
        {!isJustStarting&&(
          <section style={{marginBottom:36}}>
            <div style={{
              color:'rgba(255,255,255,.35)',
              fontSize:12,
              letterSpacing:1,
              textTransform:'uppercase',
              marginBottom:10
            }}>
              Next step
            </div>

            <div className="fiducia-card" style={{
              padding:'18px 20px'
            }}>
              <div style={{
                color:'#f0f0f0',
                fontSize:16,
                lineHeight:1.5
              }}>
                {nextAction}
              </div>
            </div>
          </section>
        )}

        {/* PATTERNS — prevention layer. */}
        {patterns.length>0&&(
          <section style={{marginBottom:36}}>
            <h2 style={{
              fontSize:18,
              fontWeight:500,
              color:'#f0f0f0',
              margin:'0 0 12px'
            }}>
              Patterns ARIA noticed
            </h2>

            <div style={{
              display:'flex',
              flexDirection:'column',
              gap:8
            }}>
              {patterns.slice(0,5).map((p,i)=>(
                <div
                  key={p.personId||i}
                  className="fiducia-card"
                  style={{padding:'14px 20px'}}
                >
                  <div style={{
                    color:'#f0f0f0',
                    fontWeight:500
                  }}>
                    {p.name||'Person'}
                  </div>

                  <div style={{
                    color:'rgba(255,255,255,.55)',
                    fontSize:14,
                    lineHeight:1.5,
                    marginTop:5
                  }}>
                    {p.message}
                  </div>

                  <div style={{
                    color:'rgba(255,255,255,.3)',
                    fontSize:12,
                    marginTop:7
                  }}>
                    Pattern · {p.evidence.sessionsAttended}/
                    {p.evidence.sessionsObserved} recent sessions attended
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* OBSERVATIONS — evidence layer. */}
        {observations.length>0&&(
          <section style={{marginBottom:36}}>
            <h2 style={{
              fontSize:18,
              fontWeight:500,
              color:'#f0f0f0',
              margin:'0 0 12px'
            }}>
              Signals
            </h2>

            <div style={{
              display:'flex',
              flexDirection:'column',
              gap:8
            }}>
              {observations.slice(0,5).map((o,i)=>(
                <div
                  key={o.id||i}
                  className="fiducia-card"
                  style={{padding:'14px 20px'}}
                >
                  <div style={{
                    display:'flex',
                    justifyContent:'space-between',
                    gap:12
                  }}>
                    <span style={{
                      color:'#f0f0f0',
                      fontWeight:500
                    }}>
                      {o.name||
                       o.observationType?.replace(/_/g,' ')||
                       'ARIA signal'}
                    </span>

                    <span style={{
                      color:'rgba(255,255,255,.4)',
                      fontSize:12
                    }}>
                      {o.severity||'medium'}
                    </span>
                  </div>

                  <div style={{
                    color:'rgba(255,255,255,.4)',
                    fontSize:12,
                    marginTop:6
                  }}>
                    Confidence {Math.round(o.confidence*100)}%
                    {' · '}
                    Attention {o.attentionScore}
                  </div>

                  {o.evidence?.inference&&(
                    <div style={{
                      color:'rgba(255,255,255,.45)',
                      fontSize:13,
                      lineHeight:1.5,
                      marginTop:6
                    }}>
                      {o.evidence.inference}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* RECOMMENDATIONS — human approval remains required. */}
        {actions.length>0&&(
          <section style={{marginBottom:36}}>
            <h2 style={{
              fontSize:18,
              fontWeight:500,
              color:'#f0f0f0',
              margin:'0 0 12px'
            }}>
              Recommended actions
            </h2>

            <div style={{
              display:'flex',
              flexDirection:'column',
              gap:8
            }}>
              {actions.slice(0,5).map((a,i)=>(
                <div
                  key={a.id||i}
                  className="fiducia-card"
                  style={{padding:'14px 20px'}}
                >
                  <div style={{
                    color:'#f0f0f0',
                    fontWeight:500
                  }}>
                    {a.name||'Organization'}
                  </div>

                  <div style={{
                    color:'rgba(255,255,255,.55)',
                    fontSize:14,
                    lineHeight:1.5,
                    marginTop:5
                  }}>
                    {a.nextAction}
                  </div>

                  <div style={{
                    color:'rgba(255,255,255,.3)',
                    fontSize:12,
                    marginTop:7
                  }}>
                    {a.priority} · {a.status}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* QUIET STATE — only one reassurance, not several. */}
        {!isJustStarting&&!hasSignals&&(
          <section style={{
            padding:'12px 0 24px',
            color:'rgba(255,255,255,.38)',
            fontSize:14
          }}>
            Nothing significant needs your attention today.
          </section>
        )}

        {/* ORGANIZATION CONTEXT — intentionally quiet. */}
        {!isJustStarting&&data?.organization&&(
          <div style={{
            display:'flex',
            gap:20,
            flexWrap:'wrap',
            padding:'16px 0',
            marginBottom:28,
            borderTop:'1px solid rgba(255,255,255,.06)',
            borderBottom:'1px solid rgba(255,255,255,.06)'
          }}>
            <span style={{color:'rgba(255,255,255,.35)',fontSize:12}}>
              {peopleCount} people
            </span>
            <span style={{color:'rgba(255,255,255,.35)',fontSize:12}}>
              {sessions} sessions in 30 days
            </span>
            <span style={{color:'rgba(255,255,255,.35)',fontSize:12}}>
              {data.organization.activeAttendeesLast30Days||0} active attendees
            </span>
          </div>
        )}

        {/* CARE QUEUE — only show when it has something to say. */}
        {hasSignals&&<CareQueueList/>}

        {!isJustStarting&&(
          <div style={{
            display:'flex',
            gap:12,
            marginTop:28,
            flexWrap:'wrap'
          }}>
            <button
              onClick={()=>setShowScanModal(true)}
              className="fiducia-button fiducia-button-primary"
            >
              Scan Register
            </button>

            <a
              href="/people?tab=community"
              className="fiducia-button fiducia-button-secondary"
            >
              People
            </a>

            <a
              href="/people?tab=review"
              className="fiducia-button fiducia-button-ghost"
            >
              Review
            </a>

            <a
              href="/people?tab=attendance"
              className="fiducia-button fiducia-button-ghost"
            >
              Attendance
            </a>
          </div>
        )}

        {!isJustStarting&&(
          <div style={{
            marginTop:50,
            color:'rgba(255,255,255,.25)',
            fontSize:13
          }}>
            Every Person. Every Story. Remembered.
          </div>
        )}
      </div>

      <ScanModal
        isOpen={showScanModal}
        onClose={()=>setShowScanModal(false)}
      />
    </Layout>
  );
                                                       }
