// pages/index.js — ARIA Today production homepage
import{useEffect,useState}from'react';
import{useRouter}from'next/router';
import{Manrope}from'next/font/google';
import{supabase}from'../lib/supabaseClient';
import Layout from'../components/Layout';
import CareQueueList from'../components/CareQueueList';
import ScanModal from'../components/ScanModal';
import FirstExperience from'../components/FirstExperience';
import{useOnboarding}from'../components/OnboardingProvider';

const manrope=Manrope({subsets:['latin'],display:'swap'});

function ToolModal({type,onClose,onContinue}){
  const data={
    attendance:{
      title:'Record Attendance',
      text:'Mark who was present. ARIA uses confirmed participation to understand patterns over time.',
      button:'Open Attendance'
    },
    review:{
      title:'Review People',
      text:'Review records and anything that needs your confirmation before ARIA treats it as settled.',
      button:'Open Review'
    }
  }[type];
  if(!data)return null;

  return(
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      style={{
        position:'fixed',inset:0,zIndex:1000,
        display:'flex',alignItems:'center',justifyContent:'center',
        padding:20,background:'rgba(0,0,0,.72)',
        backdropFilter:'blur(14px)'
      }}
    >
      <div
        className="fiducia-card"
        onClick={e=>e.stopPropagation()}
        style={{
          width:'100%',maxWidth:500,padding:26,
          background:'rgba(15,22,38,.98)',
          border:'1px solid rgba(255,255,255,.1)',
          boxShadow:'0 25px 80px rgba(0,0,0,.5)'
        }}
      >
        <div style={{display:'flex',justifyContent:'space-between',gap:20}}>
          <div>
            <div style={{
              fontSize:11,letterSpacing:2,textTransform:'uppercase',
              color:'rgba(255,255,255,.35)',marginBottom:8
            }}>ARIA</div>
            <h2 style={{margin:0,color:'#f5f5f5',fontSize:24,fontWeight:600}}>
              {data.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              border:0,background:'none',color:'rgba(255,255,255,.5)',
              fontSize:26,cursor:'pointer'
            }}
          >×</button>
        </div>

        <p style={{
          margin:'18px 0 24px',color:'rgba(255,255,255,.6)',
          fontSize:15,lineHeight:1.65
        }}>{data.text}</p>

        <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
          <button
            onClick={onContinue}
            className="fiducia-button fiducia-button-primary"
          >{data.button}</button>
          <button
            onClick={onClose}
            className="fiducia-button fiducia-button-ghost"
          >Cancel</button>
        </div>
      </div>
    </div>
  );
}

export default function ARIAHome(){
  const router=useRouter();
  const onboarding=useOnboarding();
  const[briefing,setBriefing]=useState(null);
  const[priority,setPriority]=useState([]);
  const[brainFeed,setBrainFeed]=useState([]);
  const[recommendations,setRecommendations]=useState([]);
  const[ariaData,setAriaData]=useState(null);
  const[loading,setLoading]=useState(true);
  const[scanOpen,setScanOpen]=useState(false);
  const[tool,setTool]=useState(null);

  useEffect(()=>{
    let active=true;
    async function init(){
      try{
        const{data:{session}}=await supabase.auth.getSession();
        if(!active)return;
        if(!session){await router.replace('/login');return;}

        const headers={Authorization:`Bearer ${session.access_token}`};
        const[brief,prio,feed,recs,obs]=await Promise.all([
          fetch('/api/daily-briefing/latest',{headers}),
          fetch('/api/priority-queue?limit=10',{headers}),
          fetch('/api/brain-feed?limit=10',{headers}),
          fetch('/api/recommendations',{headers}),
          fetch('/api/aria/observations?aggregated=true&limit=10',{headers})
        ]);
        if(!active)return;

        setBriefing(brief.ok?await brief.json():null);
        setPriority(prio.ok?await prio.json():[]);
        setBrainFeed(feed.ok?await feed.json():[]);
        setRecommendations(recs.ok?await recs.json():[]);
        setAriaData(obs.ok?await obs.json():null);
      }catch(e){
        if(active)console.error('[ARIA] Home load:',e);
      }finally{
        if(active)setLoading(false);
      }
    }
    init();
    return()=>{active=false;};
  },[router]);

  if(loading)return(
    <Layout>
      <div style={{padding:40,maxWidth:900,margin:'auto'}}>
        <div className="fiducia-card shimmer" style={{height:220}}/>
      </div>
    </Layout>
  );

  // Daily briefing row is nested inside the API response.
  const brief=briefing?.briefing||briefing||{};
  const people=brief.people_count??brief.people??0;
  const sessions=brief.sessions_30d??brief.sessions??0;
  const attendees=brief.active_attendees??brief.attendees??0;
  const hasSignals=priority.length||brainFeed.length||recommendations.length||(ariaData?.top?.length||0);

  const moment=brief.summary||
    (people===0
      ?'You’re just getting started.'
      :sessions===0
        ?'Your people are here. Now ARIA can begin learning.'
        :hasSignals
          ?'ARIA found a few things worth your attention today.'
          :'Nothing significant needs your attention right now.');

  const explanation=brief.message||
    (people===0
      ?'Begin with your people. Scan your first register and ARIA will start building the memory needed to notice meaningful changes over time.'
      :sessions===0
        ?`ARIA remembers ${people} active ${people===1?'person':'people'}. Record your first session so patterns can emerge over time.`
        :hasSignals
          ?'Here is what ARIA noticed and what you can do next.'
          :'ARIA is watching for meaningful changes and will surface patterns when there is enough evidence.');

  const firstExperience=onboarding?.loaded&&onboarding.enabled&&!onboarding.isExperienced('home');

  const continueTool=()=>{
    const path=tool==='attendance'?'/people?tab=attendance':'/people?tab=review';
    setTool(null);router.push(path);
  };

  return(
    <Layout>
      <main
        className={manrope.className}
        style={{maxWidth:900,margin:'auto',padding:'38px 20px 70px'}}
      >
        {firstExperience&&(
          <FirstExperience
            experience="home"
            onComplete={()=>onboarding.completeExperience('home')}
          />
        )}

        {/* PRIMARY MOMENT */}
        <section style={{padding:'8px 0 34px'}}>
          <div style={{
            fontSize:11,letterSpacing:2,textTransform:'uppercase',
            color:'rgba(255,255,255,.35)',marginBottom:15
          }}>ARIA Today</div>

          <h1 style={{
            margin:0,maxWidth:760,
            fontSize:'clamp(34px,7vw,52px)',
            lineHeight:1.08,letterSpacing:'-.035em',
            fontWeight:600,color:'#f5f5f5'
          }}>{moment}</h1>

          <p className="aria-speaks" style={{
            maxWidth:720,margin:'20px 0 0',
            fontSize:18,lineHeight:1.65,
            color:'rgba(255,255,255,.6)'
          }}>{explanation}</p>
        </section>

        {/* QUIET ORGANIZATION SNAPSHOT */}
        <section style={{
          display:'grid',
          gridTemplateColumns:'repeat(3,minmax(0,1fr))',
          gap:10,marginBottom:42
        }}>
          {[
            ['PEOPLE',people],
            ['30-DAY SESSIONS',sessions],
            ['ACTIVE ATTENDEES',attendees]
          ].map(([label,value])=>(
            <div key={label} className="fiducia-card" style={{padding:'17px 16px'}}>
              <div style={{
                fontSize:10,letterSpacing:1.2,
                color:'rgba(255,255,255,.38)'
              }}>{label}</div>
              <div style={{
                marginTop:7,fontSize:29,fontWeight:600,color:'#f5f5f5'
              }}>{value}</div>
            </div>
          ))}
        </section>

        {/* FIRST SESSION GUIDANCE */}
        {sessions===0&&(
          <section style={{marginBottom:40}}>
            <h2 style={{
              margin:'0 0 12px',fontSize:22,fontWeight:600,color:'#f0f0f0'
            }}>What should I do?</h2>

            <div className="fiducia-card" style={{padding:'22px 20px'}}>
              <h3 style={{
                margin:'0 0 7px',fontSize:19,fontWeight:600,color:'#f0f0f0'
              }}>Record your first session</h3>
              <p style={{
                margin:'0 0 20px',fontSize:15,lineHeight:1.6,
                color:'rgba(255,255,255,.55)'
              }}>
                Capture attendance so ARIA can begin detecting meaningful changes.
              </p>
              <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
                <button
                  onClick={()=>setScanOpen(true)}
                  className="fiducia-button fiducia-button-primary"
                >Scan Register</button>
                <button
                  onClick={()=>setTool('attendance')}
                  className="fiducia-button fiducia-button-secondary"
                >Record Attendance</button>
              </div>
            </div>
          </section>
        )}

        {/* SIGNAL SUMMARY */}
        {ariaData?.summaries?.length>0&&(
          <section style={{marginBottom:34}}>
            <h2 style={{
              margin:'0 0 11px',fontSize:21,fontWeight:500,color:'#f0f0f0'
            }}>What ARIA noticed</h2>
            <div className="fiducia-card" style={{padding:'12px 18px'}}>
              {ariaData.summaries.map((s,i)=>(
                <div key={i} style={{
                  display:'flex',justifyContent:'space-between',
                  gap:15,padding:'9px 0',
                  borderBottom:i<ariaData.summaries.length-1
                    ?'1px solid rgba(255,255,255,.05)':'none'
                }}>
                  <span style={{color:'#eee'}}>
                    {String(s.type||'').replace(/_/g,' ')}
                  </span>
                  <span style={{color:'rgba(255,255,255,.45)',fontSize:13}}>
                    {s.count} · {Math.round(Number(s.avg_attention)||0)} attention
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* TOP SIGNALS */}
        {ariaData?.top?.length>0&&(
          <section style={{marginBottom:34}}>
            <h2 style={{
              margin:'0 0 11px',fontSize:21,fontWeight:500,color:'#f0f0f0'
            }}>Signals worth knowing</h2>
            <div style={{display:'grid',gap:8}}>
              {ariaData.top.slice(0,5).map((o,i)=>(
                <div key={i} className="fiducia-card" style={{padding:'13px 17px'}}>
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    <span style={{
                      width:8,height:8,borderRadius:'50%',
                      background:o.severity==='critical'?'#EF4444':
                        o.severity==='high'?'#F59E0B':
                        o.severity==='medium'?'#FBBF24':'#34D399'
                    }}/>
                    <span style={{color:'#eee',fontWeight:500}}>
                      {String(o.type||'').replace(/_/g,' ')}
                    </span>
                    {o.first_name&&(
                      <span style={{color:'rgba(255,255,255,.45)',fontSize:13}}>
                        — {o.first_name}
                      </span>
                    )}
                  </div>
                  {o.evidence?.inference&&(
                    <div style={{
                      marginTop:5,fontSize:13,lineHeight:1.5,
                      color:'rgba(255,255,255,.38)'
                    }}>{o.evidence.inference}</div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* CARE */}
        {priority.length>0&&(
          <section style={{marginBottom:34}}>
            <h2 style={{
              margin:'0 0 11px',fontSize:21,fontWeight:500,color:'#f0f0f0'
            }}>People worth checking on</h2>
            <div style={{display:'grid',gap:8}}>
              {priority.slice(0,5).map((p,i)=>(
                <div key={i} className="fiducia-card" style={{padding:'13px 17px'}}>
                  <span style={{color:'#eee',fontWeight:500}}>{p.first_name}</span>
                  {p.living_truth_status&&(
                    <span style={{
                      marginLeft:8,fontSize:12,color:'rgba(255,255,255,.35)'
                    }}>{p.living_truth_status}</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {priority.length>0&&<CareQueueList/>}

        {/* NEXT ACTION */}
        {recommendations.length>0&&(
          <section style={{margin:'38px 0'}}>
            <h2 style={{
              margin:'0 0 11px',fontSize:21,fontWeight:500,color:'#f0f0f0'
            }}>What should I do?</h2>
            <div className="fiducia-card" style={{padding:'19px 17px'}}>
              <div style={{color:'#eee',fontSize:17,fontWeight:500}}>
                {recommendations[0].recommendation_text}
              </div>
              {recommendations[0].action_type&&(
                <div style={{
                  marginTop:6,fontSize:12,color:'rgba(255,255,255,.35)'
                }}>{recommendations[0].action_type}</div>
              )}
            </div>
          </section>
        )}

        {/* OCCASIONAL TOOLS — ONLY THREE */}
        <section style={{
          marginTop:45,paddingTop:22,
          borderTop:'1px solid rgba(255,255,255,.06)'
        }}>
          <div style={{
            marginBottom:11,fontSize:10,letterSpacing:1.5,
            textTransform:'uppercase',color:'rgba(255,255,255,.3)'
          }}>Tools</div>

          <div style={{display:'flex',gap:9,flexWrap:'wrap'}}>
            <button
              onClick={()=>setScanOpen(true)}
              className="fiducia-button fiducia-button-primary"
            >Scan Register</button>
            <button
              onClick={()=>setTool('attendance')}
              className="fiducia-button fiducia-button-secondary"
            >Attendance</button>
            <button
              onClick={()=>setTool('review')}
              className="fiducia-button fiducia-button-ghost"
            >Review</button>
          </div>
        </section>

        <div style={{
          marginTop:50,textAlign:'center',
          fontSize:12,letterSpacing:.3,color:'rgba(255,255,255,.22)'
        }}>
          Every Person. Every Story. Remembered.
        </div>
      </main>

      <ScanModal
        isOpen={scanOpen}
        onClose={()=>setScanOpen(false)}
      />

      <ToolModal
        type={tool}
        onClose={()=>setTool(null)}
        onContinue={continueTool}
      />
    </Layout>
  );
      }
