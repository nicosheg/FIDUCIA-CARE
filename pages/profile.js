// pages/profile.js
import {useEffect,useState} from 'react';
import {useRouter} from 'next/router';
import Layout from '../components/Layout';
import FirstExperience from '../components/FirstExperience';
import {useOnboarding} from '../components/OnboardingProvider';
import {supabase} from '../lib/supabaseClient';

const roleLabel=r=>r==='owner'?'Owner':r==='admin'?'Admin':'User';
const initials=n=>(n||'?').trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();

export default function ProfilePage(){
  const router=useRouter();
  const onboarding=useOnboarding();
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [name,setName]=useState('');
  const [orgName,setOrgName]=useState('');
  const [aria,setAria]=useState('');
  const [inviteEmail,setInviteEmail]=useState('');
  const [inviteRole,setInviteRole]=useState('user');
  const [inviteUrl,setInviteUrl]=useState('');
  const [saving,setSaving]=useState('');
  const [password,setPassword]=useState('');
  const [passwordMessage,setPasswordMessage]=useState('');

  const load=async()=>{
    setLoading(true);setError('');
    try{
      const {data:{session}}=await supabase.auth.getSession();
      if(!session){router.replace('/login');return;}
      const res=await fetch('/api/profile',{headers:{Authorization:`Bearer ${session.access_token}`}});
      const d=await res.json();
      if(!res.ok)throw new Error(d.error||'Unable to load profile');
      setData(d);setName(d.user.name||'');setOrgName(d.organization.name||'');setAria(d.organization.ariaInstructions||'');
    }catch(e){setError(e.message);}
    finally{setLoading(false);}
  };

  useEffect(()=>{load();},[]);

  const save=async(action,body)=>{
    setSaving(action);
    try{
      const {data:{session}}=await supabase.auth.getSession();
      const res=await fetch('/api/profile',{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({action,...body})});
      const d=await res.json();
      if(!res.ok)throw new Error(d.error||'Unable to save');
      await load();
    }catch(e){setError(e.message);}
    finally{setSaving('');}
  };

  const invite=async()=>{
    setSaving('invite');setInviteUrl('');
    try{
      const {data:{session}}=await supabase.auth.getSession();
      const res=await fetch('/api/profile',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({action:'create_invite',email:inviteEmail,role:inviteRole})});
      const d=await res.json();
      if(!res.ok)throw new Error(d.error||'Unable to create invitation');
      setInviteUrl(d.inviteUrl);setInviteEmail('');
      await load();
    }catch(e){setError(e.message);}
    finally{setSaving('');}
  };

  const changePassword=async()=>{
    setPasswordMessage('');
    if(password.length<6){setPasswordMessage('Password must be at least 6 characters.');return;}
    setSaving('password');
    const {error:e}=await supabase.auth.updateUser({password});
    setSaving('');
    if(e)setPasswordMessage(e.message);
    else{setPassword('');setPasswordMessage('Password updated.');}
  };

  const signOut=async()=>{await supabase.auth.signOut();router.replace('/login');};

  const showExperience=onboarding?.loaded&&onboarding.enabled&&!onboarding.isExperienced('profile');

  if(loading)return <Layout><div style={{maxWidth:700,margin:'0 auto',padding:'70px 20px',color:'rgba(255,255,255,.55)'}}>Loading profile…</div></Layout>;
  if(error&&!data)return <Layout><div style={{maxWidth:700,margin:'0 auto',padding:'70px 20px',color:'#ff8b8b'}}>{error}</div></Layout>;

  const u=data.user,o=data.organization,isOwner=u.role==='owner',canInvite=u.role!=='user';

  return <Layout><div style={{maxWidth:760,margin:'0 auto',padding:'38px 20px 70px'}}>
    {showExperience&&<FirstExperience experience="profile" onComplete={()=>onboarding.completeExperience('profile')}/>}
    {error&&<div style={{padding:'12px 15px',borderRadius:12,background:'rgba(255,100,100,.08)',color:'#ff9b9b',marginBottom:18}}>{error}</div>}

    <div style={{display:'flex',alignItems:'center',gap:18,marginBottom:34}}>
      <div style={{width:70,height:70,borderRadius:'50%',display:'grid',placeItems:'center',background:'rgba(0,200,255,.1)',border:'1px solid rgba(0,200,255,.2)',color:'#5ddcff',fontSize:23,fontWeight:600}}>{initials(u.name)}</div>
      <div style={{minWidth:0}}><h1 style={{margin:0,color:'#f4f4f4',fontSize:30,fontWeight:600}}>{u.name||'Your Profile'}</h1><div style={{marginTop:5,color:'rgba(255,255,255,.5)'}}>{roleLabel(u.role)} · {u.email}</div><div style={{marginTop:4,color:'#5ddcff',fontSize:14}}>{o.name}</div></div>
    </div>

    <Section title="Personal information">
      <Field label="Full name"><input value={name} onChange={e=>setName(e.target.value)} /></Field>
      <Field label="Email"><input value={u.email||''} disabled /></Field>
      <Field label="Role"><input value={roleLabel(u.role)} disabled /></Field>
      <button onClick={()=>save('personal',{name})} disabled={saving==='personal'} className="fiducia-button fiducia-button-primary">{saving==='personal'?'Saving…':'Save personal information'}</button>
    </Section>

    <Section title="Organization">
      <Field label="Organization name"><input value={orgName} onChange={e=>setOrgName(e.target.value)} disabled={!isOwner}/></Field>
      <div style={{fontSize:13,color:'rgba(255,255,255,.4)',marginBottom:18}}>{isOwner?'Only the owner can change the organization name.':'Only the organization owner can change the organization name.'}</div>
      {isOwner&&<button onClick={()=>save('organization',{organizationName:orgName})} disabled={saving==='organization'} className="fiducia-button fiducia-button-primary" style={{marginBottom:24}}>{saving==='organization'?'Saving…':'Save organization'}</button>}
      <div style={{borderTop:'1px solid rgba(255,255,255,.06)',paddingTop:22}}>
        <div style={{color:'#D4AF37',fontSize:12,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',marginBottom:8}}>ARIA</div>
        <h3 style={{color:'#f0f0f0',margin:'0 0 7px',fontSize:19}}>Tell ARIA about your organization</h3>
        <p style={{color:'rgba(255,255,255,.5)',lineHeight:1.6,marginTop:0}}>Give ARIA context about what matters to your organization so its observations and care can be more relevant.</p>
        <textarea value={aria} onChange={e=>setAria(e.target.value)} maxLength={2000} placeholder="Tell ARIA what matters most to your organization…" />
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:10}}><span style={{fontSize:12,color:'rgba(255,255,255,.3)'}}>{aria.length}/2000</span><button onClick={()=>save('aria',{ariaInstructions:aria})} disabled={saving==='aria'} className="fiducia-button fiducia-button-primary">{saving==='aria'?'Saving…':'Save for ARIA'}</button></div>
      </div>
    </Section>

    <Section title="Users with access">
      {canInvite&&<div style={{marginBottom:24}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 120px',gap:10,marginBottom:10}}>
          <input value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} placeholder="Email address" />
          <select value={inviteRole} onChange={e=>setInviteRole(e.target.value)}><option value="user">User</option><option value="admin">Admin</option>{isOwner&&<option value="owner">Owner</option>}</select>
        </div>
        <button onClick={invite} disabled={saving==='invite'||!inviteEmail} className="fiducia-button fiducia-button-primary">{saving==='invite'?'Creating link…':'Create invitation link'}</button>
        {inviteUrl&&<div style={{marginTop:14,padding:14,borderRadius:12,background:'rgba(0,200,255,.05)',border:'1px solid rgba(0,200,255,.12)'}}><div style={{fontSize:12,color:'rgba(255,255,255,.4)',marginBottom:7}}>ONE-TIME INVITATION LINK · EXPIRES IN 48 HOURS</div><input readOnly value={inviteUrl} onFocus={e=>e.target.select()} /></div>}
      </div>}
      <div style={{display:'grid',gap:10}}>{data.users.map(x=><div key={x.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'14px 0',borderTop:'1px solid rgba(255,255,255,.05)'}}><div><div style={{color:'#f0f0f0',fontWeight:500}}>{x.name||x.email}</div><div style={{color:'rgba(255,255,255,.4)',fontSize:13,marginTop:3}}>{x.email}</div></div><span style={{fontSize:12,color:x.role==='owner'?'#D4AF37':'rgba(255,255,255,.5)'}}>{roleLabel(x.role)}</span></div>)}</div>
    </Section>

    <Section title="Account & security">
      <Field label="New password"><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="At least 6 characters" /></Field>
      {passwordMessage&&<div style={{fontSize:13,color:passwordMessage==='Password updated.'?'#7ee2a8':'#ff9b9b',marginBottom:14}}>{passwordMessage}</div>}
      <button onClick={changePassword} disabled={saving==='password'} className="fiducia-button fiducia-button-primary">{saving==='password'?'Updating…':'Change password'}</button>
      <button onClick={signOut} className="fiducia-button fiducia-button-ghost" style={{marginTop:12,width:'100%'}}>Sign out</button>
    </Section>

    <Section title="Preferences">
      <div style={{padding:'4px 0',color:'rgba(255,255,255,.5)',lineHeight:1.6}}>Appearance and personal notification preferences can live here as NYEOCARE expands them.</div>
    </Section>

    <style jsx>{`
      input,select,textarea{box-sizing:border-box;width:100%;padding:12px 14px;border-radius:11px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);color:#fff;outline:none;font:inherit}
      input:focus,select:focus,textarea:focus{border-color:rgba(0,200,255,.35)}
      input:disabled{opacity:.55}
      textarea{min-height:125px;resize:vertical;line-height:1.6}
      select option{background:#111923;color:#fff}
      @media(max-width:560px){div[style*="grid-template-columns:1fr 120px"]{grid-template-columns:1fr!important}}
    `}</style>
  </div></Layout>;
}

function Section({title,children}){return <section className="fiducia-card" style={{padding:24,marginBottom:20}}><h2 style={{fontSize:20,fontWeight:500,color:'#f0f0f0',margin:'0 0 20px'}}>{title}</h2>{children}</section>}
function Field({label,children}){return <div style={{marginBottom:16}}><label style={{display:'block',fontSize:13,color:'rgba(255,255,255,.45)',marginBottom:7}}>{label}</label>{children}</div>}
