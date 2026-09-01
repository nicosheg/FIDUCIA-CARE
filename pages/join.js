// pages/join.js
import {useEffect,useState} from 'react';
import {useRouter} from 'next/router';
import Layout from '../components/Layout';
import {supabase} from '../lib/supabaseClient';

export default function JoinPage(){
  const router=useRouter();
  const [invite,setInvite]=useState(null);
  const [loading,setLoading]=useState(true);
  const [working,setWorking]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{
    if(!router.isReady)return;
    const token=typeof router.query.token==='string'?router.query.token:'';
    if(!token){setError('This invitation link is incomplete.');setLoading(false);return;}
    fetch(`/api/profile/invite?token=${encodeURIComponent(token)}`)
      .then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||'Invitation unavailable');return d;})
      .then(setInvite)
      .catch(e=>setError(e.message))
      .finally(()=>setLoading(false));
  },[router.isReady,router.query.token]);

  const accept=async()=>{
    setWorking(true);setError('');
    try{
      const {data:{session}}=await supabase.auth.getSession();
      if(!session){
        router.push(`/login?redirect=${encodeURIComponent(router.asPath)}`);
        return;
      }
      const token=typeof router.query.token==='string'?router.query.token:'';
      const res=await fetch('/api/profile/invite',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({token})});
      const data=await res.json();
      if(!res.ok)throw new Error(data.error||'Unable to join organization');
      router.replace('/');
    }catch(e){setError(e.message);setWorking(false);}
  };

  return <Layout><div style={{maxWidth:560,margin:'0 auto',padding:'70px 20px'}}><div className="fiducia-card" style={{padding:30,textAlign:'center'}}>
    {loading?<><div style={{fontSize:18,color:'#f0f0f0'}}>Checking invitation…</div></>:error?<><div style={{fontSize:22,color:'#f0f0f0',marginBottom:10}}>Invitation unavailable</div><p style={{color:'rgba(255,255,255,.55)',lineHeight:1.6}}>{error}</p></>:invite?<><div style={{fontSize:12,color:'#D4AF37',fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',marginBottom:10}}>NYEOCARE</div><h1 style={{fontSize:28,color:'#f0f0f0',margin:'0 0 12px'}}>You're invited</h1><p style={{color:'rgba(255,255,255,.6)',lineHeight:1.6}}>Join <strong style={{color:'#f0f0f0'}}>{invite.organization_name}</strong> as an <strong style={{color:'#f0f0f0'}}>{invite.role}</strong>.</p><p style={{fontSize:13,color:'rgba(255,255,255,.4)'}}>{invite.email}</p>{error&&<p style={{color:'#ff8b8b'}}>{error}</p>}<button onClick={accept} disabled={working} className="fiducia-button fiducia-button-primary" style={{width:'100%',marginTop:18}}>{working?'Joining…':'Accept invitation'}</button></>:null}
  </div></div></Layout>;
}
