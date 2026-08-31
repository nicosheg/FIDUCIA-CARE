// components/AttendanceModal.js
// FIDUCIA CARE — Unified Attendance Experience
// Flow: Attendance → Setup → Start Session → Live Attendance.
// No automatic session creation. No detached /section redirect.

import{useCallback,useEffect,useState}from'react';
import{createPortal}from'react-dom';
import{supabase}from'../lib/supabaseClient';

export default function AttendanceModal({isOpen,onClose}){
 const[mode,setMode]=useState('loading');
 const[session,setSession]=useState(null);
 const[people,setPeople]=useState([]);
 const[loading,setLoading]=useState(true);
 const[saving,setSaving]=useState(false);
 const[error,setError]=useState('');
 const[query,setQuery]=useState('');
 const[sessionName,setSessionName]=useState('Sunday Service');
 const[sections,setSections]=useState(['All']);
 const[newSection,setNewSection]=useState('');

 const auth=async()=>{
  const{data:{session}}=await supabase.auth.getSession();
  return session;
 };

 const load=useCallback(async()=>{
  setLoading(true);
  setError('');
  try{
   const s=await auth();
   if(!s){setError('You must be logged in.');return}
   const h={Authorization:`Bearer ${s.access_token}`};
   const sr=await fetch('/api/attendance/active-session',{headers:h});
   const sd=await sr.json();
   if(!sr.ok)throw Error(sd.error||'Could not load attendance.');

   if(!sd.active){
    setSession(null);
    setPeople([]);
    setMode('setup');
    return;
   }

   setSession(sd);
   const pr=await fetch(`/api/attendance/people?session_id=${encodeURIComponent(sd.session_id)}`,{headers:h});
   const pd=await pr.json();
   if(!pr.ok)throw Error(pd.error||'Could not load attendance people.');
   setPeople(Array.isArray(pd)?pd:[]);
   setMode('live');
  }catch(e){
   console.error('[ATTENDANCE]',e);
   setError(e.message||'Could not load attendance.');
  }finally{
   setLoading(false);
  }
 },[]);

 useEffect(()=>{
  if(isOpen)load();
 },[isOpen,load]);

 const addSection=()=>{
  const value=newSection.trim();
  if(value&&!sections.includes(value)){
   setSections(p=>[...p,value]);
   setNewSection('');
  }
 };

 const removeSection=value=>{
  if(value==='All')return;
  setSections(p=>p.filter(x=>x!==value));
 };

 const startSession=async()=>{
  const name=sessionName.trim();
  if(!name){
   setError('Enter an event name.');
   return;
  }

  setSaving(true);
  setError('');

  try{
   const s=await auth();
   if(!s){setError('You must be logged in.');return}

   const res=await fetch('/api/attendance/create-session',{
    method:'POST',
    headers:{
     'Content-Type':'application/json',
     Authorization:`Bearer ${s.access_token}`
    },
    body:JSON.stringify({name,sections})
   });

   const data=await res.json();

   if(!res.ok)throw Error(data.error||'Could not start attendance.');

   const created=data.session||data;
   if(!created.id)throw Error('Session was created but no session ID was returned.');

   setSession({
    active:true,
    session_id:created.id,
    name:created.name,
    status:created.status,
    started_by:created.started_by,
    started_at:created.started_at,
    joined:true
   });

   const h={Authorization:`Bearer ${s.access_token}`};
   const pr=await fetch(`/api/attendance/people?session_id=${encodeURIComponent(created.id)}`,{headers:h});
   const pd=await pr.json();

   if(!pr.ok)throw Error(pd.error||'Session started, but people could not be loaded.');

   setPeople(Array.isArray(pd)?pd:[]);
   setMode('live');
  }catch(e){
   console.error('[ATTENDANCE] Start session error:',e);
   setError(e.message||'Could not start attendance.');
  }finally{
   setSaving(false);
  }
 };

 const mark=async id=>{
  if(!session||saving)return;
  setSaving(true);
  setError('');

  try{
   const s=await auth();
   if(!s){setError('You must be logged in.');return}

   const r=await fetch('/api/attendance/mark',{
    method:'POST',
    headers:{
     'Content-Type':'application/json',
     Authorization:`Bearer ${s.access_token}`
    },
    body:JSON.stringify({
     session_id:session.session_id,
     people_id:id
    })
   });

   const d=await r.json();

   if(!r.ok||!d.success)throw Error(d.error||'Could not mark attendance.');

   setPeople(p=>p.map(x=>x.id===id?{
    ...x,
    marked:true,
    marked_by_name:d.marked_by_name||'You'
   }:x));
  }catch(e){
   console.error('[ATTENDANCE] Mark error:',e);
   setError(e.message||'Could not mark attendance.');
  }finally{
   setSaving(false);
  }
 };

 useEffect(()=>{
  if(!isOpen)return;
  const esc=e=>e.key==='Escape'&&onClose();
  document.addEventListener('keydown',esc);
  return()=>document.removeEventListener('keydown',esc);
 },[isOpen,onClose]);

 if(!isOpen)return null;

 const visible=people.filter(p=>
  `${p.first_name||''} ${p.last_name||''} ${p.phone||''}`
   .toLowerCase()
   .includes(query.toLowerCase().trim())
 );

 const present=people.filter(p=>p.marked).length;
 const percentage=people.length?Math.round(present/people.length*100):0;

 const content=<div className="attendance-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <div className={`attendance-modal ${mode==='setup'?'setup-mode':''}`} role="dialog" aria-modal="true" aria-label="Attendance">

   <header>
    <div className="heading">
     <div className="eyebrow">{mode==='setup'?'ATTENDANCE':'LIVE ATTENDANCE'}</div>
     <h2>
      {mode==='setup'?'Start an attendance session':session?.name||'Attendance'}
     </h2>
     <p>
      {mode==='setup'
       ?'Set up today’s gathering, then start recording who is here.'
       : 'Tap a person when you see them.'}
     </p>
    </div>
    <button className="close" onClick={onClose} aria-label="Close attendance">×</button>
   </header>

   {error&&
    <div className="error">
     <span>{error}</span>
     <button onClick={load}>Try again</button>
    </div>
   }

   {loading||mode==='loading'?
    <div className="loading">
     <div className="loader"/>
     <span>Preparing attendance...</span>
    </div>
   :
    mode==='setup'?
     <div className="setup">
      <div className="setup-intro">
       <div className="setup-icon">✓</div>
       <div>
        <div className="setup-kicker">NEW SESSION</div>
        <h3>Let’s get attendance ready.</h3>
        <p>Give this gathering a name and choose how you want to organize the people you’ll be checking in.</p>
       </div>
      </div>

      <div className="field">
       <label>Event or session name</label>
       <input
        value={sessionName}
        onChange={e=>setSessionName(e.target.value)}
        placeholder="Sunday Service"
        autoFocus
       />
      </div>

      <div className="field">
       <div className="field-heading">
        <label>Sections</label>
        <span>{sections.length} selected</span>
       </div>

       <div className="section-list">
        {sections.map(section=>
         <div className="section-chip" key={section}>
          <span>{section}</span>
          {section!=='All'&&
           <button onClick={()=>removeSection(section)} aria-label={`Remove ${section}`}>×</button>}
         </div>
        )}
       </div>

       <div className="add-section">
        <input
         value={newSection}
         onChange={e=>setNewSection(e.target.value)}
         onKeyDown={e=>e.key==='Enter'&&(e.preventDefault(),addSection())}
         placeholder="Add a section"
        />
        <button onClick={addSection}>Add</button>
       </div>

       <p className="field-help">
        Everyone is available through <strong>All</strong> by default. Add sections only when your organization needs them.
       </p>
      </div>

      <button
       className="start-button"
       disabled={saving}
       onClick={startSession}
      >
       {saving?'Starting…':'Start Session →'}
      </button>

      <div className="setup-note">
       Starting the session will open the live attendance screen immediately.
      </div>
     </div>
    :
     <>
      <div className="hero-stats">
       <div className="main-stat"><strong>{present}</strong><span>present</span></div>
       <div className="stat-divider"/>
       <div className="small-stat"><strong>{people.length}</strong><span>people</span></div>
       <div className="small-stat"><strong>{percentage}%</strong><span>marked</span></div>
       <div className="progress-wrap">
        <div className="progress">
         <div className="progress-fill" style={{width:`${percentage}%`}}/>
        </div>
       </div>
      </div>

      <div className="toolbar">
       <div className="search-wrap">
        <span className="search-icon">⌕</span>
        <input className="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search people..."/>
        {query&&<button className="clear-search" onClick={()=>setQuery('')} aria-label="Clear search">×</button>}
       </div>
      </div>

      <div className="people">
       {visible.length===0?
        <div className="empty">
         <div className="empty-icon">⌕</div>
         <strong>No people found</strong>
         <span>{query?'Try another name or phone number.':'No active people are available yet.'}</span>
        </div>
       :
        visible.map(p=>
         <div className={`person ${p.marked?'marked':''}`} key={p.id}>
          <div className="person-info">
           <div className={`avatar ${p.marked?'present-avatar':''}`}>
            {(p.first_name||'?').charAt(0).toUpperCase()}
           </div>
           <div className="person-copy">
            <strong>{p.first_name} {p.last_name||''}</strong>
            <small>{p.marked?`Present${p.marked_by_name?` · ${p.marked_by_name}`:''}`:(p.phone||'No phone')}</small>
           </div>
          </div>
          <button
           className={`mark-button ${p.marked?'done':''}`}
           disabled={p.marked||saving}
           onClick={()=>mark(p.id)}
          >
           {p.marked?<><span>✓</span> Present</>:'Mark present'}
          </button>
         </div>
        )
       }
      </div>

      <footer>
       <div className="live"><span className="live-dot"/>Live attendance</div>
       <div className="footer-count">{present} of {people.length} marked</div>
      </footer>
     </>
   }
  </div>

  <style jsx>{`
   .attendance-overlay{position:fixed;inset:0;z-index:2147483000;background:rgba(2,5,12,.72);backdrop-filter:blur(20px) saturate(125%);-webkit-backdrop-filter:blur(20px) saturate(125%);display:flex;align-items:center;justify-content:center;padding:24px 14px;overflow:auto}
   .attendance-modal{position:relative;width:min(960px,96vw);height:min(78vh,760px);min-height:500px;background:linear-gradient(145deg,rgba(43,60,83,.72),rgba(10,18,33,.9) 48%,rgba(18,28,47,.82));border:1px solid rgba(235,244,255,.2);border-radius:30px;overflow:hidden;display:flex;flex-direction:column;color:#f5f7fb;box-shadow:inset 0 1px 0 rgba(255,255,255,.16),inset 0 -30px 55px rgba(0,0,0,.18),0 35px 110px rgba(0,0,0,.7),0 0 0 1px rgba(255,255,255,.035);backdrop-filter:blur(28px) saturate(150%);-webkit-backdrop-filter:blur(28px) saturate(150%)}
   .attendance-modal.setup-mode{height:auto;min-height:0;max-height:calc(100vh - 48px)}
   header,.error,.hero-stats,.toolbar,.people,footer,.loading,.setup{position:relative;z-index:1}
   header{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding:25px 28px 20px;border-bottom:1px solid rgba(255,255,255,.09);flex-shrink:0}
   .heading{min-width:0}.eyebrow{font-size:10px;font-weight:700;letter-spacing:2.4px;color:rgba(255,255,255,.43);margin-bottom:7px}.attendance-modal h2{margin:0;font-size:clamp(26px,3vw,38px);line-height:1.05;letter-spacing:-.035em;font-weight:750}.attendance-modal header p{margin:7px 0 0;color:rgba(255,255,255,.5);font-size:14px}
   .close{flex-shrink:0;width:42px;height:42px;border-radius:50%;border:1px solid rgba(255,255,255,.13);background:rgba(255,255,255,.08);color:rgba(255,255,255,.85);font-size:27px;line-height:1;cursor:pointer}
   .error{margin:12px 26px 0;padding:10px 13px;border-radius:13px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);color:#ff9999;display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:13px;flex-shrink:0}.error button{border:0;background:none;color:#fff;text-decoration:underline;cursor:pointer;white-space:nowrap}
   .loading,.empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;color:rgba(255,255,255,.38);font-size:12px}.loader{width:22px;height:22px;border:2px solid rgba(255,255,255,.1);border-top-color:rgba(212,175,55,.85);border-radius:50%;animation:spin .75s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
   .setup{padding:30px;overflow:auto}.setup-intro{display:flex;gap:17px;align-items:flex-start;margin-bottom:30px}.setup-icon{width:50px;height:50px;flex:0 0 50px;border-radius:17px;background:rgba(212,175,55,.12);border:1px solid rgba(212,175,55,.2);display:flex;align-items:center;justify-content:center;color:#e5c866;font-size:23px}.setup-kicker{font-size:10px;letter-spacing:2px;color:rgba(255,255,255,.38);font-weight:700;margin-bottom:6px}.setup h3{margin:0 0 7px;font-size:25px;letter-spacing:-.025em}.setup-intro p{margin:0;color:rgba(255,255,255,.5);line-height:1.6;font-size:14px;max-width:650px}.field{margin-bottom:25px}.field label{display:block;font-size:12px;letter-spacing:1.1px;text-transform:uppercase;color:rgba(255,255,255,.5);font-weight:650;margin-bottom:9px}.field input{width:100%;box-sizing:border-box;padding:14px 16px;border-radius:15px;border:1px solid rgba(255,255,255,.11);background:rgba(255,255,255,.06);color:#fff;font-size:15px;outline:none}.field input:focus{border-color:rgba(212,175,55,.45);background:rgba(255,255,255,.08)}.field-heading{display:flex;justify-content:space-between;align-items:center}.field-heading span{font-size:11px;color:rgba(255,255,255,.3)}.section-list{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}.section-chip{display:flex;align-items:center;gap:7px;padding:9px 12px;border-radius:999px;background:rgba(212,175,55,.12);border:1px solid rgba(212,175,55,.22);color:#e9d17b;font-size:13px}.section-chip button{border:0;background:none;color:rgba(255,255,255,.55);font-size:16px;cursor:pointer;padding:0}.add-section{display:flex;gap:8px}.add-section input{flex:1}.add-section button{border:1px solid rgba(255,255,255,.1);border-radius:13px;background:rgba(255,255,255,.08);color:#fff;padding:0 17px;cursor:pointer}.field-help{margin:9px 0 0;color:rgba(255,255,255,.3);font-size:11px;line-height:1.5}.field-help strong{color:rgba(255,255,255,.55)}.start-button{width:100%;padding:15px 20px;border:0;border-radius:16px;background:linear-gradient(135deg,#d4af37,#b99427);color:#101010;font-size:15px;font-weight:750;cursor:pointer;box-shadow:0 12px 35px rgba(212,175,55,.16)}.start-button:disabled{opacity:.55;cursor:wait}.setup-note{text-align:center;margin-top:12px;color:rgba(255,255,255,.27);font-size:11px}
   .hero-stats{padding:17px 28px 15px;display:flex;align-items:center;gap:22px;flex-shrink:0}.main-stat{display:flex;align-items:baseline;gap:7px}.main-stat strong{font-size:31px;letter-spacing:-.04em}.main-stat span,.small-stat span{color:rgba(255,255,255,.46);font-size:12px}.stat-divider{width:1px;height:29px;background:rgba(255,255,255,.11)}.small-stat{display:flex;align-items:baseline;gap:5px}.small-stat strong{font-size:19px}.progress-wrap{flex:1;min-width:70px}.progress{width:100%;height:5px;background:rgba(255,255,255,.08);border-radius:99px;overflow:hidden}.progress-fill{height:100%;background:#d4af37;border-radius:99px;transition:width .35s}
   .toolbar{padding:0 28px 13px;flex-shrink:0}.search-wrap{position:relative}.search{width:100%;box-sizing:border-box;padding:13px 42px;border-radius:15px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.065);color:#fff;font-size:14px;outline:none}.search::placeholder{color:rgba(255,255,255,.34)}.search-icon{position:absolute;left:16px;top:50%;transform:translateY(-51%);color:rgba(255,255,255,.4);font-size:20px;z-index:1}.clear-search{position:absolute;right:9px;top:50%;transform:translateY(-50%);width:28px;height:28px;border:0;border-radius:50%;background:rgba(255,255,255,.09);color:rgba(255,255,255,.7);cursor:pointer;font-size:18px}
   .people{flex:1;min-height:0;overflow:auto;padding:0 28px 15px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-content:start;gap:8px}.people::-webkit-scrollbar{width:5px}.people::-webkit-scrollbar-thumb{background:rgba(255,255,255,.14);border-radius:99px}.person{min-height:64px;box-sizing:border-box;padding:9px 10px;border:1px solid rgba(255,255,255,.08);border-radius:16px;background:rgba(255,255,255,.045);display:flex;align-items:center;justify-content:space-between;gap:9px}.person.marked{background:rgba(76,175,80,.09);border-color:rgba(76,175,80,.27)}.person-info{min-width:0;display:flex;align-items:center;gap:10px}.avatar{width:38px;height:38px;flex:0 0 38px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.09);color:rgba(255,255,255,.75);font-size:14px;font-weight:750}.present-avatar{background:rgba(76,175,80,.19);color:#b7e8b9}.person-copy{min-width:0}.person strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:650}.person small{display:block;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:rgba(255,255,255,.38);font-size:11px}.mark-button{flex-shrink:0;border:1px solid rgba(255,255,255,.1);border-radius:999px;padding:8px 11px;background:rgba(255,255,255,.08);color:rgba(255,255,255,.87);font-size:11px;font-weight:650;cursor:pointer;white-space:nowrap}.mark-button.done{background:rgba(76,175,80,.14);border-color:rgba(76,175,80,.22);color:#a9dcae}
   footer{flex-shrink:0;min-height:44px;box-sizing:border-box;padding:10px 28px;border-top:1px solid rgba(255,255,255,.075);display:flex;align-items:center;justify-content:space-between;color:rgba(255,255,255,.38);font-size:11px}.live{display:flex;align-items:center;gap:7px}.live-dot{width:7px;height:7px;border-radius:50%;background:#6bd174;box-shadow:0 0 0 4px rgba(107,209,116,.08)}.footer-count{color:rgba(255,255,255,.3)}
   @media(max-width:720px){.attendance-overlay{padding:12px 8px}.attendance-modal{width:97vw;height:88vh;min-height:480px;border-radius:24px}.attendance-modal.setup-mode{height:auto;max-height:94vh}.setup{padding:23px 19px}header{padding:19px}.hero-stats{padding:14px 19px 12px;gap:14px}.toolbar{padding:0 19px 11px}.people{padding:0 19px 12px;grid-template-columns:1fr;gap:7px}footer{padding:9px 19px}}
  `}</style>
 </div>;

 return typeof document!=='undefined'?createPortal(content,document.body):null;
  }
