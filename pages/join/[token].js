// pages/join/[token].js
import {useEffect,useState} from 'react';
import {useRouter} from 'next/router';
import {supabase} from '../../lib/supabaseClient';

export default function JoinPage(){
  const router=useRouter();
  const{token}=router.query;
  const[state,setState]=useState('loading');
  const[data,setData]=useState(null);
  const[error,setError]=useState('');
  const[email,setEmail]=useState('');
  const[password,setPassword]=useState('');
  const[show,setShow]=useState(false);

  useEffect(()=>{if(!token)return;fetch(`/api/invites/${token}`).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);setData(d);setState('ready')}).catch(e=>{setError(e.message);setState('error')})},[token]);

  const join=async()=>{
    setError('');
    if(password.length<6)return setError('Password must be at least 6 characters.');
    try{
      let auth=await supabase.auth.signInWithPassword({email:email.trim(),password});
      if(auth.error){
        const signup=await supabase.auth.signUp({email:email.trim(),password});
        if(signup.error)throw signup.error;
        if(!signup.data.session)return setError('Check your email to confirm your account, then open this invitation again.');
        auth=signup;
      }
      const session=auth.data.session;
      if(!session)throw new Error('Please sign in to continue.');
      const r=await fetch('/api/users/join',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({token})});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error);
      setState('joined');
      setData(d);
      setTimeout(()=>router.replace('/'),1000);
    }catch(e){setError(e.message||'Unable to join.')}
  };

  return <div className="page"><div className="glow"/><main className="card">
    {state==='loading'&&<div className="center">Opening invitation…</div>}
    {state==='error'&&<><div className="mark">×</div><h1>Invitation unavailable</h1><p>{error}</p></>}
    {state==='ready'&&<><div className="mark">N</div><div className="eyebrow">YOU'RE INVITED</div><h1>Join {data.organization_name}</h1><p>You've been invited to become a <strong>{data.role==='admin'?'Admin':'User'}</strong>. Use your own NYEOCARE account. Your account stays yours.</p><input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Your email" type="email" autoComplete="email"/><div className="password"><input value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" type={show?'text':'password'} autoComplete="current-password"/><button onClick={()=>setShow(!show)}>{show?'Hide':'Show'}</button></div>{error&&<div className="error">{error}</div>}<button className="primary" onClick={join} disabled={!email||!password}>Continue</button><small>New here? Your account will be created automatically.</small></>}
    {state==='joined'&&<><div className="success">✓</div><h1>You're in.</h1><p>Welcome to {data.organization_name}.</p></>}
  </main><style jsx>{`
    *{box-sizing:border-box}.page{min-height:100vh;background:#050a14;color:#eef4ff;display:flex;align-items:center;justify-content:center;padding:20px;font-family:system-ui,-apple-system,sans-serif;position:relative;overflow:hidden}.glow{position:fixed;width:500px;height:500px;border-radius:50%;background:rgba(44,105,180,.12);filter:blur(100px)}.card{position:relative;width:100%;max-width:430px;padding:34px 26px;border:1px solid rgba(220,235,250,.14);border-radius:30px;background:rgba(17,29,47,.72);backdrop-filter:blur(24px);box-shadow:0 30px 90px rgba(0,0,0,.35);text-align:center}.mark,.success{width:58px;height:58px;margin:0 auto 22px;border-radius:50%;display:grid;place-items:center;background:rgba(212,175,55,.1);border:1px solid rgba(212,175,55,.35);color:#f3df9c;font-weight:700;font-size:22px}.success{color:#8ff0c4;border-color:rgba(52,211,153,.3);background:rgba(52,211,153,.08)}.eyebrow{font-size:11px;letter-spacing:.16em;color:#8fb7ff;margin-bottom:10px}.card h1{font-size:28px;margin:0 0 12px}.card p{color:rgba(235,241,250,.62);line-height:1.65;margin:0 0 24px}.card strong{color:#f3df9c;font-weight:500}.card input{width:100%;height:50px;border-radius:16px;border:1px solid rgba(220,235,250,.13);background:rgba(255,255,255,.045);color:white;padding:0 15px;outline:none;margin-bottom:10px}.password{position:relative}.password input{padding-right:65px}.password button{position:absolute;right:8px;top:7px;height:36px;border:0;background:transparent;color:#d4af37}.primary{width:100%;height:50px;border:1px solid rgba(212,175,55,.3);border-radius:18px;background:rgba(212,175,55,.13);color:#f3df9c;font-size:15px;margin-top:8px}.primary:disabled{opacity:.4}.card small{display:block;margin-top:15px;color:rgba(255,255,255,.3)}.error{font-size:13px;color:#ff9d9d;margin:8px 0}.center{color:rgba(255,255,255,.5)}
  `}</style></div>
}
