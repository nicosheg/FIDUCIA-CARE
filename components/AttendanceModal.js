// components/AttendanceModal.js
import{useEffect,useState}from'react';
import{supabase}from'../lib/supabaseClient';

export default function AttendanceModal({isOpen,onClose}){
 const[session,setSession]=useState(null),[people,setPeople]=useState([]),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[query,setQuery]=useState(''),[name,setName]=useState('');

 const auth=async()=>{
  const{data:{session}}=await supabase.auth.getSession();
  return session;
 };

 const loadPeople=async(s,id)=>{
  const r=await fetch(`/api/attendance/people?session_id=${id}`,{
   headers:{Authorization:`Bearer ${s.access_token}`}
  });
  const d=await r.json();
  if(!r.ok)throw Error(d.error||'Could not load people.');
  setPeople(d);
 };

 const load=async()=>{
  setLoading(true);
  setError('');
  try{
   const s=await auth();
   if(!s)return;

   const r=await fetch('/api/attendance/active-session',{
    headers:{Authorization:`Bearer ${s.access_token}`}
   });

   const d=await r.json();
   if(!r.ok)throw Error(d.error||'Could not load active session.');

   if(d.active){
    setSession(d);
    await loadPeople(s,d.session_id);
   }else{
    setSession(null);
    setPeople([]);
   }
  }catch(e){
   console.error(e);
   setError(e.message||'Could not load attendance.');
  }finally{
   setLoading(false);
  }
 };

 useEffect(()=>{
  if(isOpen)load();
 },[isOpen]);

 const create=async()=>{
  if(!name.trim()){
   setError('Please enter the event session name first.');
   return;
  }

  setSaving(true);
  setError('');

  try{
   const s=await auth();
   if(!s)return;

   const r=await fetch('/api/attendance/create-session',{
    method:'POST',
    headers:{
     'Content-Type':'application/json',
     Authorization:`Bearer ${s.access_token}`
    },
    body:JSON.stringify({name:name.trim()})
   });

   const d=await r.json();

   if(!r.ok)throw Error(d.error||'Could not create session.');

   setName('');
   await load();
  }catch(e){
   console.error(e);
   setError(e.message||'Could not create session.');
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
   if(!s)return;

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

   if(!r.ok)throw Error(d.error||'Could not mark attendance.');

   setPeople(p=>p.map(x=>
    x.id===id
     ?{
       ...x,
       marked:true,
       marked_by_name:d.marked_by_name||'You'
      }
     :x
   ));
  }catch(e){
   console.error(e);
   setError(e.message||'Could not mark attendance.');
  }finally{
   setSaving(false);
  }
 };

 const closeModal=()=>{
  setQuery('');
  setError('');
  onClose();
 };

 if(!isOpen)return null;

 const visible=people.filter(p=>
  `${p.first_name||''} ${p.last_name||''} ${p.phone||''}`
   .toLowerCase()
   .includes(query.toLowerCase())
 );

 const present=people.filter(p=>p.marked).length;
 const percentage=people.length?Math.round((present/people.length)*100):0;

 return <div className="attendance-overlay" onMouseDown={e=>{
  if(e.target===e.currentTarget)closeModal();
 }}>
  <div className="attendance-modal">

   <header>
    <div className="heading">
     <div className="eyebrow">LIVE ATTENDANCE</div>

     <h2>
      {session?.name||'Attendance'}
     </h2>

     <p>
      {session
       ?'Tap a person when you see them.'
       :'Start today’s attendance session.'}
     </p>
    </div>

    <button
     className="close"
     onClick={closeModal}
     aria-label="Close attendance"
    >
     ×
    </button>
   </header>

   {error&&
    <div className="error">
     <span>{error}</span>
     <button onClick={load}>Try again</button>
    </div>
   }

   {!session&&!loading&&
    <div className="start">

     <div className="start-icon">
      ✓
     </div>

     <div className="start-copy">
      <h3>Start attendance</h3>
      <p>
       Create one session for this service. Once it is open,
       everyone can join and mark the people they see.
      </p>
     </div>

     <input
      value={name}
      onChange={e=>setName(e.target.value)}
      onKeyDown={e=>e.key==='Enter'&&create()}
      placeholder="e.g. Sunday Service"
      autoFocus
     />

     <button
      className="start-button"
      onClick={create}
      disabled={saving}
     >
      {saving?'Starting...':'Start session'}
     </button>
    </div>
   }

   {loading&&
    !session&&
    <div className="loading">
     <div className="loader"></div>
     <span>Preparing attendance...</span>
    </div>
   }

   {session&&
    <>

     <div className="hero-stats">

      <div className="main-stat">
       <strong>{present}</strong>
       <span>present</span>
      </div>

      <div className="stat-divider"></div>

      <div className="small-stat">
       <strong>{people.length}</strong>
       <span>people</span>
      </div>

      <div className="small-stat">
       <strong>{percentage}%</strong>
       <span>marked</span>
      </div>

      <div className="progress-wrap">
       <div className="progress">
        <div
         className="progress-fill"
         style={{width:`${percentage}%`}}
        />
       </div>
      </div>

     </div>

     <div className="toolbar">

      <div className="search-wrap">
       <span className="search-icon">⌕</span>

       <input
        className="search"
        value={query}
        onChange={e=>setQuery(e.target.value)}
        placeholder="Search people..."
       />

       {query&&
        <button
         className="clear-search"
         onClick={()=>setQuery('')}
         aria-label="Clear search"
        >
         ×
        </button>
       }
      </div>

     </div>

     <div className="people">

      {loading?
       <div className="empty">
        <div className="loader small"></div>
        <span>Loading people...</span>
       </div>
       :
       visible.length===0?
       <div className="empty">
        <div className="empty-icon">⌕</div>
        <strong>No people found</strong>
        <span>
         {query
          ?'Try another name or phone number.'
          :'No active people are available yet.'}
        </span>
       </div>
       :
       visible.map(p=>
        <div
         className={`person ${p.marked?'marked':''}`}
         key={p.id}
        >

         <div className="person-info">

          <div className={`avatar ${p.marked?'present-avatar':''}`}>
           {(p.first_name||'?').charAt(0).toUpperCase()}
          </div>

          <div className="person-copy">
           <strong>
            {p.first_name} {p.last_name||''}
           </strong>

           <small>
            {p.marked
             ?`Present${p.marked_by_name?` · ${p.marked_by_name}`:''}`
             :(p.phone||'No phone')}
           </small>
          </div>

         </div>

         <button
          className={`mark-button ${p.marked?'done':''}`}
          disabled={p.marked||saving}
          onClick={()=>mark(p.id)}
         >
          {p.marked
           ?<><span>✓</span> Present</>
           :'Mark present'}
         </button>

        </div>
       )
      }

     </div>

     <footer>

      <div className="live">
       <span className="live-dot"></span>
       Live attendance
      </div>

      <div className="footer-count">
       {present} of {people.length} marked
      </div>

     </footer>

    </>
   }

  </div>

  <style jsx>{`

   .attendance-overlay{
    position:fixed;
    inset:0;
    z-index:999999;
    background:rgba(5,8,18,.62);
    backdrop-filter:blur(14px);
    -webkit-backdrop-filter:blur(14px);
    display:flex;
    align-items:flex-start;
    justify-content:center;
    padding:clamp(20px,8vh,70px) 18px 18px;
    overflow:auto;
   }

   .attendance-modal{
    width:min(960px,94vw);
    height:min(78vh,760px);
    min-height:540px;
    background:
     radial-gradient(circle at 90% 0%,rgba(212,175,55,.09),transparent 32%),
     radial-gradient(circle at 0% 100%,rgba(55,90,180,.08),transparent 30%),
     #10172b;
    border:1px solid rgba(255,255,255,.11);
    border-radius:28px;
    display:flex;
    flex-direction:column;
    overflow:hidden;
    box-shadow:
     0 30px 100px rgba(0,0,0,.55),
     0 0 0 1px rgba(255,255,255,.025);
    color:#f5f7fb;
   }

   header{
    display:flex;
    align-items:flex-start;
    justify-content:space-between;
    gap:20px;
    padding:25px 28px 20px;
    border-bottom:1px solid rgba(255,255,255,.07);
    flex-shrink:0;
   }

   .heading{
    min-width:0;
   }

   .eyebrow{
    font-size:10px;
    font-weight:700;
    letter-spacing:2.4px;
    color:rgba(255,255,255,.38);
    margin-bottom:7px;
   }

   .attendance-modal h2{
    margin:0;
    font-size:clamp(26px,3vw,38px);
    line-height:1.05;
    letter-spacing:-.035em;
    font-weight:750;
   }

   .attendance-modal header p{
    margin:7px 0 0;
    color:rgba(255,255,255,.47);
    font-size:14px;
   }

   .close{
    flex-shrink:0;
    width:40px;
    height:40px;
    border-radius:50%;
    border:1px solid rgba(255,255,255,.08);
    background:rgba(255,255,255,.055);
    color:rgba(255,255,255,.8);
    font-size:27px;
    line-height:1;
    cursor:pointer;
    transition:.18s ease;
   }

   .close:hover{
    background:rgba(255,255,255,.11);
    color:#fff;
    transform:scale(1.04);
   }

   .error{
    margin:12px 26px 0;
    padding:10px 13px;
    border-radius:12px;
    background:rgba(239,68,68,.09);
    border:1px solid rgba(239,68,68,.14);
    color:#ff9292;
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:12px;
    font-size:13px;
    flex-shrink:0;
   }

   .error button{
    border:0;
    background:none;
    color:#fff;
    text-decoration:underline;
    cursor:pointer;
    white-space:nowrap;
   }

   .hero-stats{
    padding:17px 28px 15px;
    display:flex;
    align-items:center;
    gap:22px;
    flex-shrink:0;
   }

   .main-stat{
    display:flex;
    align-items:baseline;
    gap:7px;
   }

   .main-stat strong{
    font-size:31px;
    letter-spacing:-.04em;
   }

   .main-stat span,
   .small-stat span{
    color:rgba(255,255,255,.43);
    font-size:12px;
   }

   .stat-divider{
    width:1px;
    height:29px;
    background:rgba(255,255,255,.1);
   }

   .small-stat{
    display:flex;
    align-items:baseline;
    gap:5px;
   }

   .small-stat strong{
    font-size:19px;
   }

   .progress-wrap{
    flex:1;
    min-width:70px;
   }

   .progress{
    width:100%;
    height:5px;
    background:rgba(255,255,255,.07);
    border-radius:99px;
    overflow:hidden;
   }

   .progress-fill{
    height:100%;
    background:#d4af37;
    border-radius:99px;
    transition:width .35s ease;
   }

   .toolbar{
    padding:0 28px 13px;
    flex-shrink:0;
   }

   .search-wrap{
    position:relative;
   }

   .search{
    width:100%;
    box-sizing:border-box;
    padding:13px 42px;
    border-radius:14px;
    border:1px solid rgba(255,255,255,.08);
    background:rgba(255,255,255,.045);
    color:#fff;
    font-size:14px;
    outline:none;
    transition:.18s ease;
   }

   .search::placeholder{
    color:rgba(255,255,255,.3);
   }

   .search:focus{
    border-color:rgba(212,175,55,.38);
    background:rgba(255,255,255,.06);
   }

   .search-icon{
    position:absolute;
    left:16px;
    top:50%;
    transform:translateY(-51%);
    color:rgba(255,255,255,.35);
    font-size:20px;
    z-index:1;
    pointer-events:none;
   }

   .clear-search{
    position:absolute;
    right:9px;
    top:50%;
    transform:translateY(-50%);
    width:28px;
    height:28px;
    border:0;
    border-radius:50%;
    background:rgba(255,255,255,.08);
    color:rgba(255,255,255,.65);
    cursor:pointer;
    font-size:18px;
   }

   .people{
    flex:1;
    min-height:0;
    overflow:auto;
    padding:0 28px 15px;
    display:grid;
    grid-template-columns:repeat(2,minmax(0,1fr));
    align-content:start;
    gap:8px;
   }

   .people::-webkit-scrollbar{
    width:5px;
   }

   .people::-webkit-scrollbar-track{
    background:transparent;
   }

   .people::-webkit-scrollbar-thumb{
    background:rgba(255,255,255,.12);
    border-radius:99px;
   }

   .person{
    min-height:64px;
    box-sizing:border-box;
    padding:9px 10px;
    border:1px solid rgba(255,255,255,.065);
    border-radius:15px;
    background:rgba(255,255,255,.032);
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:9px;
    transition:
     border-color .2s ease,
     background .2s ease,
     transform .15s ease;
   }

   .person:hover{
    background:rgba(255,255,255,.05);
    border-color:rgba(255,255,255,.1);
   }

   .person.marked{
    background:rgba(76,175,80,.075);
    border-color:rgba(76,175,80,.24);
   }

   .person-info{
    min-width:0;
    display:flex;
    align-items:center;
    gap:10px;
   }

   .avatar{
    width:38px;
    height:38px;
    flex:0 0 38px;
    border-radius:50%;
    display:flex;
    align-items:center;
    justify-content:center;
    background:rgba(255,255,255,.08);
    color:rgba(255,255,255,.72);
    font-size:14px;
    font-weight:750;
   }

   .present-avatar{
    background:rgba(76,175,80,.18);
    color:#b7e8b9;
   }

   .person-copy{
    min-width:0;
   }

   .person strong{
    display:block;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
    font-size:14px;
    font-weight:650;
   }

   .person small{
    display:block;
    margin-top:3px;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
    color:rgba(255,255,255,.34);
    font-size:11px;
   }

   .person.marked small{
    color:rgba(160,220,165,.62);
   }

   .mark-button{
    flex-shrink:0;
    border:1px solid rgba(255,255,255,.08);
    border-radius:999px;
    padding:8px 11px;
    background:rgba(255,255,255,.07);
    color:rgba(255,255,255,.84);
    font-size:11px;
    font-weight:650;
    cursor:pointer;
    white-space:nowrap;
    transition:.18s ease;
   }

   .mark-button:hover:not(:disabled){
    background:rgba(212,175,55,.16);
    border-color:rgba(212,175,55,.3);
    color:#f4d77a;
    transform:translateY(-1px);
   }

   .mark-button:disabled{
    cursor:default;
   }

   .mark-button.done{
    background:rgba(76,175,80,.13);
    border-color:rgba(76,175,80,.2);
    color:#a9dcae;
   }

   .mark-button.done span{
    margin-right:3px;
   }

   footer{
    flex-shrink:0;
    min-height:44px;
    box-sizing:border-box;
    padding:10px 28px;
    border-top:1px solid rgba(255,255,255,.065);
    display:flex;
    align-items:center;
    justify-content:space-between;
    color:rgba(255,255,255,.36);
    font-size:11px;
   }

   .live{
    display:flex;
    align-items:center;
    gap:7px;
   }

   .live-dot{
    width:7px;
    height:7px;
    border-radius:50%;
    background:#6bd174;
    box-shadow:0 0 0 4px rgba(107,209,116,.08);
   }

   .footer-count{
    color:rgba(255,255,255,.28);
   }

   .start{
    flex:1;
    min-height:0;
    display:flex;
    flex-direction:column;
    justify-content:center;
    align-items:center;
    text-align:center;
    padding:30px;
   }

   .start-icon{
    width:62px;
    height:62px;
    border-radius:22px;
    display:flex;
    align-items:center;
    justify-content:center;
    background:rgba(212,175,55,.1);
    border:1px solid rgba(212,175,55,.18);
    color:#d4af37;
    font-size:27px;
    margin-bottom:17px;
   }

   .start-copy{
    max-width:430px;
   }

   .start-copy h3{
    margin:0;
    font-size:24px;
    letter-spacing:-.025em;
   }

   .start-copy p{
    margin:8px 0 22px;
    color:rgba(255,255,255,.43);
    font-size:13px;
    line-height:1.55;
   }

   .start input{
    width:min(460px,100%);
    box-sizing:border-box;
    padding:14px 16px;
    border-radius:14px;
    border:1px solid rgba(255,255,255,.1);
    background:rgba(255,255,255,.045);
    color:#fff;
    outline:none;
    font-size:14px;
   }

   .start input:focus{
    border-color:rgba(212,175,55,.4);
   }

   .start input::placeholder{
    color:rgba(255,255,255,.28);
   }

   .start-button{
    margin-top:10px;
    width:min(460px,100%);
    padding:13px 20px;
    border:0;
    border-radius:14px;
    background:#d4af37;
    color:#101010;
    font-size:14px;
    font-weight:750;
    cursor:pointer;
    transition:.18s ease;
   }

   .start-button:hover:not(:disabled){
    transform:translateY(-1px);
    filter:brightness(1.05);
   }

   .start-button:disabled{
    opacity:.65;
    cursor:default;
   }

   .loading,
   .empty{
    flex:1;
    display:flex;
    flex-direction:column;
    align-items:center;
    justify-content:center;
    gap:9px;
    color:rgba(255,255,255,.36);
    font-size:12px;
   }

   .empty{
    grid-column:1/-1;
    min-height:220px;
   }

   .empty strong{
    color:rgba(255,255,255,.58);
    font-size:14px;
   }

   .empty-icon{
    width:43px;
    height:43px;
    border-radius:14px;
    background:rgba(255,255,255,.045);
    display:flex;
    align-items:center;
    justify-content:center;
    font-size:21px;
    color:rgba(255,255,255,.3);
   }

   .loader{
    width:22px;
    height:22px;
    border:2px solid rgba(255,255,255,.1);
    border-top-color:rgba(212,175,55,.8);
    border-radius:50%;
    animation:spin .75s linear infinite;
   }

   .loader.small{
    width:18px;
    height:18px;
   }

   @keyframes spin{
    to{transform:rotate(360deg)}
   }

   @media(max-width:720px){

    .attendance-overlay{
     padding:8vh 10px 12px;
    }

    .attendance-modal{
     width:96vw;
     height:78vh;
     min-height:500px;
     border-radius:23px;
    }

    header{
     padding:19px 19px 16px;
    }

    .attendance-modal h2{
     font-size:27px;
    }

    .hero-stats{
     padding:14px 19px 12px;
     gap:14px;
    }

    .toolbar{
     padding:0 19px 11px;
    }

    .people{
     padding:0 19px 12px;
     grid-template-columns:1fr;
     gap:7px;
    }

    footer{
     padding:9px 19px;
    }

    .small-stat:nth-of-type(2){
     display:none;
    }

   }

   @media(max-width:480px){

    .attendance-overlay{
     padding:6vh 6px 8px;
    }

    .attendance-modal{
     width:97vw;
     height:82vh;
     min-height:480px;
     border-radius:21px;
    }

    .attendance-modal header{
     padding:17px;
    }

    .attendance-modal header p{
     font-size:12px;
    }

    .hero-stats{
     padding:12px 17px 10px;
     gap:11px;
    }

    .main-stat strong{
     font-size:27px;
    }

    .small-stat strong{
     font-size:17px;
    }

    .progress-wrap{
     min-width:50px;
    }

    .toolbar{
     padding:0 17px 10px;
    }

    .people{
     padding-left:17px;
     padding-right:17px;
    }

    .person{
     min-height:60px;
     padding:8px;
    }

    .avatar{
     width:35px;
     height:35px;
     flex-basis:35px;
    }

    .mark-button{
     padding:7px 9px;
     font-size:10px;
    }

    footer{
     padding-left:17px;
     padding-right:17px;
    }

   }

  `}</style>
 </div>
 }
