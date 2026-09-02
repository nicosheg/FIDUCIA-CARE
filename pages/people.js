// pages/people.js
import { useState,useEffect,useRef,useCallback } from 'react';
import Link from 'next/link';
import Layout from '../components/Layout';
import FirstExperience from '../components/FirstExperience';
import BirthdayPicker from '../components/BirthdayPicker';
import { supabase } from '../lib/supabaseClient';
import { useOnboarding } from '../components/OnboardingProvider';

const ICONS={
visitor:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-7 8-7s8 3 8 7"/></svg>,
phone:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18.01" stroke="currentColor" strokeWidth="3"/></svg>,
calendar:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
mail:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 7 10-7"/></svg>,
note:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l1-4L16.5 3.5z"/></svg>,
importIcon:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
check:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>,
trash:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>,
edit:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l1-4L16.5 3.5z"/></svg>,
chevron:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>,
prayer:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2"><path d="M17 14V3a1 1 0 00-1-1H8a1 1 0 00-1 1v11l4 4 6-4z"/><path d="M12 22V8"/></svg>,
heart:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>,
smile:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>,
sick:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2"><path d="M4 4h16v16H4z"/><line x1="8" y1="8" x2="16" y2="16"/><line x1="16" y1="8" x2="8" y2="16"/></svg>,
family:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M2 20c0-4 4-7 10-7 1.5 0 3 .3 4.3.9"/><circle cx="20" cy="18" r="3"/><path d="M20 15v2"/></svg>,
work:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>,
other:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
};

const getNextBirthday=b=>b?Math.ceil((new Date(new Date(b).setFullYear(new Date().getFullYear()))-new Date())/(1000*60*60*24)):null;
const statusColor=s=>s==='alive'?'#8FB7FF':s==='needs_decision'?'#D4AF37':s==='conflict'?'linear-gradient(135deg,#8FB7FF 50%,#D4AF37 50%)':'rgba(255,255,255,.4)';
const statusLabel=s=>s==='alive'?'Stable Truth':s==='needs_decision'?'Needs Evidence':s==='conflict'?'Human Review Required':'';
const statusExplanation=(s,c)=>s==='alive'?`ARIA is highly confident this identity is correct. (Confidence: ${c||90}%)`:s==='needs_decision'?'ARIA needs more evidence before confirming this identity.':s==='conflict'?'ARIA found multiple possible identities and requires human review.':null;

const inputStyle={padding:'10px 12px',borderRadius:10,border:'1px solid rgba(255,255,255,.06)',background:'rgba(20,25,40,.6)',color:'#fff',outline:'none'};
const labelStyle={display:'block',fontSize:13,color:'rgba(255,255,255,.5)',marginBottom:4};
const birthdayButtonStyle=value=>({width:'100%',padding:'12px 16px',borderRadius:10,border:'1px solid rgba(255,255,255,.06)',background:'rgba(20,25,40,.6)',color:value?'#f0f0f0':'rgba(255,255,255,.3)',fontSize:15,textAlign:'left',cursor:'pointer',outline:'none'});
const birthdayHint={fontSize:12,color:'rgba(255,255,255,.3)',marginTop:4};
const textareaStyle={width:'100%',padding:8,borderRadius:8,border:'1px solid rgba(255,255,255,.06)',background:'rgba(255,255,255,.03)',color:'#fff',resize:'vertical',outline:'none',marginBottom:8};
const panelStyle={marginTop:12,background:'rgba(20,25,40,.9)',borderRadius:12,padding:12,border:'1px solid rgba(255,255,255,.05)'};

function LoadingSkeleton(){
return <div style={{maxWidth:1100,margin:'0 auto',padding:20}}>
<div style={{height:36,width:'30%',borderRadius:8,marginBottom:25,background:'rgba(255,255,255,.04)'}}/>
<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(270px,1fr))',gap:20}}>
{[...Array(6)].map((_,i)=><div key={i} className="fiducia-card shimmer" style={{padding:24,height:180}}/>)}
</div></div>;
}

export default function PeoplePage(){
const onboarding=useOnboarding();
const [people,setPeople]=useState([]);
const [filtered,setFiltered]=useState([]);
const [search,setSearch]=useState('');
const [roleFilter,setRoleFilter]=useState('all');
const [showLivingTruthOnly,setShowLivingTruthOnly]=useState(false);
const [msg,setMsg]=useState('');
const [loading,setLoading]=useState(true);
const [showAdd,setShowAdd]=useState(false);
const [form,setForm]=useState({full_name:'',phone:'',type:'visitor',birthday:''});
const [expandedId,setExpandedId]=useState(null);
const [addingNote,setAddingNote]=useState(false);
const [noteText,setNoteText]=useState('');
const [importingConv,setImportingConv]=useState(false);
const [convText,setConvText]=useState('');
const [showPicker,setShowPicker]=useState(false);
const [pickerTarget,setPickerTarget]=useState(null);
const [editingId,setEditingId]=useState(null);
const [editName,setEditName]=useState('');
const [editPhone,setEditPhone]=useState('');
const [editBirthday,setEditBirthday]=useState('');
const [selectMode,setSelectMode]=useState(false);
const [selectedIds,setSelectedIds]=useState(new Set());
const [reviewItems,setReviewItems]=useState([]);
const [showReviewPanel,setShowReviewPanel]=useState(false);
const timer=useRef(null);
const longPressTriggered=useRef(false);
const [accessToken,setAccessToken]=useState(null);

useEffect(()=>{
supabase.auth.getSession().then(({data:{session}})=>{
if(session){
setAccessToken(session.access_token);
fetchPeople(session.access_token);
initAria(session.access_token);
}else setLoading(false);
});
return()=>{if(timer.current)clearTimeout(timer.current)};
},[]);

const fetchPeople=async token=>{
try{
const res=await fetch('/api/people',{headers:{Authorization:`Bearer ${token}`}});
const data=await res.json();
if(Array.isArray(data))setPeople(data);
setLoading(false);
}catch{setLoading(false)}
};

const initAria=async token=>{
try{await fetch('/api/aria/initialize',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({})})}
catch(err){console.warn('Baseline initialization failed:',err)}
};

const computeReviewItems=list=>list.filter(p=>p.living_truth&&(p.living_truth.status==='needs_decision'||p.living_truth.status==='conflict')).map(p=>({
person_id:p.id,
extracted_name:p.first_name,
extracted_phone:p.phone,
status:p.living_truth.status,
confidence:p.living_truth.confidence||70,
candidates:p.living_truth.candidate_ids||[],
resolved:false
}));

useEffect(()=>setReviewItems(computeReviewItems(people)),[people]);

useEffect(()=>{
let r=[...people];
if(roleFilter!=='all')r=r.filter(p=>p.type===roleFilter);
if(showLivingTruthOnly)r=r.filter(p=>p.living_truth&&(p.living_truth.status==='needs_decision'||p.living_truth.status==='conflict'));
if(search.trim()){
const q=search.toLowerCase();
r=r.filter(p=>(p.first_name||'').toLowerCase().includes(q)||(p.phone||'').includes(q));
}
setFiltered(r);
},[people,search,roleFilter,showLivingTruthOnly]);

const beginLongPress=useCallback(id=>{
longPressTriggered.current=false;
timer.current=setTimeout(()=>{
longPressTriggered.current=true;
setSelectMode(true);
setSelectedIds(prev=>new Set(prev).add(id));
setExpandedId(null);
if(navigator.vibrate)navigator.vibrate(50);
},650);
},[]);

const endLongPress=useCallback(()=>{
if(timer.current){clearTimeout(timer.current);timer.current=null}
},[]);

const handleCardClick=id=>{
if(longPressTriggered.current){longPressTriggered.current=false;return}
if(selectMode){
setSelectedIds(prev=>{
const next=new Set(prev);
next.has(id)?next.delete(id):next.add(id);
return next;
});
return;
}
if(editingId===id)return;
setExpandedId(prev=>prev===id?null:id);
setAddingNote(false);
setImportingConv(false);
setNoteText('');
setConvText('');
};

const selectAll=()=>setSelectedIds(new Set(filtered.map(p=>p.id)));

const cancelSelect=()=>{
setSelectMode(false);
setSelectedIds(new Set());
longPressTriggered.current=false;
};

const startEdit=person=>{
setExpandedId(person.id);
setEditingId(person.id);
setEditName(person.first_name||'');
setEditPhone(person.phone||'');
setEditBirthday(person.birthday||'');
setAddingNote(false);
setImportingConv(false);
};

const cancelEdit=()=>{
setEditingId(null);
setEditName('');
setEditPhone('');
setEditBirthday('');
};

const addPerson=async e=>{
e.preventDefault();
if(!form.full_name.trim()||!accessToken)return;
try{
const res=await fetch('/api/people',{
method:'POST',
headers:{'Content-Type':'application/json',Authorization:`Bearer ${accessToken}`},
body:JSON.stringify({first_name:form.full_name.trim(),phone:form.phone,type:form.type,birthday:form.birthday||null})
});
const data=await res.json();
if(res.ok&&data.id){
setPeople(prev=>[data,...prev]);
setForm({full_name:'',phone:'',type:'visitor',birthday:''});
setShowAdd(false);
setMsg('Person added');
}else setMsg('Error: '+(data.error||'Could not add'));
}catch{setMsg('Error adding.')}
setTimeout(()=>setMsg(''),3000);
};

const saveEdit=async id=>{
if(!editName.trim()||!accessToken)return;
try{
const res=await fetch('/api/people',{
method:'PUT',
headers:{'Content-Type':'application/json',Authorization:`Bearer ${accessToken}`},
body:JSON.stringify({id,first_name:editName.trim(),phone:editPhone,type:people.find(p=>p.id===id)?.type||'visitor',birthday:editBirthday||null})
});
const data=await res.json();
if(res.ok&&data.id){
setPeople(prev=>prev.map(p=>p.id===id?data:p));
setMsg('Updated');
cancelEdit();
cancelSelect();
}else setMsg('Error: '+(data.error||'Update failed'));
}catch{setMsg('Error updating.')}
setTimeout(()=>setMsg(''),3000);
};

const deletePerson=async(id,e)=>{
if(e)e.stopPropagation();
if(!confirm('Remove this person?')||!accessToken)return;
try{
const res=await fetch('/api/people/delete',{
method:'POST',
headers:{'Content-Type':'application/json',Authorization:`Bearer ${accessToken}`},
body:JSON.stringify({id})
});
const data=await res.json();
if(res.ok&&data.success&&data.deleted>0){
setPeople(prev=>prev.filter(p=>!data.deleted_ids.includes(p.id)));
if(expandedId===id)setExpandedId(null);
setMsg(`Deleted ${data.deleted} person.`);
}else setMsg('Error: '+(data.error||'Delete failed'));
}catch{setMsg('Error deleting.')}
setTimeout(()=>setMsg(''),3000);
};

const bulkDelete=async()=>{
if(selectedIds.size===0||!accessToken)return;
if(!confirm(`Remove ${selectedIds.size} selected people?`))return;
try{
const res=await fetch('/api/people/delete',{
method:'POST',
headers:{'Content-Type':'application/json',Authorization:`Bearer ${accessToken}`},
body:JSON.stringify({ids:Array.from(selectedIds)})
});
const data=await res.json();
if(res.ok&&data.success&&data.deleted>0){
setPeople(prev=>prev.filter(p=>!data.deleted_ids.includes(p.id)));
const missing=(data.not_found_ids||[]).length;
setMsg(`Deleted ${data.deleted} people.${missing?` ${missing} not found.`:''}`);
}else setMsg('Error: '+(data.error||'Delete failed'));
}catch{setMsg('Error deleting.')}
setTimeout(()=>setMsg(''),3000);
cancelSelect();
};

const generateDraft=async id=>{
if(!accessToken)return;
try{
const res=await fetch('/api/presence/draft',{
method:'POST',
headers:{'Content-Type':'application/json',Authorization:`Bearer ${accessToken}`},
body:JSON.stringify({person_id:id})
});
const data=await res.json();
if(data.message&&confirm(data.message+'\n\nOpen WhatsApp to send?')){
const person=people.find(p=>p.id===id);
if(person?.phone){
const phone=person.phone.startsWith('+')?person.phone.substring(1):person.phone;
window.open(`https://wa.me/${phone}?text=${encodeURIComponent(data.message)}`,'_blank');
await fetch('/api/timeline',{
method:'POST',
headers:{'Content-Type':'application/json',Authorization:`Bearer ${accessToken}`},
body:JSON.stringify({person_id:id,event_type:'message_sent',channel:'whatsapp',description:data.message.substring(0,100),metadata:{type:'manual_send'}})
});
setMsg('Message opened in WhatsApp');
}
}else setMsg('Error: '+(data.error||'Draft failed'));
}catch{setMsg('Error creating message.')}
setTimeout(()=>setMsg(''),3000);
};
  const saveNote=async person=>{
if(!noteText.trim()||!accessToken)return;
try{
const res=await fetch('/api/timeline',{
method:'POST',
headers:{'Content-Type':'application/json',Authorization:`Bearer ${accessToken}`},
body:JSON.stringify({person_id:person.id,event_type:'note',channel:'manual',description:noteText.trim(),metadata:{type:'pastoral_note'}})
});
if(!res.ok)throw new Error();
setNoteText('');
setAddingNote(false);
setMsg('Note saved');
}catch{setMsg('Error saving note.')}
setTimeout(()=>setMsg(''),3000);
};

const importConversation=async person=>{
if(!convText.trim()||!accessToken)return;
try{
const res=await fetch('/api/conversation/import',{
method:'POST',
headers:{'Content-Type':'application/json',Authorization:`Bearer ${accessToken}`},
body:JSON.stringify({person_id:person.id,text:convText.trim()})
});
const data=await res.json();
if(data.success){
setConvText('');
setImportingConv(false);
setMsg(`Conversation imported – ${data.extracted} key events extracted`);
}else setMsg('Error: '+(data.error||'Import failed'));
}catch{setMsg('Error importing conversation.')}
setTimeout(()=>setMsg(''),3000);
};

const resolveReview=async(item,action,targetId=null)=>{
if(!accessToken)return;
try{
const res=await fetch('/api/identity/resolve',{
method:'POST',
headers:{'Content-Type':'application/json',Authorization:`Bearer ${accessToken}`},
body:JSON.stringify({scan_job_id:null,extracted_name:item.extracted_name,action,target_person_id:targetId})
});
if(res.ok){
await fetchPeople(accessToken);
setMsg('Resolved successfully.');
}else{
const err=await res.json();
setMsg('Error: '+(err.error||'Resolution failed'));
}
}catch{setMsg('Error resolving.')}
setTimeout(()=>setMsg(''),3000);
};

if(loading)return <Layout><LoadingSkeleton/></Layout>;

const reviewStats={
total:reviewItems.length,
needs_decision:reviewItems.filter(i=>i.status==='needs_decision').length,
conflict:reviewItems.filter(i=>i.status==='conflict').length
};

const showPeopleExperience=onboarding?.loaded&&onboarding.enabled&&!onboarding.isExperienced('people');

return <Layout>
<div style={{maxWidth:1100,margin:'0 auto',padding:20}}>
{showPeopleExperience&&<FirstExperience experience="people" onComplete={()=>onboarding.completeExperience('people')}/>}

<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:16,marginBottom:25}}>
<div>
<h1 style={{fontSize:28,fontWeight:600,color:'#f0f0f0',margin:0}}>{people.length} lives remembered</h1>
<p style={{fontSize:13,color:'rgba(255,255,255,.35)',margin:'7px 0 0'}}>Everyone your organization knows.</p>
</div>

{selectMode&&<div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'flex-end'}}>
<button onClick={selectAll} className="fiducia-button fiducia-button-ghost" style={{padding:'7px 12px',fontSize:13}}>Select all</button>
<button onClick={cancelSelect} className="fiducia-button fiducia-button-ghost" style={{padding:'7px 12px',fontSize:13}}>Cancel</button>
{selectedIds.size>0&&<button onClick={bulkDelete} className="fiducia-button fiducia-button-ghost danger-button" style={{padding:'7px 12px',fontSize:13}}>Remove {selectedIds.size}</button>}
</div>}
</div>

<div style={{marginBottom:20}}>
{reviewStats.total===0?
<div style={{display:'flex',alignItems:'center',gap:10,color:'rgba(255,255,255,.3)'}}>
<div style={{width:8,height:8,borderRadius:'50%',background:'rgba(255,255,255,.1)'}}/>
<span style={{fontSize:14}}>Living Truth · Everything is settled</span>
</div>:
<div className="living-truth-banner" onClick={()=>setShowReviewPanel(true)} style={{display:'flex',alignItems:'center',gap:12,cursor:'pointer',padding:'8px 0',borderBottom:'1px solid rgba(143,183,255,.1)'}}>
<div className="living-dot" style={{width:8,height:8,borderRadius:'50%',background:'#8FB7FF',animation:'pulse 4s ease-in-out infinite'}}/>
<span style={{color:'#8FB7FF',fontWeight:500}}>Living Truth · {reviewStats.total} identities need attention</span>
<span style={{marginLeft:'auto',color:'rgba(255,255,255,.3)',fontSize:12}}>
{reviewStats.needs_decision>0&&`${reviewStats.needs_decision} need decision `}
{reviewStats.conflict>0&&`${reviewStats.conflict} conflict`}
</span>
</div>}
</div>

{showReviewPanel&&<div className="review-panel-overlay" onClick={()=>setShowReviewPanel(false)}>
<div className="review-panel" onClick={e=>e.stopPropagation()}>
<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
<h3 style={{color:'#f0f0f0',margin:0}}>Review Needed</h3>
<button onClick={()=>setShowReviewPanel(false)} className="fiducia-button fiducia-button-ghost">Close</button>
</div>
{reviewItems.length===0?<p style={{color:'rgba(255,255,255,.5)'}}>No unresolved identities.</p>:
<div style={{display:'flex',flexDirection:'column',gap:12}}>
{reviewItems.map(item=><div key={`${item.person_id}-${item.extracted_name}`} className="review-item">
<div>
<span style={{color:'#f0f0f0',fontWeight:500}}>{item.extracted_name}</span>
{item.extracted_phone&&<span style={{color:'rgba(255,255,255,.4)',marginLeft:8}}>{item.extracted_phone}</span>}
<span style={{marginLeft:12,fontSize:12,color:statusColor(item.status)}}>{statusLabel(item.status)}</span>
</div>
<div style={{display:'flex',gap:8}}>
{item.candidates?.length>0&&<button className="fiducia-button fiducia-button-primary" style={{padding:'4px 12px',fontSize:12}} onClick={()=>resolveReview(item,'confirm',item.candidates[0])}>Confirm</button>}
<button className="fiducia-button fiducia-button-secondary" style={{padding:'4px 12px',fontSize:12}} onClick={()=>resolveReview(item,'keep_new')}>Keep as New</button>
</div>
</div>)}
</div>}
</div>
</div>}

<div style={{display:'flex',gap:12,marginBottom:24,flexWrap:'wrap',alignItems:'center'}}>
<input type="text" placeholder="Search by name or phone" value={search} onChange={e=>setSearch(e.target.value)} style={{flex:1,minWidth:200,padding:'10px 14px',borderRadius:12,border:'1px solid rgba(255,255,255,.06)',background:'rgba(20,25,40,.8)',color:'#fff',outline:'none'}}/>
<select value={roleFilter} onChange={e=>setRoleFilter(e.target.value)} style={{padding:'10px 14px',borderRadius:12,border:'1px solid rgba(255,255,255,.06)',background:'rgba(20,25,40,.8)',color:'#fff',outline:'none',width:120}}>
<option value="all">All</option>
<option value="visitor">Visitor</option>
<option value="member">Member</option>
</select>
<button className={`fiducia-button ${showLivingTruthOnly?'fiducia-button-primary':'fiducia-button-ghost'}`} style={{padding:'6px 12px',fontSize:12}} onClick={()=>setShowLivingTruthOnly(v=>!v)}>
{showLivingTruthOnly?'All':'Living Truth'}
</button>
<button onClick={()=>setShowAdd(v=>!v)} className="fiducia-button fiducia-button-primary">Add Person</button>
</div>

{showAdd&&<form onSubmit={addPerson} className="fiducia-card add-form">
<input placeholder="Full Name" value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})} required style={inputStyle}/>
<input placeholder="Phone" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} style={inputStyle}/>
<div>
<label style={labelStyle}><span style={{color:'#D4AF37',marginRight:6}}>●</span>Birthday <span style={{fontSize:12,color:'rgba(255,255,255,.3)',marginLeft:6}}>When should ARIA celebrate?</span></label>
<button type="button" onClick={()=>{setPickerTarget('add');setShowPicker(true)}} style={birthdayButtonStyle(form.birthday)}>
{form.birthday?new Date(form.birthday).toLocaleDateString():'Add birthday'}
</button>
{form.birthday&&<div style={birthdayHint}>Next birthday in {getNextBirthday(form.birthday)} days</div>}
</div>
<select value={form.type} onChange={e=>setForm({...form,type:e.target.value})} style={inputStyle}>
<option value="visitor">Visitor</option>
<option value="member">Member</option>
</select>
<div style={{display:'flex',gap:8}}>
<button type="submit" className="fiducia-button fiducia-button-primary">Save</button>
<button type="button" onClick={()=>setShowAdd(false)} className="fiducia-button fiducia-button-ghost">Cancel</button>
</div>
</form>}

{msg&&<div className="fiducia-card" style={{padding:10,marginBottom:15,color:'#34D399',textAlign:'center'}}>{msg}</div>}

<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(270px,1fr))',gap:20}}>
{filtered.length===0?
<div className="empty-state">
<div style={{fontSize:18,color:'#f0f0f0',marginBottom:8}}>{search||roleFilter!=='all'?'No people found':'No people yet'}</div>
<div style={{fontSize:13,color:'rgba(255,255,255,.35)',maxWidth:420}}>
{search||roleFilter!=='all'?'Try a different search or filter.':'Add your first person or use Scan to begin building the people your organization knows.'}
</div>
</div>:
filtered.map(person=>{
const truth=person.living_truth;
const status=truth?.status||null;
const label=statusLabel(status);
const explanation=statusExplanation(status,truth?.confidence);
const expanded=expandedId===person.id;
const editing=editingId===person.id;

return <div key={person.id}
className={`fiducia-card person-card ${expanded?'expanded-card':''}`}
onPointerDown={()=>beginLongPress(person.id)}
onPointerUp={endLongPress}
onPointerCancel={endLongPress}
onPointerLeave={endLongPress}
onClick={()=>handleCardClick(person.id)}
style={{
cursor:'pointer',
border:selectedIds.has(person.id)?'1px solid #D4AF37':undefined,
background:selectedIds.has(person.id)?'rgba(212,175,55,.08)':undefined,
userSelect:'none',
WebkitUserSelect:'none',
position:'relative'
}}>

{selectMode&&<div style={{position:'absolute',top:12,right:12,width:22,height:22,borderRadius:6,display:'flex',alignItems:'center',justifyContent:'center',background:selectedIds.has(person.id)?'rgba(212,175,55,.12)':'rgba(255,255,255,.03)',border:selectedIds.has(person.id)?'1px solid rgba(212,175,55,.4)':'1px solid rgba(255,255,255,.18)'}}>
{selectedIds.has(person.id)?ICONS.check:null}
</div>}

{editing?
<div onClick={e=>e.stopPropagation()} style={{display:'flex',flexDirection:'column',gap:8}}>
<input value={editName} onChange={e=>setEditName(e.target.value)} style={inputStyle} placeholder="Full Name"/>
<input value={editPhone} onChange={e=>setEditPhone(e.target.value)} style={inputStyle} placeholder="Phone"/>
<div>
<label style={labelStyle}>Birthday</label>
<button type="button" onClick={()=>{setPickerTarget('edit');setShowPicker(true)}} style={birthdayButtonStyle(editBirthday)}>
{editBirthday?new Date(editBirthday).toLocaleDateString():'Add birthday'}
</button>
{editBirthday&&<div style={birthdayHint}>Next birthday in {getNextBirthday(editBirthday)} days</div>}
</div>
<div style={{display:'flex',gap:8}}>
<button onClick={e=>{e.stopPropagation();saveEdit(person.id)}} className="fiducia-button fiducia-button-primary" style={{padding:'6px 12px',fontSize:13}}>Save</button>
<button onClick={e=>{e.stopPropagation();cancelEdit()}} className="fiducia-button fiducia-button-ghost" style={{padding:'6px 12px',fontSize:13}}>Cancel</button>
</div>
</div>:
<>
<div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:10}}>
<div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',minWidth:0}}>
<span style={{fontWeight:600,fontSize:17,color:'#f0f0f0'}}>{person.first_name}</span>
{status&&<span style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:11,padding:'2px 10px 2px 6px',borderRadius:20,background:'rgba(255,255,255,.04)',border:`1px solid ${status==='conflict'?'rgba(143,183,255,.3)':'rgba(255,255,255,.08)'}`,fontWeight:500,color:status==='conflict'||status==='alive'?'#8FB7FF':'#D4AF37'}}>
<span style={{display:'inline-block',width:9,height:9,borderRadius:'50%',background:statusColor(status),animation:'pulse 2.5s ease-in-out infinite'}}/>
{label}
</span>}
</div>
<div style={{display:'flex',alignItems:'center',gap:7,flexShrink:0}}>
<span style={{fontSize:11,padding:'2px 8px',borderRadius:20,background:'rgba(212,175,55,.15)',color:'#D4AF37',display:'flex',alignItems:'center',gap:4}}>{ICONS.visitor}{person.type||'visitor'}</span>
<span style={{color:'rgba(255,255,255,.35)',display:'flex',transform:expanded?'rotate(180deg)':'rotate(0deg)',transition:'transform .2s'}}>{ICONS.chevron}</span>
</div>
</div>

<div style={{color:'rgba(255,255,255,.5)',fontSize:13,marginTop:10,display:'flex',alignItems:'center',gap:4}}>{ICONS.phone}{person.phone||'No phone'}</div>

{!expanded&&person.last_attended_date&&<div style={{color:'rgba(255,255,255,.35)',fontSize:12,marginTop:6,display:'flex',alignItems:'center',gap:4}}>{ICONS.calendar}Last attended: {new Date(person.last_attended_date).toLocaleDateString()}</div>}
{expanded&&<div onClick={e=>e.stopPropagation()} style={{marginTop:16}}>
{explanation&&<div style={{fontSize:12,color:'rgba(255,255,255,.6)',marginBottom:10,fontStyle:'italic'}}>{explanation}</div>}

{person.birthday&&<div style={{color:'rgba(255,255,255,.4)',fontSize:12,marginBottom:6,display:'flex',alignItems:'center',gap:4}}>
<span style={{color:'#D4AF37',fontSize:10}}>●</span>
Birthday: {new Date(person.birthday).toLocaleDateString()}
<span style={{color:'rgba(255,255,255,.2)',fontSize:10,marginLeft:4}}>(in {getNextBirthday(person.birthday)} days)</span>
</div>}

{person.last_attended_date&&<div style={{color:'rgba(255,255,255,.4)',fontSize:12,marginBottom:6,display:'flex',alignItems:'center',gap:4}}>{ICONS.calendar}Last attended: {new Date(person.last_attended_date).toLocaleDateString()}</div>}

{person.last_contacted&&<div style={{color:'rgba(255,255,255,.4)',fontSize:12,marginBottom:10,display:'flex',alignItems:'center',gap:4}}>{ICONS.mail}Last contacted: {new Date(person.last_contacted).toLocaleDateString()}</div>}

<div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:10}}>
<button onClick={e=>{e.stopPropagation();generateDraft(person.id)}} className="fiducia-button fiducia-button-primary" style={{padding:'6px 12px',fontSize:12,display:'flex',alignItems:'center',gap:6}}>{ICONS.mail}Draft & Send WhatsApp</button>

<Link href={`/person/${person.id}`} onClick={e=>e.stopPropagation()} className="fiducia-button fiducia-button-secondary" style={{padding:'6px 12px',fontSize:12,display:'flex',alignItems:'center',gap:6}}>Journey →</Link>

<button onClick={e=>{e.stopPropagation();startEdit(person)}} className="fiducia-button fiducia-button-ghost" style={{padding:'6px 12px',fontSize:12,display:'flex',alignItems:'center',gap:6}}>{ICONS.edit}Edit</button>

<button onClick={e=>{e.stopPropagation();setAddingNote(true);setImportingConv(false)}} className="fiducia-button fiducia-button-ghost" style={{padding:'6px 12px',fontSize:12,display:'flex',alignItems:'center',gap:6}}>{ICONS.note}Add pastoral note</button>

<button onClick={e=>{e.stopPropagation();setImportingConv(true);setAddingNote(false)}} className="fiducia-button fiducia-button-ghost" style={{padding:'6px 12px',fontSize:12,display:'flex',alignItems:'center',gap:6}}>{ICONS.importIcon}Import Conversation</button>
</div>

<button onClick={e=>deletePerson(person.id,e)} className="fiducia-button fiducia-button-ghost danger-button" style={{padding:'6px 12px',fontSize:12,display:'flex',alignItems:'center',gap:6}}>{ICONS.trash}Remove</button>

{addingNote&&<div style={panelStyle}>
<p style={{fontSize:14,color:'rgba(255,255,255,.6)',margin:'0 0 8px'}}>What happened today?</p>
<div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:10}}>
{[
{icon:ICONS.prayer,label:'Asked for prayer'},
{icon:ICONS.heart,label:'First-time visitor'},
{icon:ICONS.smile,label:'Shared good news'},
{icon:ICONS.sick,label:'Sick or recovering'},
{icon:ICONS.family,label:'Family situation'},
{icon:ICONS.work,label:'Work or school'},
{icon:ICONS.other,label:'Other'}
].map(prompt=><button key={prompt.label} onClick={()=>setNoteText(prompt.label+': ')} style={{background:'rgba(255,255,255,.03)',border:'1px solid rgba(255,255,255,.08)',color:'#D4AF37',borderRadius:8,padding:'6px 12px',fontSize:11,cursor:'pointer'}}><span style={{display:'flex',alignItems:'center',gap:6}}>{prompt.icon}{prompt.label}</span></button>)}
</div>
<textarea value={noteText} onChange={e=>setNoteText(e.target.value)} placeholder="Add more details..." rows={3} style={textareaStyle}/>
<div style={{display:'flex',gap:8}}>
<button onClick={()=>saveNote(person)} className="fiducia-button fiducia-button-primary" style={{padding:'6px 12px',fontSize:12}}>Save</button>
<button onClick={()=>{setAddingNote(false);setNoteText('')}} className="fiducia-button fiducia-button-ghost" style={{padding:'6px 12px',fontSize:12}}>Cancel</button>
</div>
</div>}

{importingConv&&<div style={panelStyle}>
<p style={{fontSize:14,color:'rgba(255,255,255,.6)',margin:'0 0 8px'}}>Paste your WhatsApp, SMS, or notes conversation here.</p>
<textarea value={convText} onChange={e=>setConvText(e.target.value)} placeholder="Paste conversation..." rows={4} style={textareaStyle}/>
<div style={{display:'flex',gap:8}}>
<button onClick={()=>importConversation(person)} className="fiducia-button fiducia-button-primary" style={{padding:'6px 12px',fontSize:12}}>Parse & Save</button>
<button onClick={()=>{setImportingConv(false);setConvText('')}} className="fiducia-button fiducia-button-ghost" style={{padding:'6px 12px',fontSize:12}}>Cancel</button>
</div>
</div>}
</div>}
</>
}
</div>;
})}
</div>
</div>

{showPicker&&<BirthdayPicker
isOpen={true}
value={pickerTarget==='add'?form.birthday:editBirthday}
onSave={date=>{
if(pickerTarget==='add')setForm({...form,birthday:date});
else setEditBirthday(date||'');
setShowPicker(false);
}}
onCancel={()=>setShowPicker(false)}
/>}

<style jsx>{`
@keyframes pulse{0%{opacity:.4;transform:scale(1)}50%{opacity:1;transform:scale(1.1)}100%{opacity:.4;transform:scale(1)}}
.shimmer{background:linear-gradient(110deg,rgba(255,255,255,.02) 25%,rgba(255,255,255,.05) 50%,rgba(255,255,255,.02) 75%);background-size:200% 100%;animation:shimmer 4s ease-in-out infinite}
@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
.review-panel-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(8px);z-index:1000;display:flex;align-items:center;justify-content:center}
.review-panel{background:#141c2b;border-radius:20px;padding:24px;max-width:700px;width:90%;max-height:80vh;overflow-y:auto;border:1px solid rgba(255,255,255,.05)}
.review-item{padding:12px 16px;background:rgba(255,255,255,.02);border-radius:8px;border:1px solid rgba(255,255,255,.05);display:flex;justify-content:space-between;align-items:center;gap:12px}
.fiducia-card{background:rgba(20,25,40,.9);border-radius:26px;border:1px solid rgba(255,255,255,.05);box-shadow:inset 0 0 10px rgba(212,175,55,.03);transition:border-color .25s ease,box-shadow .25s ease,transform .15s ease;padding:24px;margin-bottom:18px;animation:cardBreathe 20s ease-in-out infinite alternate}
.fiducia-card:hover{border-color:rgba(255,255,255,.09)}
.fiducia-card.expanded-card{border-color:rgba(212,175,55,.12);box-shadow:inset 0 0 15px rgba(212,175,55,.045)}
@keyframes cardBreathe{0%{box-shadow:inset 0 0 10px rgba(212,175,55,.03)}100%{box-shadow:inset 0 0 14px rgba(212,175,55,.06)}}
.fiducia-button{padding:12px 24px;border-radius:30px;font-weight:500;font-size:15px;cursor:pointer;transition:background .2s,box-shadow .2s,transform .1s;display:inline-block;text-decoration:none;text-align:center;user-select:none;border:1px solid transparent}
.fiducia-button-primary{background:rgba(212,175,55,.1);border-color:rgba(212,175,55,.2);color:#D4AF37}
.fiducia-button-secondary{background:rgba(59,130,246,.1);border-color:rgba(59,130,246,.2);color:#60A5FA}
.fiducia-button-ghost{background:transparent;border-color:rgba(255,255,255,.1);color:rgba(255,255,255,.6)}
.fiducia-button-primary:active{background:rgba(212,175,55,.2);box-shadow:0 0 18px rgba(212,175,55,.12);transform:scale(.98)}
.fiducia-button-secondary:active{background:rgba(59,130,246,.2);box-shadow:0 0 18px rgba(59,130,246,.12);transform:scale(.98)}
.fiducia-button-ghost:active{background:rgba(255,255,255,.05);box-shadow:0 0 10px rgba(255,255,255,.05);transform:scale(.98)}
.danger-button{color:#EF4444;border-color:rgba(239,68,68,.15)}
.add-form{padding:20px;display:flex;flex-direction:column;gap:10px}
.empty-state{grid-column:1/-1;text-align:center;padding:70px 20px;border:1px dashed rgba(255,255,255,.07);border-radius:26px;background:rgba(20,25,40,.35)}
@media(max-width:600px){
.fiducia-card{padding:20px;border-radius:22px}
.review-item{align-items:flex-start;flex-direction:column}
}
`}</style>
</Layout>;
}
