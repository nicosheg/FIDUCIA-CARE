// components/AriaAutoSync.js
import{useEffect}from'react';

export default function AriaAutoSync(){
 useEffect(()=>{
  let cancelled=false;
  const run=async()=>{
   if(cancelled)return;
   try{
    await fetch('/api/aria/cycle',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',credentials:'include'});
   }catch{}
  };
  run();
  const onFocus=()=>run();
  window.addEventListener('focus',onFocus);
  return()=>{cancelled=true;window.removeEventListener('focus',onFocus)};
 },[]);
 return null;
}
