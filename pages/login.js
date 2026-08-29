// pages/login.js
// Nyeo Auth Entry — authentication only.
// IMPORTANT: Auth identifies the user. Organization/onboarding provisioning is handled separately.
import { useState,useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useRouter } from 'next/router';

function getErrorMessage(error){
  if(typeof error==='string')return error;
  if(error?.message)return error.message;
  if(error?.error_description)return error.error_description;
  if(error&&typeof error==='object'&&!Object.keys(error).length)return 'Something went wrong. Please try again.';
  return 'An unexpected error occurred.';
}

export default function Login(){
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState('');
  const [isLogin,setIsLogin]=useState(true);
  const [name,setName]=useState('');
  const router=useRouter();

  useEffect(()=>{
    let mounted=true;
    supabase.auth.getSession().then(({data:{session}})=>{
      if(mounted&&session) router.replace('/onboarding');
    });
    return()=>{mounted=false;};
  },[router]);

  const handleLogin=async e=>{
    e.preventDefault();
    setLoading(true);setMessage('');
    const {error}=await supabase.auth.signInWithPassword({email:email.trim(),password});
    if(error)setMessage(getErrorMessage(error));
    else router.replace('/onboarding');
    setLoading(false);
  };

  const handleSignup=async e=>{
    e.preventDefault();
    setLoading(true);setMessage('');
    const cleanName=name.trim(),cleanEmail=email.trim();
    if(!cleanName){setMessage('Please enter your name.');setLoading(false);return;}
    const {data,error}=await supabase.auth.signUp({
      email:cleanEmail,password,
      options:{data:{name:cleanName}}
    });
    if(error){
      const text=error.message?.toLowerCase()||'';
      if(text.includes('already registered')||error.code==='user_already_exists')setMessage('This email is already registered. Please log in instead.');
      else if(text.includes('rate limit')||text.includes('rate_limited'))setMessage('You’ve been temporarily rate-limited. Please wait a moment and try again.');
      else setMessage(getErrorMessage(error));
    }else if(data?.session){
      router.replace('/onboarding');
    }else{
      setMessage('Account created. Check your email to verify your account, then continue.');
      setTimeout(()=>setIsLogin(true),2000);
    }
    setLoading(false);
  };

  const handleMagicLink=async()=>{
    const cleanEmail=email.trim();
    if(!cleanEmail){setMessage('Please enter your email first.');return;}
    setLoading(true);setMessage('');
    const {error}=await supabase.auth.signInWithOtp({
      email:cleanEmail,
      options:{emailRedirectTo:`${window.location.origin}/onboarding`}
    });
    if(error){
      if(error.message?.toLowerCase().includes('rate limit'))setMessage('Rate limit exceeded. Please wait a moment before requesting another magic link.');
      else setMessage(getErrorMessage(error));
    }else setMessage('📨 Check your email — I’ve sent you a way in.');
    setLoading(false);
  };

  const switchMode=()=>{
    setMessage('');setIsLogin(v=>!v);setPassword('');
  };

  return(
    <div className="auth-container">
      <div className="auth-canvas"><div className="auth-ambient"/></div>
      <div className="auth-panel">
        <div className="auth-brand">
          <span className="auth-wordmark">NYEO</span>
          <span className="auth-tagline">Every Person. Every Story. Remembered.</span>
        </div>
        <p className="auth-welcome">{isLogin?'Welcome back. Sign in to continue.':'Welcome. Let’s build your space.'}</p>
        <form onSubmit={isLogin?handleLogin:handleSignup} className="auth-form">
          {!isLogin&&<input type="text" placeholder="Full Name" value={name} onChange={e=>setName(e.target.value)} required className="auth-input" autoComplete="name"/>}
          <input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} required className="auth-input" autoComplete="email"/>
          <input type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} required className="auth-input" autoComplete={isLogin?'current-password':'new-password'}/>
          <button type="submit" disabled={loading} className="auth-button">{loading?(isLogin?'Signing in...':'Creating your space...'):(isLogin?'Sign In':'Create Account')}</button>
        </form>
        <div className="auth-divider">— or —</div>
        <button onClick={handleMagicLink} disabled={loading} className="auth-magic">Send Magic Link</button>
        {message&&<p className={`auth-message ${message.startsWith('📨')||message.startsWith('Account created')?'success':'error'}`}>{message}</p>}
        <p className="auth-toggle">{isLogin?<>Don’t have an account? <span onClick={switchMode} className="auth-toggle-link">Create one</span></>:<>Already have an account? <span onClick={switchMode} className="auth-toggle-link">Log in</span></>}</p>
      </div>
      <style jsx>{`
        .auth-container{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;background:#0A0F1A}
        .auth-canvas{position:fixed;inset:0;z-index:0;overflow:hidden;background:radial-gradient(ellipse at 50% 50%,#141c2b 0%,#0A0F1A 70%)}
        .auth-ambient{position:absolute;width:150%;height:150%;top:-25%;left:-25%;background:radial-gradient(ellipse at 40% 50%,rgba(212,175,55,.02) 0%,transparent 60%);animation:drift 30s ease-in-out infinite}
        @keyframes drift{0%,100%{transform:translate(0,0)}50%{transform:translate(-1%,-1%)}}
        .auth-panel{position:relative;z-index:1;width:100%;max-width:420px;background:rgba(20,25,40,.85);backdrop-filter:blur(12px);border-radius:32px;padding:40px 32px;border:1px solid rgba(255,255,255,.04);box-shadow:0 8px 60px rgba(0,0,0,.4)}
        .auth-brand{text-align:center;margin-bottom:24px}
        .auth-wordmark{display:inline-block;font-size:24px;font-weight:600;color:#f0f0f0;letter-spacing:1px;padding-bottom:4px;border-bottom:2px solid #D4AF37}
        .auth-tagline{display:block;font-size:13px;color:rgba(255,255,255,.3);margin-top:6px;letter-spacing:.3px}
        .auth-welcome{color:rgba(255,255,255,.6);font-size:15px;text-align:center;margin-bottom:24px;line-height:1.6}
        .auth-form{display:flex;flex-direction:column;gap:12px}
        .auth-input{width:100%;box-sizing:border-box;padding:14px 16px;border-radius:12px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.03);color:#f0f0f0;font-size:15px;outline:none;transition:border-color .3s}
        .auth-input:focus{border-color:rgba(212,175,55,.3)}
        .auth-button{width:100%;padding:14px;border-radius:12px;border:0;background:#D4AF37;color:#0A0F1A;font-weight:600;font-size:16px;cursor:pointer;transition:background .2s,transform .1s}
        .auth-button:hover{background:#E8C84A}.auth-button:active{transform:scale(.98)}.auth-button:disabled{opacity:.6;cursor:not-allowed}
        .auth-divider{text-align:center;color:rgba(255,255,255,.2);font-size:13px;margin:16px 0}
        .auth-magic{width:100%;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:transparent;color:rgba(255,255,255,.6);font-size:14px;cursor:pointer}
        .auth-magic:hover{background:rgba(255,255,255,.03)}.auth-message{margin-top:16px;text-align:center;font-size:14px;padding:10px 12px;border-radius:8px}
        .auth-message.error{color:#EF4444;background:rgba(239,68,68,.05)}.auth-message.success{color:#34D399;background:rgba(52,211,153,.05)}
        .auth-toggle{text-align:center;color:rgba(255,255,255,.4);font-size:14px;margin-top:20px}.auth-toggle-link{color:#D4AF37;cursor:pointer;font-weight:500}.auth-toggle-link:hover{text-decoration:underline}
      `}</style>
    </div>
  );
      }
