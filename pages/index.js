// pages/index.js
// ARIA Today — production homepage.
// One source of truth: /api/aria/home.
// Homepage states: EMPTY → STARTING → OBSERVING → PATTERN → ACTION/ATTENTION.

import{useEffect,useState}from'react';
import{useRouter}from'next/router';
import{supabase}from'../lib/supabaseClient';
import Layout from'../components/Layout';
import ScanModal from'../components/ScanModal';
import FirstExperience from'../components/FirstExperience';
import{useOnboarding}from'../components/OnboardingProvider';

export default function ARIAHome(){
  const router=useRouter();
  const onboarding=useOnboarding();
  const[data,setData]=useState(null);
  const[loading,setLoading]=useState(true);
  const[showScan,setShowScan]=useState(false);

  useEffect(()=>{
    let active=true;

    async function load(){
      try{
        const{data:{session}}=await supabase.auth.getSession();

        if(!active)return;

        if(!session){
          await router.replace('/login');
          return;
        }

        const res=await fetch('/api/aria/home',{
          headers:{
            Authorization:`Bearer ${session.access_token}`
          }
        });

        if(!active)return;

        if(!res.ok){
          console.error('[ARIA] Home API failed:',res.status);
          setData(null);
          return;
        }

        setData(await res.json());
      }catch(err){
        if(active)console.error('[ARIA] Home load error:',err);
      }finally{
        if(active)setLoading(false);
      }
    }

    load();
    return()=>{active=false};
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

  if(!data){
    return(
      <Layout>
        <div style={{maxWidth:900,margin:'0 auto',padding:'40px 20px'}}>
          <h1 style={{fontSize:28,color:'#f0f0f0'}}>ARIA Today</h1>
          <p style={{color:'rgba(255,255,255,.6)'}}>
            ARIA could not load the organization view.
          </p>
          <button
            className="fiducia-button fiducia-button-primary"
            onClick={()=>window.location.reload()}
          >
            Try again
          </button>
        </div>
      </Layout>
    );
  }

  const isEmpty=data.state==='empty';
  const showExperience=
    isEmpty&&
    onboarding?.loaded&&
    onboarding.enabled&&
    !onboarding.isExperienced('home');

  const stats=data.stats||{};
  const signals=data.signals||{};
  const next=data.nextAction||{};

  return(
    <Layout>
      <div style={{maxWidth:900,margin:'0 auto',padding:'40px 20px'}}>

        {showExperience&&(
          <FirstExperience
            experience="home"
            onComplete={()=>onboarding.completeExperience('home')}
          />
        )}

        {/* ARIA HERO — the single emotional focal point. */}
        <section style={{marginBottom:36}}>
          <div style={{
            color:'rgba(255,255,255,.4)',
            fontSize:13,
            letterSpacing:'.08em',
            textTransform:'uppercase',
            marginBottom:12
          }}>
            ARIA Today
          </div>

          <h1 style={{
            fontSize:'clamp(30px,5vw,44px)',
            lineHeight:1.12,
            fontWeight:600,
            color:'#f0f0f0',
            margin:'0 0 14px'
          }}>
            {data.title}
          </h1>

          <p
            className="aria-speaks"
            style={{
              fontSize:19,
              lineHeight:1.55,
              color:'rgba(255,255,255,.68)',
              maxWidth:720,
              margin:0,
              whiteSpace:'pre-line'
            }}
          >
            {data.summary}
          </p>
        </section>

        {/* REAL ORGANIZATION STATS — never shown as fake zero-data copy. */}
        {!isEmpty&&(
          <section style={{
            display:'grid',
            gridTemplateColumns:'repeat(3,minmax(0,1fr))',
            gap:10,
            marginBottom:32
          }}>
            <Stat label="PEOPLE" value={stats.people}/>
            <Stat label="30-DAY SESSIONS" value={stats.sessions30}/>
            <Stat label="ACTIVE ATTENDEES" value={stats.activeAttendees30}/>
          </section>
        )}

        {/* ONE CLEAR NEXT STEP. */}
        <section style={{marginBottom:36}}>
          <h2 style={{
            fontSize:18,
            fontWeight:500,
            color:'#f0f0f0',
            marginBottom:12
          }}>
            What should I do?
          </h2>

          <div className="fiducia-card" style={{padding:'18px 20px'}}>
            <div style={{
              color:'#f0f0f0',
              fontSize:16,
              fontWeight:500
            }}>
              {next.title}
            </div>

            <div style={{
              color:'rgba(255,255,255,.55)',
              fontSize:14,
              lineHeight:1.5,
              marginTop:5
            }}>
              {next.description}
            </div>

            {next.type==='SCAN'&&(
              <button
                onClick={()=>setShowScan(true)}
                className="fiducia-button fiducia-button-primary"
                style={{marginTop:14}}
              >
                Scan Register
              </button>
            )}

            {next.type==='SCAN_OR_SESSION'&&(
              <div style={{
                display:'flex',
                gap:10,
                flexWrap:'wrap',
                marginTop:14
              }}>
                <button
                  onClick={()=>setShowScan(true)}
                  className="fiducia-button fiducia-button-primary"
                >
                  Scan Register
                </button>
                <a
                  href="/people?tab=attendance"
                  className="fiducia-button fiducia-button-secondary"
                >
                  Record Attendance
                </a>
              </div>
            )}

            {['REVIEW','REVIEW_PATTERN'].includes(next.type)&&(
              <a
                href="/people?tab=review"
                className="fiducia-button fiducia-button-secondary"
                style={{display:'inline-block',marginTop:14}}
              >
                Review
              </a>
            )}
          </div>
        </section>

        {/* SIGNALS — shown only when ARIA actually has signals. */}
        {data.observations?.length>0&&(
          <section style={{marginBottom:36}}>
            <h2 style={{
              fontSize:18,
              fontWeight:500,
              color:'#f0f0f0',
              marginBottom:12
            }}>
              What ARIA noticed
            </h2>

            <div style={{
              display:'flex',
              flexDirection:'column',
              gap:8
            }}>
              {data.observations.slice(0,5).map((o,i)=>(
                <div
                  key={o.id||i}
                  className="fiducia-card"
                  style={{padding:'14px 18px'}}
                >
                  <div style={{
                    display:'flex',
                    alignItems:'center',
                    gap:8
                  }}>
                    <span style={{
                      width:8,
                      height:8,
                      borderRadius:'50%',
                      background:
                        o.severity==='critical'?'#EF4444':
                        o.severity==='high'?'#F59E0B':
                        o.severity==='medium'?'#FBBF24':
                        '#34D399'
                    }}/>
                    <span style={{
                      color:'#f0f0f0',
                      fontWeight:500
                    }}>
                      {String(o.type||'Signal').replace(/_/g,' ')}
                    </span>
                  </div>

                  {o.evidence?.inference&&(
                    <p style={{
                      margin:'7px 0 0',
                      color:'rgba(255,255,255,.55)',
                      fontSize:14,
                      lineHeight:1.45
                    }}>
                      {o.evidence.inference}
                    </p>
                  )}

                  <div style={{
                    marginTop:6,
                    color:'rgba(255,255,255,.35)',
                    fontSize:12
                  }}>
                    Confidence {Math.round(Number(o.confidence||0)*100)}%
                    {' · '}
                    Attention {Number(o.attention_score)||0}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* PATTERN SUMMARY — makes ARIA's predictive purpose visible. */}
        {signals.slippingPeople>0&&(
          <section style={{marginBottom:36}}>
            <h2 style={{
              fontSize:18,
              fontWeight:500,
              color:'#f0f0f0',
              marginBottom:12
            }}>
              Emerging pattern
            </h2>

            <div className="fiducia-card" style={{padding:'16px 20px'}}>
              <div style={{color:'#f0f0f0',fontWeight:500}}>
                {signals.slippingPeople} people may need a closer look
              </div>
              <p style={{
                margin:'6px 0 0',
                color:'rgba(255,255,255,.5)',
                fontSize:14,
                lineHeight:1.5
              }}>
                ARIA found a repeated attendance pattern. This is an
                observation based on recorded history, not a prediction
                of what anyone will do.
              </p>
            </div>
          </section>
        )}

        {/* ACTIONS — human approval remains mandatory. */}
        {data.actions?.length>0&&(
          <section style={{marginBottom:36}}>
            <h2 style={{
              fontSize:18,
              fontWeight:500,
              color:'#f0f0f0',
              marginBottom:12
            }}>
              Recommended actions
            </h2>

            <div style={{
              display:'flex',
              flexDirection:'column',
              gap:8
            }}>
              {data.actions.slice(0,5).map((a,i)=>(
                <div
                  key={a.id||i}
                  className="fiducia-card"
                  style={{padding:'14px 18px'}}
                >
                  <div style={{color:'#f0f0f0',fontWeight:500}}>
                    {a.first_name
                      ?`${a.first_name} · ${String(a.type).replace(/_/g,' ')}`
                      :String(a.type).replace(/_/g,' ')}
                  </div>
                  <div style={{
                    color:'rgba(255,255,255,.4)',
                    fontSize:12,
                    marginTop:5
                  }}>
                    {a.priority} priority · human review required
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* QUIET STATE — only one reassurance. */}
        {!isEmpty&&
         data.observations?.length===0&&
         data.actions?.length===0&&
         signals.slippingPeople===0&&(
          <div style={{
            color:'rgba(255,255,255,.35)',
            fontSize:13,
            marginBottom:36
          }}>
            ARIA is watching for meaningful changes and will surface
            patterns when there is enough evidence.
          </div>
        )}

        <div style={{
          display:'flex',
          gap:10,
          flexWrap:'wrap',
          marginTop:20
        }}>
          <button
            onClick={()=>setShowScan(true)}
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

        <div style={{
          marginTop:50,
          paddingTop:24,
          borderTop:'1px solid rgba(255,255,255,.05)',
          color:'rgba(255,255,255,.3)',
          fontSize:13
        }}>
          Every Person. Every Story. Remembered.
        </div>
      </div>

      <ScanModal
        isOpen={showScan}
        onClose={()=>setShowScan(false)}
      />
    </Layout>
  );
}

function Stat({label,value}){
  return(
    <div className="fiducia-card" style={{padding:'15px 16px'}}>
      <div style={{
        color:'rgba(255,255,255,.35)',
        fontSize:10,
        letterSpacing:'.08em'
      }}>
        {label}
      </div>
      <div style={{
        color:'#f0f0f0',
        fontSize:24,
        fontWeight:600,
        marginTop:4
      }}>
        {value}
      </div>
    </div>
  );
      }
