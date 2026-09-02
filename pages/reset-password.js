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
let subscription;
const init=async()=>{
const{data:{session}}=await supabase.auth.getSession();
if(!mounted)return;
if(session){
setRecovery(true);
setReady(true);
}else{
setReady(true);
}
const listener=supabase.auth.onAuthStateChange((event,session)=>{
if(!mounted)return;
if(event==='PASSWORD_RECOVERY'&&session){
setRecovery(true);
setReady(true);
}
});
subscription=listener.data.subscription;
};
init();
return()=>{mounted=false;subscription?.unsubscribe()};
},[]);

const submit=async e=>{
e.preventDefault();
setError('');
setMessage('');
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
await supabase.auth.signOut();
setLoading(false);
setTimeout(()=>router.replace('/login?reset=success'),1200);
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
page:{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:20,background:'#f6f8fb',fontFamily:'Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'},
card:{width:'100%',maxWidth:430,background:'#fff',borderRadius:20,padding:32,boxShadow:'0 12px 40px rgba(0,0,0,.08)'},
logo:{fontSize:18,fontWeight:800,letterSpacing:'.04em',marginBottom:28},
title:{fontSize:28,lineHeight:1.2,margin:'0 0 10px',fontWeight:750},
text:{fontSize:15,lineHeight:1.6,color:'#667085',margin:'0 0 25px'},
label:{display:'block',fontSize:14,fontWeight:650,margin:'0 0 8px'},
inputWrap:{display:'flex',alignItems:'center',border:'1px solid #d0d5dd',borderRadius:10,marginBottom:16,overflow:'hidden',background:'#fff'},
input:{width:'100%',border:0,outline:0,padding:'13px 14px',fontSize:16,minWidth:0},
show:{border:0,background:'transparent',padding:'0 13px',fontWeight:600,cursor:'pointer'},
hint:{fontSize:13,color:'#667085',margin:'-6px 0 18px'},
button:{width:'100%',border:0,borderRadius:10,padding:'14px 16px',fontSize:15,fontWeight:700,cursor:'pointer',background:'#111827',color:'#fff'},
error:{padding:12,borderRadius:9,background:'#fef3f2',color:'#b42318',fontSize:14,marginBottom:14},
success:{padding:12,borderRadius:9,background:'#ecfdf3',color:'#027a48',fontSize:14,marginBottom:14},
muted:{color:'#667085',fontSize:14},
footer:{textAlign:'center',fontSize:12,fontWeight:700,letterSpacing:'.05em',color:'#98a2b3',margin:'28px 0 0'}
};
