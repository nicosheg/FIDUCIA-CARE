// pages/reset-password.js
import{useEffect,useState}from'react';
import{useRouter}from'next/router';
import{supabase}from'../lib/supabaseClient';

export default function ResetPassword(){
const router=useRouter();
const[password,setPassword]=useState('');
const[confirm,setConfirm]=useState('');
const[show,setShow]=useState(false);
const[showConfirm,setShowConfirm]=useState(false);
const[loading,setLoading]=useState(true);
const[saving,setSaving]=useState(false);
const[ready,setReady]=useState(false);
const[message,setMessage]=useState('');
const[error,setError]=useState('');

useEffect(()=>{
let mounted=true;
const initialise=async()=>{
try{
const{data:{session}}=await supabase.auth.getSession();
if(session){if(mounted)setReady(true);if(mounted)setLoading(false);return}
const timer=setTimeout(async()=>{
const{data:{session:next}}=await supabase.auth.getSession();
if(mounted){setReady(!!next);setLoading(false)}
},700);
return()=>clearTimeout(timer);
}catch(e){if(mounted){setError('This reset link is invalid or has expired.');setLoading(false)}}
};
let cleanup;
initialise().then(x=>{cleanup=x});
const{data}=supabase.auth.onAuthStateChange((event,session)=>{
if(!mounted)return;
if(event==='PASSWORD_RECOVERY'||session){setReady(true);setLoading(false)}
});
return()=>{mounted=false;cleanup?.();data?.subscription?.unsubscribe()};
},[]);

const submit=async e=>{
e.preventDefault();
setError('');
setMessage('');
if(password.length<6)return setError('Your password must be at least 6 characters.');
if(password!==confirm)return setError('The passwords do not match.');
setSaving(true);
const{error:e2}=await supabase.auth.updateUser({password});
setSaving(false);
if(e2)return setError('Unable to update your password. Please request a new reset link.');
setMessage('Your password has been updated successfully.');
setPassword('');
setConfirm('');
setTimeout(()=>router.replace('/'),1600);
};

return <main><div className="panel"><div className="mark">N</div><div className="eyebrow">NYEOCARE</div>{loading?<><h1>Preparing your reset</h1><p className="muted">Securely preparing your account.</p><div className="loader"/></>:!ready?<><h1>Reset link unavailable</h1><p className="muted">{error||'This link is invalid or has expired. Please request a new one from your profile.'}</p><button onClick={()=>router.replace('/login')}>Return to NYEOCARE</button></>:message?<><div className="success">✓</div><h1>Password updated</h1><p className="muted">Your NYEOCARE account is secure again. Taking you back now.</p></>:<form onSubmit={submit}><h1>Create a new password</h1><p className="muted">Choose a new password for your NYEOCARE account.</p><label>New password</label><div className="field"><input type={show?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} minLength={6} autoComplete="new-password"/><button type="button" onClick={()=>setShow(!show)}>{show?'Hide':'Show'}</button></div><small>At least 6 characters.</small><label>Confirm password</label><div className="field"><input type={showConfirm?'text':'password'} value={confirm} onChange={e=>setConfirm(e.target.value)} minLength={6} autoComplete="new-password"/><button type="button" onClick={()=>setShowConfirm(!showConfirm)}>{showConfirm?'Hide':'Show'}</button></div>{error&&<div className="error">{error}</div>}<button className="primary" disabled={saving}>{saving?'Updating…':'Update password'}</button></form>}</div><style jsx>{`
main{min-height:100vh;display:grid;place-items:center;padding:24px;background:#091321;color:#eef4ff;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.panel{width:100%;max-width:430px;padding:32px;border:1px solid rgba(220,235,250,.1);border-radius:28px;background:rgba(18,31,49,.78);box-shadow:0 30px 90px rgba(0,0,0,.3);backdrop-filter:blur(22px)}.mark{width:46px;height:46px;border-radius:15px;display:grid;place-items:center;background:rgba(212,175,55,.1);border:1px solid rgba(212,175,55,.3);color:#f3df9c;font-size:21px;font-weight:700;margin-bottom:18px}.eyebrow{font-size:10px;letter-spacing:.18em;color:#8fb7ff;margin-bottom:8px}h1{font-size:26px;margin:0 0 8px;font-weight:600}.muted{font-size:13px;line-height:1.6;color:rgba(235,241,250,.48);margin:0 0 25px}label{display:block;font-size:12px;color:rgba(255,255,255,.55);margin:17px 0 7px}.field{display:flex;align-items:center;border:1px solid rgba(220,235,250,.12);border-radius:14px;background:rgba(255,255,255,.035);overflow:hidden}.field input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:white;padding:13px;font-size:14px}.field button{border:0;background:none;color:#8fb7ff;padding:0 13px;font-size:11px;cursor:pointer}.panel small{color:rgba(255,255,255,.3);font-size:10px}.primary,.panel>button{width:100%;min-height:46px;margin-top:22px;border-radius:14px;border:1px solid rgba(212,175,55,.3);background:rgba(212,175,55,.12);color:#f3df9c;font-weight:600;cursor:pointer}.error{margin-top:14px;padding:11px 12px;border-radius:12px;background:rgba(220,70,70,.08);border:1px solid rgba(220,70,70,.18);color:#f0aaaa;font-size:12px;line-height:1.5}.success{width:50px;height:50px;border-radius:50%;display:grid;place-items:center;background:rgba(70,200,140,.1);border:1px solid rgba(70,200,140,.25);color:#7fe0b1;font-size:22px;margin-bottom:18px}.loader{width:24px;height:24px;border:2px solid rgba(255,255,255,.12);border-top-color:#d4af37;border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:600px){.panel{padding:26px 20px;border-radius:23px}}
`}</style></main>
}
