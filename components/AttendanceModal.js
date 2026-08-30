// components/AttendanceModal.js
import{useEffect,useState}from'react';
import{supabase}from'../lib/supabaseClient';

export default function AttendanceModal({isOpen,onClose}){
 const[session,setSession]=useState(null),[people,setPeople]=useState([]),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[query,setQuery]=useState(''),[name,setName]=useState('');

 const auth=async()=>{const{data:{session}}=await supabase.auth.getSession();return session};

 const load=async()=>{
  setLoading(true);setError('');
  try{
   const s=await auth();if(!s)return;
   const r=await fetch('/api/attendance/active-session',{headers:{Authorization:`Bearer ${s.access_token}`}});
   const d=await r.json();if(!r.ok)throw Error(d.error||'Could not load active session.');
   if(d.active){setSession(d);await loadPeople(s,d.session_id)}
   else{setSession(null);setPeople([])}
  }catch(e){console.error(e);setError(e.message||'Could not load attendance.')}
  finally{setLoading(false)}
 };

 const loadPeople=async(s,id)=>{
  const r=await fetch(`/api/attendance/people?session_id=${id}`,{headers:{Authorization:`Bearer ${s.access_token}`}});
  const d=await r.json();if(!r.ok)throw Error(d.error||'Could not load people.');setPeople(d);
 };

 useEffect(()=>{if(isOpen)load()},[isOpen]);

 const create=async()=>{
  if(!name.trim()){setError('Please enter the event session name first.');return}
  setSaving(true);setError('');
  try{
   const s=await auth();if(!s)return;
   const r=await fetch('/api/attendance/create-session',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${s.access_token}`},body:JSON.stringify({name:name.trim()})});
   const d=await r.json();if(!r.ok)throw Error(d.error||'Could not create session.');
   setName('');await load();
  }catch(e){setError(e.message||'Could not create session.')}
  finally{setSaving(false)}
 };

 const mark=async id=>{
  if(!session||saving)return;
  setSaving(true);setError('');
  try{
   const s=await auth();if(!s)return;
   const r=await fetch('/api/attendance/mark',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${s.access_token}`},body:JSON.stringify({session_id:session.session_id,people_id:id})});
   const d=await r.json();if(!r.ok)throw Error(d.error||'Could not mark attendance.');
   setPeople(p=>p.map(x=>x.id===id?{...x,marked:true,marked_by_name:d.marked_by_name||'You'}:x));
  }catch(e){console.error(e);setError(e.message||'Could not mark attendance.')}
  finally{setSaving(false)}
 };

 if(!isOpen)return null;
 const visible=people.filter(p=>`${p.first_name||''} ${p.last_name||''} ${p.phone||''}`.toLowerCase().includes(query.toLowerCase()));
 const present=people.filter(p=>p.marked).length;

 return <div className="attendance-overlay">
  <div className="attendance-modal">
   <header>
    <div>
     <div className="eyebrow">ATTENDANCE</div>
     <h2>{session?.name||'Record attendance'}</h2>
     <p>{session?'Tap a person when you see them.':'Create an event session before marking attendance.'}</p>
    </div>
    <button className="close" onClick={onClose}>×</button>
   </header>

   {error&&<div className="error">{error}<button onClick={load}>Try again</button></div>}

   {!session&&!loading&&<div className="start">
    <input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&create()} placeholder="Enter event session name..." autoFocus/>
    <button onClick={create} disabled={saving}>{saving?'Creating...':'Start session'}</button>
   </div>}

   {session&&<>
    <div className="stats"><b>{present}</b> present <span>•</span> <b>{people.length}</b> people</div>
    <input className="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search people..."/>
    <div className="people">
     {loading?<div className="empty">Loading people...</div>:visible.length===0?<div className="empty">No people found.</div>:visible.map(p=><div className={`person ${p.marked?'marked':''}`} key={p.id}>
      <div><strong>{p.first_name} {p.last_name||''}</strong><small>{p.phone||'No phone'}{p.marked&&p.marked_by_name?` · Marked by ${p.marked_by_name}`:''}</small></div>
      <button disabled={p.marked||saving} onClick={()=>mark(p.id)}>{p.marked?'Present ✓':'Mark Present'}</button>
     </div>)}
    </div>
   </>}
  </div>

  <style jsx>{`
   .attendance-overlay{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.72);backdrop-filter:blur(18px);display:flex;align-items:center;justify-content:center;padding:18px;overflow:auto}
   .attendance-modal{width:96vw;height:96vh;max-width:1100px;background:#10172b;border:1px solid rgba(255,255,255,.12);border-radius:30px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 30px 100px rgba(0,0,0,.6);color:#f5f5f5}
   header{display:flex;justify-content:space-between;align-items:flex-start;padding:26px 28px 20px;border-bottom:1px solid rgba(255,255,255,.07)}
   .eyebrow{font-size:12px;letter-spacing:2px;color:rgba(255,255,255,.4);margin-bottom:8px}.attendance-modal h2{margin:0;font-size:clamp(28px,5vw,46px);letter-spacing:-.03em}.attendance-modal p{margin:7px 0 0;color:rgba(255,255,255,.55);font-size:17px}
   .close{border:0;background:rgba(255,255,255,.08);color:#fff;width:46px;height:46px;border-radius:50%;font-size:32px;cursor:pointer}
   .stats{padding:16px 28px;color:rgba(255,255,255,.55);font-size:16px}.stats b{color:#fff;font-size:22px}.stats span{margin:0 9px}
   .search,.start input{margin:0 28px 16px;width:calc(100% - 56px);box-sizing:border-box;padding:15px 18px;border-radius:16px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.045);color:#fff;font-size:17px;outline:none}.search:focus,.start input:focus{border-color:rgba(212,175,55,.45)}
   .people{overflow:auto;padding:0 28px 28px;display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:10px;align-content:start}
   .person{min-height:68px;padding:12px 14px;border:1px solid rgba(255,255,255,.08);border-radius:16px;background:rgba(255,255,255,.035);display:flex;align-items:center;justify-content:space-between;gap:10px}.person.marked{background:rgba(76,175,80,.1);border-color:rgba(76,175,80,.35)}
   .person strong{display:block;font-size:17px}.person small{display:block;margin-top:4px;color:rgba(255,255,255,.42);font-size:13px}
   .person button,.start button{border:0;border-radius:999px;padding:11px 15px;background:rgba(255,255,255,.1);color:#fff;font-size:14px;font-weight:600;white-space:nowrap;cursor:pointer}.person button:disabled{opacity:.65;cursor:default}
   .start{padding:22px 28px}.start input{margin:0 0 12px;width:100%}.start button{background:#d4af37;color:#101010;padding:13px 20px;font-size:15px}
   .error{margin:14px 28px 0;padding:12px 14px;border-radius:12px;background:rgba(239,68,68,.1);color:#ff8585;display:flex;justify-content:space-between;gap:12px}.error button{border:0;background:none;color:#fff;text-decoration:underline;cursor:pointer}
   .empty{padding:35px;text-align:center;color:rgba(255,255,255,.4);grid-column:1/-1}
   @media(max-width:600px){.attendance-overlay{padding:8px}.attendance-modal{width:100%;height:96vh;border-radius:24px}header{padding:20px}.stats{padding:13px 20px}.search{margin-left:20px;margin-right:20px;width:calc(100% - 40px)}.people{padding:0 20px 20px;grid-template-columns:1fr;gap:8px}.person{min-height:60px}.attendance-modal h2{font-size:30px}.attendance-modal p{font-size:15px}}
  `}</style>
 </div>
    }
