// pages/profile.js
import { useEffect,useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import { supabase } from '../lib/supabaseClient';

export default function ProfilePage(){
  const router=useRouter();
  const [profile,setProfile]=useState(null);
  const [name,setName]=useState('');
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{
    let mounted=true;
    async function load(){
      try{
        const {data:{session}}=await supabase.auth.getSession();
        if(!session){
          router.replace('/login');
          return;
        }
        const res=await fetch('/api/profile',{headers:{Authorization:`Bearer ${session.access_token}`}});
        const data=await res.json();
        if(!res.ok) throw new Error(data.error||'Unable to load profile');
        if(mounted){
          setProfile(data);
          setName(data.name||'');
        }
      }catch(err){
        console.error('[PROFILE] Load error:',err);
        if(mounted)setError(err.message||'Unable to load profile');
      }finally{
        if(mounted)setLoading(false);
      }
    }
    load();
    return()=>{mounted=false};
  },[router]);

  const save=async()=>{
    const trimmed=name.trim();
    if(!trimmed)return;
    setSaving(true);
    setSaved(false);
    setError('');
    try{
      const {data:{session}}=await supabase.auth.getSession();
      if(!session){
        router.replace('/login');
        return;
      }
      const res=await fetch('/api/profile',{
        method:'PUT',
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},
        body:JSON.stringify({name:trimmed})
      });
      const data=await res.json();
      if(!res.ok)throw new Error(data.error||'Unable to save profile');
      setProfile(data);
      setName(data.name||'');
      setSaved(true);
      setTimeout(()=>setSaved(false),2000);
    }catch(err){
      console.error('[PROFILE] Save error:',err);
      setError(err.message||'Unable to save profile');
    }finally{
      setSaving(false);
    }
  };

  const signOut=async()=>{
    await supabase.auth.signOut();
    router.replace('/login');
  };

  if(loading)return <Layout><div style={styles.wrap}><div style={styles.muted}>Loading profile…</div></div></Layout>;

  if(error&&!profile)return <Layout><div style={styles.wrap}><div style={styles.title}>Profile</div><div style={styles.error}>{error}</div></div></Layout>;

  return(
    <Layout>
      <div style={styles.wrap}>
        <div style={styles.title}>Profile</div>
        <div style={styles.subtitle}>Your account and access information.</div>

        <section className="fiducia-card" style={styles.card}>
          <div style={styles.avatar}>{(profile?.name||profile?.email||'U').charAt(0).toUpperCase()}</div>
          <div style={styles.identity}>
            <div style={styles.name}>{profile?.name||'Unnamed user'}</div>
            <div style={styles.email}>{profile?.email}</div>
          </div>
          <div style={styles.role}>{profile?.role||'user'}</div>
        </section>

        <section className="fiducia-card" style={styles.card}>
          <div style={styles.sectionTitle}>Personal information</div>
          <label style={styles.label}>Name</label>
          <input value={name} onChange={e=>setName(e.target.value)} style={styles.input} maxLength={120}/>
          <label style={styles.label}>Email</label>
          <input value={profile?.email||''} disabled style={{...styles.input,opacity:.55,cursor:'not-allowed'}}/>
          <button onClick={save} disabled={saving||!name.trim()||name.trim()===profile?.name} className="fiducia-button fiducia-button-primary" style={styles.button}>
            {saved?'Saved ✓':saving?'Saving…':'Save changes'}
          </button>
          {error&&<div style={styles.error}>{error}</div>}
        </section>

        <section className="fiducia-card" style={styles.card}>
          <div style={styles.sectionTitle}>Organization</div>
          <div style={styles.row}><span>Organization</span><strong>{profile?.organization?.name||'—'}</strong></div>
          <div style={styles.row}><span>Your role</span><strong style={{textTransform:'capitalize'}}>{profile?.role||'—'}</strong></div>
          <div style={styles.row}><span>Member since</span><strong>{profile?.created_at?new Date(profile.created_at).toLocaleDateString(): '—'}</strong></div>
        </section>

        <section className="fiducia-card" style={styles.card}>
          <div style={styles.sectionTitle}>Account</div>
          <button onClick={signOut} className="fiducia-button fiducia-button-ghost" style={styles.button}>Sign out</button>
        </section>
      </div>
    </Layout>
  );
}

const styles={
  wrap:{maxWidth:700,margin:'0 auto',padding:'40px 20px'},
  title:{fontSize:30,fontWeight:600,color:'#f0f0f0',marginBottom:8},
  subtitle:{fontSize:15,color:'rgba(255,255,255,.45)',marginBottom:30},
  card:{padding:24,marginBottom:18},
  avatar:{width:58,height:58,borderRadius:'50%',background:'rgba(212,175,55,.12)',border:'1px solid rgba(212,175,55,.25)',display:'flex',alignItems:'center',justifyContent:'center',color:'#D4AF37',fontSize:23,fontWeight:600,flexShrink:0},
  identity:{flex:1,minWidth:0},
  name:{color:'#f0f0f0',fontSize:19,fontWeight:600,marginBottom:5},
  email:{color:'rgba(255,255,255,.45)',fontSize:14,overflow:'hidden',textOverflow:'ellipsis'},
  role:{padding:'6px 10px',borderRadius:20,background:'rgba(255,255,255,.06)',color:'rgba(255,255,255,.65)',fontSize:12,textTransform:'capitalize'},
  sectionTitle:{color:'#D4AF37',fontSize:14,fontWeight:600,letterSpacing:'.05em',marginBottom:20},
  label:{display:'block',color:'rgba(255,255,255,.5)',fontSize:13,margin:'0 0 7px'},
  input:{width:'100%',boxSizing:'border-box',padding:'12px 14px',borderRadius:10,border:'1px solid rgba(255,255,255,.08)',background:'rgba(255,255,255,.03)',color:'#fff',outline:'none',fontSize:15,marginBottom:16},
  button:{width:'100%',marginTop:4},
  row:{display:'flex',justifyContent:'space-between',alignItems:'center',gap:20,padding:'13px 0',borderBottom:'1px solid rgba(255,255,255,.06)',color:'rgba(255,255,255,.45)',fontSize:14},
  muted:{color:'rgba(255,255,255,.5)',paddingTop:20},
  error:{color:'#ff8f8f',fontSize:13,marginTop:12}
};
