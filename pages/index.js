// pages/index.js
// ARIA Today / Care Home.
// Real organization intelligence: facts → patterns → next action.

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

  const[briefing,setBriefing]=useState(null);
  const[priority,setPriority]=useState([]);
  const[brainFeed,setBrainFeed]=useState([]);
  const[recommendations,setRecommendations]=useState([]);
  const[ariaData,setAriaData]=useState(null);
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

        const headers={
          Authorization:`Bearer ${session.access_token}`
        };

        const[
          briefRes,
          prioRes,
          feedRes,
          recRes,
          ariaRes
        ]=await Promise.all([
          fetch('/api/daily-briefing/latest',{headers}),
          fetch('/api/priority-queue?limit=10',{headers}),
          fetch('/api/brain-feed?limit=10',{headers}),
          fetch('/api/recommendations?limit=10',{headers}),
          fetch('/api/aria/observations?aggregated=true&limit=10',{headers})
        ]);

        if(!active)return;

        const briefJson=briefRes.ok?await briefRes.json():null;
        const prioJson=prioRes.ok?await prioRes.json():[];
        const feedJson=feedRes.ok?await feedRes.json():[];
        const recJson=recRes.ok?await recRes.json():[];
        const ariaJson=ariaRes.ok?await ariaRes.json():null;

        setBriefing(briefJson?.briefing||briefJson);
        setPriority(Array.isArray(prioJson)?prioJson:[]);
        setBrainFeed(Array.isArray(feedJson)?feedJson:[]);
        setRecommendations(Array.isArray(recJson)?recJson:[]);
        setAriaData(ariaJson);
      }catch(error){
        if(active)console.error('[ARIA] Home load error:',error);
      }finally{
        if(active)setLoading(false);
      }
    }

    init();
    return()=>{active=false};
  },[router]);

  if(loading){
    return(
      <Layout>
        <div style={{padding:40,maxWidth:900,margin:'0 auto'}}>
          <div
            className="fiducia-card shimmer"
            style={{padding:24,height:200}}
          />
        </div>
      </Layout>
    );
  }

  const summary=
    briefing?.summary||
    'ARIA is ready and watching for meaningful changes.';

  const nextAction=briefing?.nextAction||null;

  const showHomeExperience=
    onboarding?.loaded&&
    onboarding.enabled&&
    !onboarding.isExperienced('home');

  return(
    <Layout>
      <div style={{maxWidth:900,margin:'0 auto',padding:'40px 20px'}}>

        {showHomeExperience&&(
          <FirstExperience
            experience="home"
            onComplete={()=>onboarding.completeExperience('home')}
          />
        )}

        {/* ARIA DAILY BRIEFING */}
        <h1 style={{
          fontSize:28,
          fontWeight:600,
          color:'#f0f0f0',
          marginBottom:8
        }}>
          ARIA Today
        </h1>

        <p
          className="aria-speaks"
          style={{
            fontSize:18,
            color:'rgba(255,255,255,.7)',
            marginBottom:24,
            whiteSpace:'pre-line'
          }}
        >
          {summary}
        </p>

        {/* ORGANIZATION FACTS */}
        {briefing?.facts&&(
          <div style={{marginBottom:32}}>
            <h2 style={{
              fontSize:20,
              fontWeight:500,
              color:'#f0f0f0',
              marginBottom:12
            }}>
              Today&apos;s Picture
            </h2>

            <div
              className="fiducia-card"
              style={{
                padding:'16px 20px',
                display:'grid',
                gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',
                gap:16
              }}
            >
              <div>
                <div style={{color:'rgba(255,255,255,.45)',fontSize:12}}>
                  PEOPLE
                </div>
                <div style={{color:'#f0f0f0',fontSize:24}}>
                  {briefing.facts.activePeople}
                </div>
              </div>

              <div>
                <div style={{color:'rgba(255,255,255,.45)',fontSize:12}}>
                  PRESENT 30D
                </div>
                <div style={{color:'#f0f0f0',fontSize:24}}>
                  {briefing.facts.attendanceLast30Days?.present||0}
                </div>
              </div>

              <div>
                <div style={{color:'rgba(255,255,255,.45)',fontSize:12}}>
                  PARTICIPATION
                </div>
                <div style={{color:'#f0f0f0',fontSize:24}}>
                  {briefing.facts.participationLast30Days||0}
                </div>
              </div>

              <div>
                <div style={{color:'rgba(255,255,255,.45)',fontSize:12}}>
                  ACTIVE SIGNALS
                </div>
                <div style={{color:'#f0f0f0',fontSize:24}}>
                  {briefing.facts.activeObservations||0}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* NEXT ACTION — THE MOST IMPORTANT PART */}
        {nextAction&&(
          <div style={{marginBottom:32}}>
            <h2 style={{
              fontSize:20,
              fontWeight:500,
              color:'#f0f0f0',
              marginBottom:12
            }}>
              What To Do Next
            </h2>

            <div
              className="fiducia-card"
              style={{padding:'18px 20px'}}
            >
              <div style={{
                color:'#f0f0f0',
                fontSize:17,
                fontWeight:500
              }}>
                {nextAction.title}
              </div>

              <p style={{
                margin:'7px 0 0',
                color:'rgba(255,255,255,.55)',
                fontSize:14
              }}>
                {nextAction.description}
              </p>

              {nextAction.type!=='NONE'&&(
                <div style={{
                  marginTop:10,
                  color:'rgba(255,255,255,.3)',
                  fontSize:12
                }}>
                  ARIA recommendation · Human approval required
                </div>
              )}
            </div>
          </div>
        )}

        {/* EMERGING PATTERNS */}
        {briefing?.patterns?.length>0&&(
          <div style={{marginBottom:32}}>
            <h2 style={{
              fontSize:20,
              fontWeight:500,
              color:'#f0f0f0',
              marginBottom:12
            }}>
              Emerging Patterns
            </h2>

            <div style={{
              display:'flex',
              flexDirection:'column',
              gap:8
            }}>
              {briefing.patterns.slice(0,5).map((p,idx)=>(
                <div
                  key={idx}
                  className="fiducia-card"
                  style={{padding:'14px 20px'}}
                >
                  <div style={{
                    color:'#f0f0f0',
                    fontWeight:500
                  }}>
                    {p.name||'Organization signal'}
                  </div>

                  <div style={{
                    marginTop:4,
                    color:'rgba(255,255,255,.55)',
                    fontSize:14
                  }}>
                    {p.reason}
                  </div>

                  <div style={{
                    marginTop:6,
                    color:'rgba(255,255,255,.25)',
                    fontSize:11
                  }}>
                    PATTERN · Not a prediction
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ARIA OBSERVATIONS */}
        {ariaData?.summaries?.length>0&&(
          <div style={{marginBottom:32}}>
            <h2 style={{
              fontSize:20,
              fontWeight:500,
              color:'#f0f0f0',
              marginBottom:12
            }}>
              What ARIA Is Seeing
            </h2>

            <div
              className="fiducia-card"
              style={{padding:'16px 20px'}}
            >
              {ariaData.summaries.map((s,idx)=>(
                <div
                  key={idx}
                  style={{
                    display:'flex',
                    justifyContent:'space-between',
                    padding:'8px 0',
                    borderBottom:'1px solid rgba(255,255,255,.05)'
                  }}
                >
                  <span style={{color:'#f0f0f0'}}>
                    {String(s.type).replace(/_/g,' ')}
                  </span>

                  <span style={{
                    color:'rgba(255,255,255,.5)'
                  }}>
                    {s.count} · Avg attention {Math.round(s.avg_attention||0)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TOP PRIORITY */}
        {priority.length>0&&(
          <div style={{marginBottom:32}}>
            <h2 style={{
              fontSize:20,
              fontWeight:500,
              color:'#f0f0f0',
              marginBottom:12
            }}>
              People Worth Noticing
            </h2>

            <div style={{
              display:'flex',
              flexDirection:'column',
              gap:8
            }}>
              {priority.slice(0,10).map((p,idx)=>(
                <div
                  key={idx}
                  className="fiducia-card"
                  style={{padding:'14px 20px'}}
                >
                  <div style={{
                    display:'flex',
                    justifyContent:'space-between',
                    gap:10
                  }}>
                    <span style={{
                      color:'#f0f0f0',
                      fontWeight:500
                    }}>
                      {p.first_name} {p.last_name||''}
                    </span>

                    <span style={{
                      color:'rgba(255,255,255,.3)',
                      fontSize:12
                    }}>
                      {p.priority_score}
                    </span>
                  </div>

                  <div style={{
                    marginTop:5,
                    color:'rgba(255,255,255,.5)',
                    fontSize:13
                  }}>
                    {p.reason}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* INTELLIGENCE FEED */}
        {brainFeed.length>0&&(
          <div style={{marginBottom:32}}>
            <h2 style={{
              fontSize:20,
              fontWeight:500,
              color:'#f0f0f0',
              marginBottom:12
            }}>
              Intelligence Feed
            </h2>

            <div style={{
              display:'flex',
              flexDirection:'column',
              gap:8
            }}>
              {brainFeed.slice(0,5).map((item,idx)=>(
                <div
                  key={idx}
                  className="fiducia-card"
                  style={{padding:'12px 20px'}}
                >
                  <div style={{
                    color:'#f0f0f0',
                    fontWeight:500
                  }}>
                    {item.title}
                  </div>

                  <p style={{
                    margin:'5px 0 0',
                    color:'rgba(255,255,255,.5)',
                    fontSize:14
                  }}>
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* RECOMMENDATIONS */}
        {recommendations.length>0&&(
          <div style={{marginBottom:32}}>
            <h2 style={{
              fontSize:20,
              fontWeight:500,
              color:'#f0f0f0',
              marginBottom:12
            }}>
              Recommended Actions
            </h2>

            <div style={{
              display:'flex',
              flexDirection:'column',
              gap:8
            }}>
              {recommendations.slice(0,5).map((rec,idx)=>(
                <div
                  key={idx}
                  className="fiducia-card"
                  style={{padding:'12px 20px'}}
                >
                  <div style={{color:'#f0f0f0'}}>
                    {rec.recommendation_text||
                     rec.action_metadata?.reason||
                     rec.type||
                     'Review this ARIA recommendation'}
                  </div>

                  <div style={{
                    marginTop:4,
                    color:'rgba(255,255,255,.3)',
                    fontSize:12
                  }}>
                    {rec.priority||'medium'} · Human approval required
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <CareQueueList/>

        {/* NAVIGATION */}
        <div style={{
          display:'flex',
          gap:12,
          marginTop:20,
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
      </div>

      <ScanModal
        isOpen={showScanModal}
        onClose={()=>setShowScanModal(false)}
      />
    </Layout>
  );
          }
