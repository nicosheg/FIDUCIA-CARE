// pages/login.js
// ARIA Care Auth Entry — authentication only.
// Authentication UI only. Organization/onboarding provisioning remains separate.
// UX: show/hide password, explicit 6-character minimum, mobile-friendly inputs, safe auth flow.

import{useEffect,useRef,useState}from'react';
import{useRouter}from'next/router';
import{supabase}from'../lib/supabaseClient';

function getErrorMessage(error){
  if(typeof error==='string')return error;
  if(error?.message)return error.message;
  if(error?.error_description)return error.error_description;
  return'Something went wrong. Please try again.';
}

export default function Login(){
  const router=useRouter();
  const mountedRef=useRef(true);

  const[email,setEmail]=useState('');
  const[password,setPassword]=useState('');
  const[name,setName]=useState('');
  const[loading,setLoading]=useState(false);
  const[message,setMessage]=useState('');
  const[isLogin,setIsLogin]=useState(true);
  const[showPassword,setShowPassword]=useState(false);

  useEffect(()=>{
    mountedRef.current=true;
    return()=>{mountedRef.current=false;};
  },[]);

  useEffect(()=>{
    if(!router.isReady)return;
    let active=true;

    if(router.query.mode==='signup')setIsLogin(false);
    else if(router.query.mode==='login')setIsLogin(true);

    const checkSession=async()=>{
      try{
        const{data:{session},error}=await supabase.auth.getSession();
        if(!active||!mountedRef.current)return;
        if(error){
          console.error('Auth session check failed:',error);
          return;
        }
        if(session)await router.replace('/');
      }catch(error){
        if(active&&mountedRef.current)console.error('Auth initialization failed:',error);
      }
    };

    checkSession();
    return()=>{active=false;};
  },[router.isReady,router.query.mode,router]);

  const showMessage=text=>{
    if(mountedRef.current)setMessage(text);
  };

  const handleLogin=async e=>{
    e.preventDefault();
    if(loading)return;

    const cleanEmail=email.trim();

    if(!cleanEmail||!password){
      showMessage('Please enter your email and password.');
      return;
    }

    setLoading(true);
    setMessage('');

    try{
      const{data,error}=await supabase.auth.signInWithPassword({
        email:cleanEmail,
        password
      });

      if(error){
        showMessage(getErrorMessage(error));
        return;
      }

      if(data?.session)await router.replace('/');
      else showMessage('Sign in completed, but no session was created. Please try again.');
    }catch(error){
      console.error('Login error:',error);
      showMessage(getErrorMessage(error));
    }finally{
      if(mountedRef.current)setLoading(false);
    }
  };

  const handleSignup=async e=>{
    e.preventDefault();
    if(loading)return;

    const cleanName=name.trim();
    const cleanEmail=email.trim();

    if(!cleanName){
      showMessage('Please enter your name.');
      return;
    }

    if(!cleanEmail){
      showMessage('Please enter your email.');
      return;
    }

    if(password.length<6){
      showMessage('Your password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    setMessage('');

    try{
      const{data,error}=await supabase.auth.signUp({
        email:cleanEmail,
        password,
        options:{data:{name:cleanName}}
      });

      if(error){
        const text=error.message?.toLowerCase()||'';

        if(text.includes('already registered')||text.includes('already exists')||error.code==='user_already_exists'){
          showMessage('This email is already registered. Please log in instead.');
        }else if(text.includes('rate limit')||text.includes('rate_limited')){
          showMessage('You’ve been temporarily rate-limited. Please wait a moment and try again.');
        }else{
          showMessage(getErrorMessage(error));
        }
        return;
      }

      if(data?.session){
        await router.replace('/');
        return;
      }

      showMessage('Account created. Check your email to verify your account, then continue.');
    }catch(error){
      console.error('Signup error:',error);
      showMessage(getErrorMessage(error));
    }finally{
      if(mountedRef.current)setLoading(false);
    }
  };

  const handleMagicLink=async()=>{
    if(loading)return;

    const cleanEmail=email.trim();

    if(!cleanEmail){
      showMessage('Please enter your email first.');
      return;
    }

    setLoading(true);
    setMessage('');

    try{
      const{error}=await supabase.auth.signInWithOtp({
        email:cleanEmail,
        options:{emailRedirectTo:`${window.location.origin}/`}
      });

      if(error){
        const text=error.message?.toLowerCase()||'';

        if(text.includes('rate limit')||text.includes('rate_limited')){
          showMessage('Rate limit exceeded. Please wait a moment before requesting another magic link.');
        }else{
          showMessage(getErrorMessage(error));
        }
        return;
      }

      showMessage('📨 Check your email — I’ve sent you a way in.');
    }catch(error){
      console.error('Magic link error:',error);
      showMessage(getErrorMessage(error));
    }finally{
      if(mountedRef.current)setLoading(false);
    }
  };

  const switchMode=()=>{
    if(loading)return;
    setMessage('');
    setPassword('');
    setShowPassword(false);
    setIsLogin(current=>!current);
  };

  const isSuccess=message.startsWith('📨')||message.startsWith('Account created');

  return(
    <div className="auth-container">
      <div className="auth-canvas">
        <div className="auth-ambient"/>
      </div>

      <div className="auth-panel">
        <div className="auth-brand">
          <span className="auth-wordmark">ARIA</span>
          <span className="auth-tagline">Every Person. Every Story. Remembered.</span>
        </div>

        <p className="auth-welcome">
          {isLogin?'Welcome back. Sign in to continue.':'Welcome. Let’s build your space.'}
        </p>

        <form onSubmit={isLogin?handleLogin:handleSignup} className="auth-form">
          {!isLogin&&(
            <input
              type="text"
              placeholder="Full Name"
              value={name}
              onChange={e=>setName(e.target.value)}
              required
              className="auth-input"
              autoComplete="name"
              disabled={loading}
            />
          )}

          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e=>setEmail(e.target.value)}
            required
            className="auth-input"
            autoComplete="email"
            disabled={loading}
            inputMode="email"
            autoCapitalize="none"
            spellCheck="false"
          />

          <div className="password-wrap">
            <input
              type={showPassword?'text':'password'}
              placeholder="Password"
              value={password}
              onChange={e=>setPassword(e.target.value)}
              required
              minLength={6}
              className="auth-input password-input"
              autoComplete={isLogin?'current-password':'new-password'}
              disabled={loading}
              aria-describedby={!isLogin?'password-hint':undefined}
            />

            <button
              type="button"
              className="password-toggle"
              onClick={()=>setShowPassword(current=>!current)}
              disabled={loading}
              aria-label={showPassword?'Hide password':'Show password'}
              title={showPassword?'Hide password':'Show password'}
            >
              {showPassword?'Hide':'Show'}
            </button>
          </div>

          {!isLogin&&(
            <p id="password-hint" className="password-hint">
              Password must be at least 6 characters.
            </p>
          )}

          <button type="submit" disabled={loading} className="auth-button">
            {loading
              ?isLogin?'Signing in...':'Creating your space...'
              :isLogin?'Sign In':'Create Account'}
          </button>
        </form>

        <div className="auth-divider">— or —</div>

        <button
          type="button"
          onClick={handleMagicLink}
          disabled={loading}
          className="auth-magic"
        >
          Send Magic Link
        </button>

        {message&&(
          <p className={`auth-message ${isSuccess?'success':'error'}`}>
            {message}
          </p>
        )}

        <p className="auth-toggle">
          {isLogin?(
            <>
              Don’t have an account?{' '}
              <button
                type="button"
                onClick={switchMode}
                className="auth-toggle-link"
                disabled={loading}
              >
                Create one
              </button>
            </>
          ):(
            <>
              Already have an account?{' '}
              <button
                type="button"
                onClick={switchMode}
                className="auth-toggle-link"
                disabled={loading}
              >
                Log in
              </button>
            </>
          )}
        </p>
      </div>

      <style jsx>{`
        .auth-container{min-height:100vh;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;background:#0a0f1a;overflow-x:hidden}
        .auth-canvas{position:fixed;inset:0;z-index:0;overflow:hidden;background:radial-gradient(ellipse at 50% 50%,#141c2b 0%,#0a0f1a 70%);pointer-events:none}
        .auth-ambient{position:absolute;width:150%;height:150%;top:-25%;left:-25%;background:radial-gradient(ellipse at 40% 50%,rgba(212,175,55,.02) 0%,transparent 60%);animation:drift 30s ease-in-out infinite;will-change:transform}
        @keyframes drift{0%,100%{transform:translate3d(0,0,0)}50%{transform:translate3d(-1%,-1%,0)}}
        .auth-panel{position:relative;z-index:1;width:100%;max-width:420px;box-sizing:border-box;background:rgba(20,25,40,.85);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-radius:32px;padding:40px 32px;border:1px solid rgba(255,255,255,.04);box-shadow:0 8px 60px rgba(0,0,0,.4)}
        .auth-brand{text-align:center;margin-bottom:24px}
        .auth-wordmark{display:inline-block;font-size:24px;font-weight:600;color:#f0f0f0;letter-spacing:1px;padding-bottom:4px;border-bottom:2px solid #d4af37}
        .auth-tagline{display:block;font-size:13px;color:rgba(255,255,255,.3);margin-top:6px;letter-spacing:.3px}
        .auth-welcome{color:rgba(255,255,255,.6);font-size:15px;text-align:center;margin:0 0 24px;line-height:1.6}
        .auth-form{display:flex;flex-direction:column;gap:12px}
        .auth-input{width:100%;box-sizing:border-box;padding:14px 16px;border-radius:12px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.03);color:#f0f0f0;font-size:15px;outline:none;transition:border-color .2s ease}
        .auth-input::placeholder{color:rgba(255,255,255,.35)}
        .auth-input:focus{border-color:rgba(212,175,55,.3)}
        .auth-input:disabled{opacity:.6;cursor:not-allowed}
        .password-wrap{position:relative;width:100%}
        .password-wrap .auth-input{padding-right:72px}
        .password-toggle{position:absolute;right:8px;top:50%;transform:translateY(-50%);border:0;background:transparent;color:#d4af37;font-size:13px;font-weight:500;padding:7px 8px;border-radius:7px;cursor:pointer}
        .password-toggle:hover:not(:disabled){background:rgba(212,175,55,.08)}
        .password-toggle:disabled{opacity:.5;cursor:not-allowed}
        .password-hint{margin:-4px 2px 0;color:rgba(255,255,255,.35);font-size:12px;line-height:1.4}
        .auth-button{width:100%;padding:14px;border-radius:12px;border:0;background:#d4af37;color:#0a0f1a;font-weight:600;font-size:16px;cursor:pointer;transition:background .2s ease,transform .1s ease}
        .auth-button:hover:not(:disabled){background:#e8c84a}
        .auth-button:active:not(:disabled){transform:scale(.98)}
        .auth-button:disabled{opacity:.6;cursor:not-allowed}
        .auth-divider{text-align:center;color:rgba(255,255,255,.2);font-size:13px;margin:16px 0}
        .auth-magic{width:100%;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:transparent;color:rgba(255,255,255,.6);font-size:14px;cursor:pointer}
        .auth-magic:hover:not(:disabled){background:rgba(255,255,255,.03)}
        .auth-magic:disabled{opacity:.5;cursor:not-allowed}
        .auth-message{margin-top:16px;text-align:center;font-size:14px;padding:10px 12px;border-radius:8px;line-height:1.5}
        .auth-message.error{color:#ef4444;background:rgba(239,68,68,.05)}
        .auth-message.success{color:#34d399;background:rgba(52,211,153,.05)}
        .auth-toggle{text-align:center;color:rgba(255,255,255,.4);font-size:14px;margin:20px 0 0}
        .auth-toggle-link{padding:0;border:0;background:none;color:#d4af37;cursor:pointer;font:inherit;font-weight:500}
        .auth-toggle-link:hover:not(:disabled){text-decoration:underline}
        .auth-toggle-link:disabled{opacity:.5;cursor:not-allowed}
        @media(max-width:480px){.auth-container{padding:14px}.auth-panel{padding:32px 22px;border-radius:26px}}
        @media(prefers-reduced-motion:reduce){.auth-ambient{animation:none}}
      `}</style>
    </div>
  );
}
