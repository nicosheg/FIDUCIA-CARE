// pages/reset-password.js
import {useEffect,useState} from 'react';
import {useRouter} from 'next/router';
import {supabase} from '../lib/supabaseClient';

export default function ResetPassword(){
const router=useRouter();
const[ready,setReady]=useState(false);
const[recovery,setRecovery]=useState(false);
const[password,setPassword]=useState('');
const[confirm,setConfirm]=useState('');
const[showPassword,setShowPassword]=useState(false);
const[showConfirm,setShowConfirm]=useState(false);
const[loading,setLoading]=useState(false);
const[message,setMessage]=useState('');
const[error,setError]=useState('');

useEffect(()=>{
let mounted=true;
const{data}=supabase.auth.onAuthStateChange((event,session)=>{
if(!mounted)return;
if(event==='PASSWORD_RECOVERY'&&session)setRecovery(true);
setReady(true);
});
const timer=setTimeout(()=>{if(mounted)setReady(true)},3000);
return()=>{mounted=false;clearTimeout(timer);data.subscription.unsubscribe()};
},[]);

const submit=async e=>{
e.preventDefault();
if(loading)return;
setError('');
setMessage('');
if(!recovery)return setError('This password reset session is no longer valid.');
if(password.length<6)return setError('Your password must be at least 6 characters.');
if(password!==confirm)return setError('The passwords do not match.');
setLoading(true);
const{error}=await supabase.auth.updateUser({password});
if(error){
setError(error.message||'Unable to recreate your password.');
setLoading(false);
return;
}
setMessage('Your password has been recreated successfully.');
await supabase.auth.signOut({scope:'local'});
setTimeout(()=>router.replace('/login?reset=success'),1000);
};

if(!ready)return <main style={styles.page}><section style={styles.card}><div style={styles.logo}>NYEOCARE</div><p style={styles.muted}>Preparing your secure password reset…</p></section></main>;

if(!recovery)return <main style={styles.page}><section style={styles.card}><div style={styles.logo}>NYEOCARE</div><h1 style={styles.title}>Reset link unavailable</h1><p style={styles.text}>This password reset link is no longer valid or has already been used.</p><button style={styles.button} onClick={()=>router.replace('/login')}>Return to sign in</button></section></main>;

return <main style={styles.page}><section style={styles.card}>
<div style={styles.logo}>NYEOCARE</div>
<h1 style={styles.title}>Recreate your password</h1>
<p style={styles.text}>Choose a new password for your NYEOCARE account.</p>
<form onSubmit={submit}>
<label style={styles.label}>New password</label>
<div style={styles.inputWrap}><input style={styles.input} type={showPassword?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} minLength={6} autoComplete="new-password" required/><button type="button" style={styles.show} onClick={()=>setShowPassword(!showPassword)}>{showPassword?'Hide':'Show'}</button></div>
<label style={styles.label}>Confirm password</label>
<div style={styles.inputWrap}><input style={styles.input} type={showConfirm?'text':'password'} value={confirm} onChange={e=>setConfirm(e.target.value)} minLength={6} autoComplete="new-password" required/><button type="button" style={styles.show} onClick={()=>setShowConfirm(!showConfirm)}>{showConfirm?'Hide':'Show'}</button></div>
<p style={styles.hint}>Use at least 6 characters.</p>
{error&&<div style={styles.error}>{error}</div>}
{message&&<div style={styles.success}>{message}</div>}
<button style={{...styles.button,opacity:loading?.65:1}} disabled={loading}>{loading?'Recreating…':'Recreate password'}</button>
</form>
<p style={styles.footer}>NYEOCARE</p>
</section></main>;
}

const styles={
page:{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:20,background:'#07111f',fontFamily:'Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'},
card:{width:'100%',maxWidth:430,background:'#0d1b2e',border:'1px solid rgba(72,133,255,.18)',borderRadius:20,padding:32,boxShadow:'0 20px 60px rgba(0,0,0,.35)'},
logo:{fontSize:18,fontWeight:800,letterSpacing:'.06em',marginBottom:28,color:'#4f8cff'},
title:{fontSize:28,lineHeight:1.2,margin:'0 0 10px',fontWeight:750,color:'#f8fafc'},
text:{fontSize:15,lineHeight:1.6,color:'#9fb0c7',margin:'0 0 25px'},
label:{display:'block',fontSize:14,fontWeight:650,margin:'0 0 8px',color:'#dce6f3'},
inputWrap:{display:'flex',alignItems:'center',border:'1px solid #263b57',borderRadius:10,marginBottom:16,overflow:'hidden',background:'#091525'},
input:{width:'100%',border:0,outline:0,padding:'13px 14px',fontSize:16,minWidth:0,background:'transparent',color:'#f8fafc'},
show:{border:0,background:'transparent',padding:'0 13px',fontWeight:600,cursor:'pointer',color:'#8eb5ff'},
hint:{fontSize:13,color:'#7f93ad',margin:'-6px 0 18px'},
button:{width:'100%',border:0,borderRadius:10,padding:'14px 16px',fontSize:15,fontWeight:700,cursor:'pointer',background:'#3478f6',color:'#fff'},
error:{padding:12,borderRadius:9,background:'rgba(180,35,24,.12)',border:'1px solid rgba(240,68,56,.2)',color:'#ff9b91',fontSize:14,marginBottom:14},
success:{padding:12,borderRadius:9,background:'rgba(2,122,72,.12)',border:'1px solid rgba(18,183,106,.2)',color:'#75e0ad',fontSize:14,marginBottom:14},
muted:{color:'#9fb0c7',fontSize:14},
footer:{textAlign:'center',fontSize:12,fontWeight:700,letterSpacing:'.05em',color:'#637994',margin:'28px 0 0'}
};
