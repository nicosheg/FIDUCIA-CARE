// components/AttendanceModal.js
// FIDUCIA CARE — Live Attendance Modal
// Flow: Create Session → Mark/Unmark → Keep session / Leave → Create New Session
// Uses existing attendance APIs; no schema changes.

import{useCallback,useEffect,useState}from'react';
import{createPortal}from'react-dom';
import{supabase}from'../lib/supabaseClient';

export default function AttendanceModal({isOpen,onClose}){
 const[session,setSession]=useState(null),[people,setPeople]=useState([]),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[closing,setClosing]=useState(false),[error,setError]=useState(''),[query,setQuery]=useState(''),[sessionName,setSessionName]=useState('');

 const auth=async()=>{
  const{data:{session}}=await supabase.auth.getSession();
  return session;
 };

 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const s=await auth();
   if(!s){setError('You must be logged in.');return}
   const h={Authorization:`Bearer ${s.access_token}`};
   const sr=await fetch('/api/attendance/active-session',{headers:h});
   const sd=await sr.json();
   if(!sr.ok)throw Error(sd.error||'Could not load attendance session.');

   if(!sd.active){
    setSession(null);setPeople([]);setQuery('');
    return;
   }

   setSession(sd);

   const pr=await fetch(`/api/attendance/people?session_id=${encodeURIComponent(sd.session_id)}`,{headers:h});
   const pd=await pr.json();
   if(!pr.ok)throw Error(pd.error||'Could not load attendance people.');
   setPeople(Array.isArray(pd)?pd:[]);
  }catch(e){
   console.error('[ATTENDANCE]',e);
   setError(e.message||'Could not load attendance.');
  }finally{setLoading(false)}
 },[]);

 useEffect(()=>{if(isOpen)load()},[isOpen,load]);

 // Create a new live attendance session.
 const createSession=async()=>{
  const name=sessionName.trim();
  if(!name){setError('Enter a name for this attendance session.');return}
  setSaving(true);setError('');
  try{
   const s=await auth();
   if(!s){setError('You must be logged in.');return}
   const r=await fetch('/api/attendance/create-session',{
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${s.access_token}`},
    body:JSON.stringify({name})
   });
   const d=await r.json();
   if(!r.ok||!d.success)throw Error(d.error||'Could not start attendance.');
   setSessionName('');
   await load();
  }catch(e){
   console.error('[ATTENDANCE] Create error:',e);
   setError(e.message||'Could not start attendance.');
  }finally{setSaving(false)}
 };

 // Mark/unmark attendance. UI updates immediately; server remains source of truth.
 const mark=async(id,currentlyMarked)=>{
  if(!session||saving)return;
  const previous=people;
  setError('');

  // Optimistic update: never make ushers wait for the request.
  setPeople(p=>p.map(x=>x.id===id?{...x,marked:!currentlyMarked,marked_by_name:!currentlyMarked?'You':null}:x));

  try{
   const s=await auth();
   if(!s)throw Error('You must be logged in.');
   const r=await fetch('/api/attendance/mark',{
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${s.access_token}`},
    body:JSON.stringify({session_id:session.session_id,people_id:id,present:!currentlyMarked})
   });
   const d=await r.json();
   if(!r.ok||!d.success)throw Error(d.error||'Could not update attendance.');
  }catch(e){
   console.error('[ATTENDANCE] Mark error:',e);
   setPeople(previous);
   setError(e.message||'Could not update attendance.');
  }
 };

 // Keep/finalize the current attendance session.
 const keepSession=async()=>{
  if(!session||closing)return;
  setClosing(true);setError('');
  try{
   const s=await auth();
   if(!s)throw Error('You must be logged in.');
   const r=await fetch('/api/attendance/close-session',{
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${s.access_token}`},
    body:JSON.stringify({session_id:session.session_id})
   });
   const d=await r.json();
   if(!r.ok||!d.success)throw Error(d.error||'Could not keep this session.');
   setSession(null);setPeople([]);setQuery('');
  }catch(e){
   console.error('[ATTENDANCE] Close error:',e);
   setError(e.message||'Could not keep this session.');
  }finally{setClosing(false)}
 };

 // Leave simply exits the modal; the live session remains available.
 const leave=()=>onClose();

 useEffect(()=>{
  if(!isOpen)return;
  const esc=e=>e.key==='Escape'&&onClose();
  document.addEventListener('keydown',esc);
  return()=>document.removeEventListener('keydown',esc);
 },[isOpen,onClose]);

 if(!isOpen)return null;

 const visible=people.filter(p=>`${p.first_name||''} ${p.last_name||''} ${p.phone||''}`.toLowerCase().includes(query.toLowerCase().trim()));
 const present=people.filter(p=>p.marked).length;
 const percentage=people.length?Math.round(present/people.length*100):0;

 const content=<div className="attendance-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <div className="attendance-modal" role="dialog" aria-modal="true" aria-label="Live attendance">
   <header>
    <div className="heading">
     <div className="eyebrow">{session?'LIVE ATTENDANCE':'ATTENDANCE'}</div>
     <h2>{session?.name||'New attendance session'}</h2>
     <p>{session?'Tap a person when you see them.':'Create a session to begin taking attendance.'}</p>
    </div>
    <button className="close" onClick={onClose} aria-label="Close attendance">×</button>
   </header>

   {error&&<div className="error"><span>{error}</span><button onClick={load}>Try again</button></div>}

   {loading?<div className="loading"><div className="loader"/><span>Preparing attendance...</span></div>:

    !session?
    <div className="create-session">
     <div className="create-icon">＋</div>
     <strong>Start a new session</strong>
     <span>Give this attendance session a simple name, such as Sunday Service or Youth Meeting.</span>
     <input
      value={sessionName}
      onChange={e=>setSessionName(e.target.value)}
      onKeyDown={e=>{if(e.key==='Enter')createSession()}}
      placeholder="Session name"
      maxLength={120}
      autoFocus
     />
     <button className="create-button" disabled={saving||!sessionName.trim()} onClick={createSession}>
      {saving?'Starting...':'Start attendance'}
     </button>
    </div>:

    <>
     <div className="hero-stats">
      <div className="main-stat"><strong>{present}</strong><span>present</span></div>
      <div className="stat-divider"/>
      <div className="small-stat"><strong>{people.length}</strong><span>people</span></div>
      <div className="small-stat"><strong>{percentage}%</strong><span>marked</span></div>
      <div className="progress-wrap"><div className="progress"><div className="progress-fill" style={{width:`${percentage}%`}}/></div></div>
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
       <div className="empty"><div className="empty-icon">⌕</div><strong>No people found</strong><span>{query?'Try another name or phone number.':'No active people are available yet.'}</span></div>:
       visible.map(p=>
        <div className={`person ${p.marked?'marked':''}`} key={p.id}>
         <div className="person-info">
          <div className={`avatar ${p.marked?'present-avatar':''}`}>{(p.first_name||'?').charAt(0).toUpperCase()}</div>
          <div className="person-copy">
           <strong>{p.first_name} {p.last_name||''}</strong>
           <small>{p.marked?`Present${p.marked_by_name?` · ${p.marked_by_name}`:''}`:(p.phone||'No phone')}</small>
          </div>
         </div>
         <button
          className={`mark-button ${p.marked?'done':''}`}
          disabled={saving}
          onClick={()=>mark(p.id,!!p.marked)}
         >
          {p.marked?<><span>✓</span> Unmark</>:'Mark present'}
         </button>
        </div>
       )
      }
     </div>

     <footer>
      <div className="live"><span className="live-dot"/>Live attendance</div>
      <div className="footer-actions">
       <button className="leave-button" disabled={closing} onClick={leave}>Leave</button>
       <button className="keep-button" disabled={closing} onClick={keepSession}>{closing?'Saving...':'Keep session'}</button>
      </div>
     </footer>
    </>
   }
  </div>

  <style jsx>{`
   .attendance-overlay{position:fixed;inset:0;z-index:2147483000;background:rgba(2,5,12,.68);backdrop-filter:blur(18px) saturate(125%);-webkit-backdrop-filter:blur(18px) saturate(125%);display:flex;align-items:flex-start;justify-content:center;padding:104px 14px 24px;overflow:auto}
   .attendance-modal{position:relative;width:min(960px,96vw);height:min(78vh,760px);min-height:500px;background:linear-gradient(145deg,rgba(43,60,83,.72),rgba(10,18,33,.84) 48%,rgba(18,28,47,.78));border:1px solid rgba(235,244,255,.2);border-radius:30px;overflow:hidden;display:flex;flex-direction:column;color:#f5f7fb;box-shadow:inset 0 1px 0 rgba(255,255,255,.16),inset 0 -30px 55px rgba(0,0,0,.18),0 35px 110px rgba(0,0,0,.7),0 0 0 1px rgba(255,255,255,.035);backdrop-filter:blur(28px) saturate(150%);-webkit-backdrop-filter:blur(28px) saturate(150%)}
   .attendance-modal:before{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 18% 0%,rgba(255,255,255,.13),transparent 35%),radial-gradient(ellipse at 90% 100%,rgba(75,110,170,.08),transparent 38%);z-index:0}
   header,.error,.hero-stats,.toolbar,.people,footer,.loading,.create-session{position:relative;z-index:1}
   header{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding:25px 28px 20px;border-bottom:1px solid rgba(255,255,255,.09);flex-shrink:0}
   .heading{min-width:0}.eyebrow{font-size:10px;font-weight:700;letter-spacing:2.4px;color:rgba(255,255,255,.43);margin-bottom:7px}.attendance-modal h2{margin:0;font-size:clamp(26px,3vw,38px);line-height:1.05;letter-spacing:-.035em;font-weight:750}.attendance-modal header p{margin:7px 0 0;color:rgba(255,255,255,.5);font-size:14px}
   .close{flex-shrink:0;width:42px;height:42px;border-radius:50%;border:1px solid rgba(255,255,255,.13);background:rgba(255,255,255,.08);color:rgba(255,255,255,.85);font-size:27px;line-height:1;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.1);transition:.18s}.close:hover{background:rgba(255,255,255,.14);color:#fff;transform:scale(1.04)}
   .error{margin:12px 26px 0;padding:10px 13px;border-radius:13px;background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);color:#ff9999;display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:13px;flex-shrink:0}.error button{border:0;background:none;color:#fff;text-decoration:underline;cursor:pointer;white-space:nowrap}
   .hero-stats{padding:17px 28px 15px;display:flex;align-items:center;gap:22px;flex-shrink:0}.main-stat{display:flex;align-items:baseline;gap:7px}.main-stat strong{font-size:31px;letter-spacing:-.04em}.main-stat span,.small-stat span{color:rgba(255,255,255,.46);font-size:12px}.stat-divider{width:1px;height:29px;background:rgba(255,255,255,.11)}.small-stat{display:flex;align-items:baseline;gap:5px}.small-stat strong{font-size:19px}.progress-wrap{flex:1;min-width:70px}.progress{width:100%;height:5px;background:rgba(255,255,255,.08);border-radius:99px;overflow:hidden}.progress-fill{height:100%;background:#d4af37;border-radius:99px;transition:width .35s}
   .toolbar{padding:0 28px 13px;flex-shrink:0}.search-wrap{position:relative}.search{width:100%;box-sizing:border-box;padding:13px 42px;border-radius:15px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.065);color:#fff;font-size:14px;outline:none;box-shadow:inset 0 1px 0 rgba(255,255,255,.06);transition:.18s}.search::placeholder{color:rgba(255,255,255,.34)}.search:focus{border-color:rgba(212,175,55,.4);background:rgba(255,255,255,.08)}.search-icon{position:absolute;left:16px;top:50%;transform:translateY(-51%);color:rgba(255,255,255,.4);font-size:20px;z-index:1;pointer-events:none}.clear-search{position:absolute;right:9px;top:50%;transform:translateY(-50%);width:28px;height:28px;border:0;border-radius:50%;background:rgba(255,255,255,.09);color:rgba(255,255,255,.7);cursor:pointer;font-size:18px}
   .people{flex:1;min-height:0;overflow:auto;padding:0 28px 15px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-content:start;gap:8px}.people::-webkit-scrollbar{width:5px}.people::-webkit-scrollbar-thumb{background:rgba(255,255,255,.14);border-radius:99px}.person{min-height:64px;box-sizing:border-box;padding:9px 10px;border:1px solid rgba(255,255,255,.08);border-radius:16px;background:rgba(255,255,255,.045);display:flex;align-items:center;justify-content:space-between;gap:9px;transition:.2s}.person:hover{background:rgba(255,255,255,.065);border-color:rgba(255,255,255,.13)}.person.marked{background:rgba(76,175,80,.09);border-color:rgba(76,175,80,.27)}.person-info{min-width:0;display:flex;align-items:center;gap:10px}.avatar{width:38px;height:38px;flex:0 0 38px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.09);color:rgba(255,255,255,.75);font-size:14px;font-weight:750}.present-avatar{background:rgba(76,175,80,.19);color:#b7e8b9}.person-copy{min-width:0}.person strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;font-weight:650}.person small{display:block;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:rgba(255,255,255,.38);font-size:11px}.person.marked small{color:rgba(160,220,165,.65)}
   .mark-button{flex-shrink:0;border:1px solid rgba(255,255,255,.1);border-radius:999px;padding:8px 11px;background:rgba(255,255,255,.08);color:rgba(255,255,255,.87);font-size:11px;font-weight:650;cursor:pointer;white-space:nowrap;transition:.18s}.mark-button:hover:not(:disabled){background:rgba(212,175,55,.16);border-color:rgba(212,175,55,.32);color:#f4d77a;transform:translateY(-1px)}.mark-button:disabled{cursor:default}.mark-button.done{background:rgba(76,175,80,.14);border-color:rgba(76,175,80,.22);color:#a9dcae}
   footer{flex-shrink:0;min-height:58px;box-sizing:border-box;padding:9px 28px;border-top:1px solid rgba(255,255,255,.075);display:flex;align-items:center;justify-content:space-between;color:rgba(255,255,255,.38);font-size:11px}.live{display:flex;align-items:center;gap:7px}.live-dot{width:7px;height:7px;border-radius:50%;background:#6bd174;box-shadow:0 0 0 4px rgba(107,209,116,.08)}.footer-count{color:rgba(255,255,255,.3)}.footer-actions{display:flex;gap:8px}.leave-button,.keep-button{border-radius:999px;padding:9px 17px;font-size:11px;font-weight:700;cursor:pointer;transition:.18s}.leave-button{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:rgba(255,255,255,.72)}.keep-button{border:1px solid rgba(212,175,55,.35);background:rgba(212,175,55,.14);color:#f4d77a}.leave-button:hover:not(:disabled){background:rgba(255,255,255,.1)}.keep-button:hover:not(:disabled){background:rgba(212,175,55,.22)}.leave-button:disabled,.keep-button:disabled{opacity:.5;cursor:default}
   .loading,.empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;color:rgba(255,255,255,.38);font-size:12px}.empty{grid-column:1/-1;min-height:220px}.empty strong{color:rgba(255,255,255,.62);font-size:14px}.empty span{max-width:300px;text-align:center;line-height:1.5}.empty-icon,.create-icon{width:43px;height:43px;border-radius:14px;background:rgba(255,255,255,.055);display:flex;align-items:center;justify-content:center;font-size:21px;color:rgba(255,255,255,.35)}.loader{width:22px;height:22px;border:2px solid rgba(255,255,255,.1);border-top-color:rgba(212,175,55,.85);border-radius:50%;animation:spin .75s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
   .create-session{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:30px}.create-session strong{font-size:20px}.create-session>span{max-width:390px;text-align:center;color:rgba(255,255,255,.42);font-size:13px;line-height:1.5}.create-session input{width:min(390px,90%);box-sizing:border-box;margin-top:8px;padding:14px 16px;border-radius:15px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.065);color:#fff;outline:none;font-size:14px}.create-session input:focus{border-color:rgba(212,175,55,.45)}.create-session input::placeholder{color:rgba(255,255,255,.32)}.create-button{width:min(390px,90%);padding:13px 18px;border:1px solid rgba(212,175,55,.35);border-radius:15px;background:rgba(212,175,55,.14);color:#f4d77a;font-weight:700;cursor:pointer}.create-button:disabled{opacity:.4;cursor:default}
   @media(max-width:720px){.attendance-overlay{padding:92px 9px 15px}.attendance-modal{width:97vw;height:78vh;min-height:500px;border-radius:24px}header{padding:19px}.hero-stats{padding:14px 19px 12px;gap:14px}.toolbar{padding:0 19px 11px}.people{padding:0 19px 12px;grid-template-columns:1fr;gap:7px}footer{padding:9px 19px}.footer-actions{gap:6px}.leave-button,.keep-button{padding:8px 13px}}
   @media(max-width:480px){.attendance-overlay{padding:82px 6px 8px}.attendance-modal{width:98vw;height:82vh;min-height:480px;border-radius:22px}.attendance-modal header{padding:17px}.attendance-modal header p{font-size:12px}.hero-stats{padding:12px 17px 10px;gap:11px}.main-stat strong{font-size:27px}.small-stat strong{font-size:17px}.progress-wrap{min-width:50px}.toolbar{padding:0 17px 10px}.people{padding-left:17px;padding-right:17px}.person{min-height:60px;padding:8px}.avatar{width:35px;height:35px;flex-basis:35px}.mark-button{padding:7px 9px;font-size:10px}footer{padding-left:17px;padding-right:17px}.create-session{padding:20px}.create-session input,.create-button{width:100%}}
  `}</style>
 </div>;

 return typeof document!=='undefined'?createPortal(content,document.body):null;
 }
