// components/AttendanceModal.js
import{useState,useEffect,useCallback}from'react';
import{createPortal}from'react-dom';
import{supabase}from'../lib/supabaseClient';

export default function AttendanceModal({isOpen,onClose}){
 const[session,setSession]=useState(null),[people,setPeople]=useState([]),[search,setSearch]=useState(''),[marked,setMarked]=useState(new Set()),[loading,setLoading]=useState(true),[saving,setSaving]=useState(null),[error,setError]=useState('');

 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const{data:{session:auth}}=await supabase.auth.getSession();
   if(!auth)throw new Error('Please log in again.');
   const h={Authorization:`Bearer ${auth.access_token}`};
   const r=await fetch('/api/attendance/active-session',{headers:h}),d=await r.json();
   if(!r.ok||!d.active)throw new Error('Could not load active session.');
   setSession(d);
   const p=await fetch('/api/attendance/search',{headers:h}),pd=await p.json();
   if(!p.ok)throw new Error(pd.error||'Could not load people.');
   setPeople(Array.isArray(pd)?pd:[]);
  }catch(e){console.error('[AttendanceModal]',e);setError(e.message)}
  finally{setLoading(false)}
 },[]);

 useEffect(()=>{if(isOpen)load()},[isOpen,load]);

 const toggle=async id=>{
  if(!session||saving)return;
  const next=!marked.has(id);setSaving(id);setError('');
  try{
   const{data:{session:auth}}=await supabase.auth.getSession();
   if(!auth)throw new Error('Please log in again.');
   const r=await fetch('/api/attendance/mark',{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${auth.access_token}`},
    body:JSON.stringify({session_id:session.session_id,people_id:id,present:next})
   });
   const d=await r.json();
   if(!r.ok)throw new Error(d.error||'Could not mark attendance.');
   setMarked(s=>{const n=new Set(s);next?n.add(id):n.delete(id);return n});
  }catch(e){setError(e.message)}
  finally{setSaving(null)}
 };

 if(!isOpen)return null;
 const visible=people.filter(p=>`${p.first_name||''} ${p.last_name||''}`.toLowerCase().includes(search.toLowerCase()));
 const content=(
  <div style={S.overlay}>
   <div style={S.modal}>
    <div style={S.head}>
     <div><h2 style={S.title}>Attendance</h2><div style={S.sub}>{session?.name||'Loading...'}</div></div>
     <button onClick={onClose} style={S.close}>×</button>
    </div>

    {error&&<div style={S.error}>{error}<button onClick={load} style={S.retry}>Try again</button></div>}

    {loading?<div style={S.center}>Loading people...</div>:!session?<div style={S.center}>No active attendance session.</div>:(
     <>
      <div style={S.stats}><b>{marked.size}</b><span>present</span><span>•</span><b>{people.length}</b><span>people</span></div>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search people..." style={S.search}/>
      <div style={S.list}>
       {visible.length?visible.map(p=>{
        const is=marked.has(p.id);
        return <button key={p.id} onClick={()=>toggle(p.id)} disabled={saving===p.id} style={{...S.person,...(is?S.present:{})}}>
         <span><strong>{p.first_name} {p.last_name||''}</strong>{p.phone&&<small>{p.phone}</small>}</span>
         <span style={S.check}>{is?'✓':'○'}</span>
        </button>
       }):<div style={S.center}>{people.length?'No matching people.':'No people have been added yet.'}</div>}
      </div>
     </>
    )}
   </div>
  </div>
 );

 return typeof document!=='undefined'?createPortal(content,document.body):null;
}

const S={
 overlay:{position:'fixed',inset:0,zIndex:2000,background:'rgba(0,0,0,.72)',backdropFilter:'blur(12px)',padding:'2vh 2vw',display:'flex',alignItems:'center',justifyContent:'center'},
 modal:{width:'96vw',height:'96vh',maxWidth:1100,background:'#0d1324',border:'1px solid rgba(255,255,255,.1)',borderRadius:28,display:'flex',flexDirection:'column',overflow:'hidden',boxShadow:'0 20px 80px rgba(0,0,0,.5)'},
 head:{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'20px 24px',borderBottom:'1px solid rgba(255,255,255,.07)'},
 title:{margin:0,color:'#f5f5f5',fontSize:26},sub:{color:'rgba(255,255,255,.45)',marginTop:3,fontSize:14},close:{background:'none',border:0,color:'#aaa',fontSize:32,cursor:'pointer',lineHeight:1},
 stats:{display:'flex',gap:7,alignItems:'center;padding:'12px 24px;color:'rgba(255,255,255,.45)',fontSize:14},search:{margin:'0 24px 14px',padding:'12px 15px',borderRadius:12,border:'1px solid rgba(255,255,255,.1)',background:'rgba(255,255,255,.05)',color:'#fff',outline:'none'},
 list:{overflowY:'auto',padding:'0 24px 24px',display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(250px,1fr))',gap:8},person:{minHeight:58,padding:'10px 13px',borderRadius:13,border:'1px solid rgba(255,255,255,.07)',background:'rgba(255,255,255,.035)',color:'#eee',display:'flex',alignItems:'center',justifyContent:'space-between',textAlign:'left',cursor:'pointer'},present:{background:'rgba(76,175,80,.13)',border:'1px solid rgba(76,175,80,.5)'},check:{fontSize:22,color:'#4CAF50',marginLeft:8},center:{padding:40,textAlign:'center',color:'rgba(255,255,255,.45)'},error:{margin:'14px 24px 0',padding:'10px 14px',borderRadius:10,background:'rgba(239,68,68,.1)',color:'#ff7777',display:'flex',justifyContent:'space-between',gap:10},retry:{background:'none',border:0,color:'#fff',textDecoration:'underline',cursor:'pointer'}
};
