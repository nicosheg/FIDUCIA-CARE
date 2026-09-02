// pages/api/profile/password-reset.js
import {supabase} from '../../../lib/supabaseClient';
import {getCurrentCareUser} from '../../../lib/auth';

export default async function handler(req,res){
if(req.method!=='POST')return res.status(405).json({error:'Method not allowed.'});
const user=await getCurrentCareUser(req);
if(!user)return res.status(401).json({error:'Unauthorized'});
if(!user.email)return res.status(400).json({error:'Your account does not have an email address.'});
try{
const base=(process.env.NEXT_PUBLIC_SITE_URL||process.env.NEXT_PUBLIC_APP_URL||`https://${req.headers.host}`).replace(/\/$/,'');
const{error}=await supabase.auth.resetPasswordForEmail(user.email,{redirectTo:`${base}/reset-password`});
if(error)return res.status(400).json({error:'Unable to send the secure reset link.'});
return res.status(200).json({success:true});
}catch(e){
console.error('[PASSWORD_RESET]',e?.message||e);
return res.status(500).json({error:'Unable to send the secure reset link.'});
}
}
