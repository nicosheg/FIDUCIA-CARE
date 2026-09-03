// pages/person/[id].js
import {useRouter} from 'next/router';
import {useEffect,useState} from 'react';
import Layout from '../../components/Layout';
import {supabase} from '../../lib/supabaseClient';

const title=p=>[p?.first_name,p?.last_name].filter(Boolean).join(' ')||p?.display_name||'Person';
const date=v=>v?new Date(v).toLocaleDateString():null;

export default function PersonStory(){
const router=useRouter(),{id}=router.query;
const [person,setPerson]=useState(null),[token,setToken]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
useEffect(()=>{supabase.auth.getSession().then(({data:{session}})=>{if(!session){setLoading(false);return}setToken(session.access_token)})},[]);
useEffect(()=>{if(!id||!token)return;fetch(`/api/people/operating-system?resource=profile&person_id=${encodeURIComponent(id)}`,{headers:{Authorization:`Bearer ${token}`}}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||'Unable to load person');setPerson(d)}).catch(e=>setError(e.message)).finally(()=>setLoading(false))},[id,token]);
if(loading)return <Layout><div style={wrap}>Loading person…</div></Layout>;
if(error)return <Layout><div style={wrap}>{error}</div></Layout>;
if(!person)return <Layout><div style={wrap}>Person not found.</div></Layout>;
return <Layout><div style={wrap}>
<div style={header}><div style={avatar}>{(person.first_name||person.display_name||'?')[0]}{person.last_name?.[0]||''}</div><div><h1 style={name}>{title(person)}</h1><div style={muted}>{person.phone||'No phone'}{person.email?` · ${person.email}`:''}</div></div></div>
<div style={grid}>
<Section title="Identity"><Item k="Type" v={person.type}/><Item k="Status" v={person.status}/><Item k="Birthday" v={date(person.birthday)}/><Item k="Source" v={person.source}/></Section>
<Section title="ARIA"><Item k="Lifecycle" v={person.intelligence_lifecycle||'—'}/><Item k="Engagement" v={person.engagement_score==null?'—':`${person.engagement_score}/100`}/><Item k="Churn" v={person.churn_probability==null?'—':`${Math.round(Number(person.churn_probability)*100)}%`}/><Item k="Attention" v={person.attention_level||'—'}/><Item k="Next best action" v={person.next_best_action||'—'}/></Section>
<Section title="Roles">{person.roles?.length?person.roles.map(x=><div key={x.id} style={row}><b>{x.role}</b><span style={muted}>{x.status}</span></div>):<Empty/>}</Section>
<Section title="Groups & Memberships">{person.groups?.length?person.groups.map(x=><div key={x.id} style={row}><b>{x.name}</b><span style={muted}>{x.group_type}{x.membership_role?` · ${x.membership_role}`:''}</span></div>):<Empty/>}</Section>
<Section title="Relationships">{person.relationships?.length?person.relationships.map(x=><div key={x.id} style={row}><b>{title({first_name:x.related_first_name,last_name:x.related_last_name,display_name:x.related_display_name})}</b><span style={muted}>{x.relationship_type}</span></div>):<Empty/>}</Section>
<Section title="Custom Fields">{person.fields?.length?person.fields.map(x=><div key={x.id} style={row}><b>{x.field_name}</b><span style={muted}>{typeof x.value==='object'?JSON.stringify(x.value):String(x.value??'—')}</span></div>):<Empty/>}</Section>
<Section title="Lifecycle History">{person.lifecycle?.length?person.lifecycle.map(x=><div key={x.id} style={row}><b>{x.stage_name}</b><span style={muted}>{date(x.started_at)}{x.ended_at?` → ${date(x.ended_at)}`:' · current'}</span></div>):<Empty/>}</Section>
<Section title="Tasks">{person.tasks?.length?person.tasks.map(x=><div key={x.id} style={row}><b>{x.title}</b><span style={muted}>{x.status}{x.due_at?` · ${date(x.due_at)}`:''}</span></div>):<Empty/>}</Section>
<Section title="Financial Records">{person.financial?.length?person.financial.map(x=><div key={x.id} style={row}><b>{x.record_type}</b><span style={muted}>{x.amount==null?'':`${x.currency} ${x.amount}`} · {x.status}</span></div>):<Empty/>}</Section>
<Section title="Documents">{person.documents?.length?person.documents.map(x=><div key={x.id} style={row}><b>{x.name}</b><span style={muted}>{x.document_type}{x.expires_at?` · expires ${date(x.expires_at)}`:''}</span></div>):<Empty/>}</Section>
<Section title="Communications">{person.communications?.length?person.communications.map(x=><div key={x.id} style={row}><b>{x.channel}</b><span style={muted}>{x.direction} · {x.status} · {date(x.occurred_at)}</span></div>):<Empty/>}</Section>
<Section title="Journey" wide>{person.timeline?.length?person.timeline.map(x=><div key={x.id} style={timeline}><b>{x.title||x.event_type}</b><div style={muted}>{x.description}</div><small style={muted}>{date(x.occurred_at||x.created_at)}</small></div>):<Empty/>}</Section>
</div></div></Layout>
}

function Section({title,children,wide}){return <section style={{...card,gridColumn:wide?'1/-1':'auto'}}><h2 style={sectionTitle}>{title}</h2>{children}</section>}
function Item({k,v}){return <div style={row}><b>{k}</b><span style={muted}>{v||'—'}</span></div>}
function Empty(){return <div style={muted}>Nothing recorded yet.</div>}
const wrap={maxWidth:1100,margin:'0 auto',padding:'30px 20px',color:'#f0f0f0'},header={display:'flex',alignItems:'center',gap:16,marginBottom:24},avatar={width:64,height:64,borderRadius:'50%',background:'rgba(212,175,55,.16)',display:'flex',alignItems:'center',justifyContent:'center',color:'#D4AF37',fontSize:24,fontWeight:700},name={margin:0,fontSize:28},muted={color:'rgba(255,255,255,.55)',fontSize:13},grid={display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:14},card={background:'rgba(20,25,40,.72)',border:'1px solid rgba(255,255,255,.06)',borderRadius:16,padding:18},sectionTitle={margin:'0 0 14px',fontSize:16,color:'#D4AF37'},row={display:'flex',justifyContent:'space-between',gap:16,padding:'8px 0',borderBottom:'1px solid rgba(255,255,255,.04)'},timeline={padding:'10px 0',borderBottom:'1px solid rgba(255,255,255,.05)',display:'grid',gap:4};
