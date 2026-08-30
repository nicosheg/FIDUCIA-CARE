// components/AttendanceModal.js
import{useEffect,useState,useCallback}from'react';
import{supabase}from'../lib/supabaseClient';

export default function AttendanceModal({isOpen,onClose}){
 const[session,setSession]=useState(null),[people,setPeople]=useState([]),[search,setSearch]=useState(''),[name,setName]=useState(''),[loading,setLoading]=useState(true),[starting,setStarting]=useState(false),[error,setError]=useState('');

 const auth=async()=>{const{data:{session}}=await supabase.auth.getSession();return session};

 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const s=await auth();
   if(!s){setError('Please log in again.');return}
   const r=await fetch('/api/attendance/active-session',{headers:{Authorization:`Bearer ${s.access_token}`}});
   const d=await r.json();
   if(!r.ok)throw Error(d.error||'Could not load active session.');
   if(d.active){setSession(d);await loadPeople(s,d.session_id)}
   else setSession(null);
  }catch(e){console.error(e);setError(e.message)}
  finally{setLoading(false)}
 },[]);

 const loadPeople=async(s,sessionId)=>{
  try{
   const r=await fetch('/api/attendance/search',{headers:{Authorization:`Bearer ${s.access_token}`}});
   const d=await r.json();
   if(!r.ok)throw Error(d.error||'Could not load people.');
   setPeople(d.map(p=>({...p,marked:false})));
  }catch(e){setError(e.message)}
 };

 useEffect(()=>{if(isOpen)load()},[isOpen,load]);

 const start=async()=>{
  if(!name.trim()){setError('Enter an event name first.');return}
  setStarting(true);setError('');
  try{
   const s=await auth();if(!s)throw Error('Please log in again.');
   const r=await fetch('/api/attendance/create-session',{
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${s.access_token}`},
    body:JSON.stringify({name:name.trim()})
   });
   const d=await r.json();
   if(!r.ok)throw Error(d.error||'Could not start attendance.');
   setSession({active:true,session_id:d.id,name:name.trim()});
   await loadPeople(s,d.id);
   setName('');
  }catch(e){setError(e.message)}
  finally{setStarting(false)}
 };

 const mark=async person=>{
  if(!session)return;
  setError('');
  try{
   const s=await auth();if(!s)throw Error('Please log in again.');
   const r=await fetch('/api/attendance/mark',{
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${s.access_token}`},
    body:JSON.stringify({session_id:session.session_id,people_id:person.id,present:true})
   });
   const d=await r.json();
   if(!r.ok)throw Error(d.error||'Could not mark attendance.');
   setPeople(x=>x.map(p=>p.id===person.id?{...p,marked:true}:p));
  }catch(e){console.error(e);setError(e.message)}
 };

 if(!isOpen)return null;

 const visible=people.filter(p=>
  `${p.first_name||''} ${p.last_name||''} ${p.phone||''}`.toLowerCase().includes(search.toLowerCase())
 );
 const count=people.filter(p=>p.marked).length;

 return(
  <div style={S.overlay}>
   <div style={S.modal}>
    <div style={S.head}>
     <div>
      <h2 style={S.title}>{session?session.name:'Attendance'}</h2>
      {session&&<div style={S.sub}>Tap a person when you see them.</div>}
     </div>
     <button onClick={onClose} style={S.close}>×</button>
    </div>

    {error&&<div style={S.error}><span>{error}</span><button onClick={load} style={S.retry}>Try again</button></div>}

    {loading?<div style={S.center}>Loading...</div>:!session?(
     <div style={S.setup}>
      <h3 style={S.setupTitle}>Start an attendance event</h3>
      <p style={S.setupText}>Enter the name of the event before people can be marked.</p>
      <input autoFocus value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&start()} placeholder="Event name e.g. Sunday Service" style={S.input}/>
      <button onClick={start} disabled={starting} style={S.start}>{starting?'Starting...':'Start Attendance'}</button>
     </div>
    ):(
     <>
      <div style={S.stats}><b>{count}</b> present <span>•</span> <b>{people.length}</b> people</div>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search people..." style={S.search}/>
      {people.length===0?<div style={S.center}>No people have been added yet.</div>:(
       <div style={S.list}>
        {visible.map(p=>(
         <div key={p.id} style={{...S.person,...(p.marked?S.present:{})}}>
          <div>
           <div style={S.personName}>{p.first_name} {p.last_name||''}</div>
           <div style={S.phone}>{p.phone||'No phone'}</div>
          </div>
          <button disabled={p.marked} onClick={()=>mark(p)} style={{...S.mark,...(p.marked?S.marked:{})}}>
           {p.marked?'Present ✓':'Mark Present'}
          </button>
         </div>
        ))}
       </div>
      )}
     </>
    )}
   </div>
  </div>
 );
}

const S={
 overlay:{position:'fixed',inset:0,zIndex:1000,background:'rgba(0,0,0,.7)',backdropFilter:'blur(14px)',display:'flex',alignItems:'center',justifyContent:'center',padding:12},
 modal:{width:'96vw',height:'96vh',maxWidth:1100,background:'#0d1324',border:'1px solid rgba(255,255,255,.1)',borderRadius:28,display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 20px 80px rgba(0,0,0,.5)'},
 head:{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'20px 24px',borderBottom:'1px solid rgba(255,255,255,.07)'},
 title:{margin:0,color:'#f5f5f5',fontSize:26},sub:{color:'rgba(255,255,255,.45)',marginTop:3,fontSize:14},
 close:{background:'none',border:0,color:'#aaa',fontSize:32,cursor:'pointer',lineHeight:1},
 stats:{display:'flex',gap:7,alignItems:'center',padding:'12px 24px',color:'rgba(255,255,255,.45)',fontSize:14},
 search:{margin:'0 24px 14px',padding:'12px 15px',borderRadius:12,border:'1px solid rgba(255,255,255,.1)',background:'rgba(255,255,255,.05)',color:'#fff',outline:'none'},
 list:{overflowY:'auto',padding:'0 24px 24px',display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(250px,1fr))',gap:8},
 person:{minHeight:58,padding:'10px 13px',borderRadius:13,border:'1px solid rgba(255,255,255,.07)',background:'rgba(255,255,255,.035)',color:'#eee',display:'flex',alignItems:'center',justifyContent:'space-between',gap:8},
 present:{background:'rgba(76,175,80,.13)',border:'1px solid rgba(76,175,80,.5)'},
 personName:{fontWeight:500},phone:{fontSize:12,color:'rgba(255,255,255,.4)',marginTop:3},
 mark:{border:0,borderRadius:999,padding:'8px 11px',background:'rgba(255,255,255,.07)',color:'#eee',cursor:'pointer',whiteSpace:'nowrap'},
 marked:{color:'#4CAF50',background:'rgba(76,175,80,.12)',cursor:'default'},
 center:{padding:40,textAlign:'center',color:'rgba(255,255,255,.45)'},
 error:{margin:'14px 24px 0',padding:'10px 14px',borderRadius:10,background:'rgba(239,68,68,.1)',color:'#ff7777',display:'flex',justifyContent:'space-between',gap:10},
 retry:{background:'none',border:0,color:'#fff',textDecoration:'underline',cursor:'pointer'},
 setup:{maxWidth:500,width:'calc(100% - 48px)',margin:'auto',padding:30,textAlign:'center'},
 setupTitle:{color:'#f5f5f5',fontSize:24,margin:'0 0 8px'},setupText:{color:'rgba(255,255,255,.5)',lineHeight:1.5},
 input:{width:'100%',boxSizing:'border-box',padding:'14px 16px',margin:'20px 0 12px',borderRadius:12,border:'1px solid rgba(255,255,255,.12)',background:'rgba(255,255,255,.05)',color:'#fff',outline:'none'},
 start:{width:'100%',padding:14,border:0,borderRadius:999,background:'#fff',color:'#0d1324',fontWeight:600,cursor:'pointer'}
};
