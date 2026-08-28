// components/CareQueueList.js
import { useState,useEffect,useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function CareQueueList(){
  const [items,setItems]=useState([]);
  const [loading,setLoading]=useState(true);
  const [scanning,setScanning]=useState(false);

  // Load the current care queue for the authenticated organization.
  const fetchQueue=useCallback(async()=>{
    const {data:{session}}=await supabase.auth.getSession();
    if(!session){setLoading(false);return;}
    setLoading(true);
    try{
      const res=await fetch('/api/care-queue',{headers:{Authorization:`Bearer ${session.access_token}`}});
      if(!res.ok)throw new Error('Failed to fetch care queue');
      const data=await res.json();
      setItems(Array.isArray(data)?data:[]);
    }catch(e){console.error('[CARE QUEUE] Fetch error:',e);}
    finally{setLoading(false);}
  },[]);

  // Ask ARIA to recalculate care items, then refresh the queue.
  const runAriaScan=async()=>{
    const {data:{session}}=await supabase.auth.getSession();
    if(!session)return;
    setScanning(true);
    try{
      const res=await fetch('/api/care-queue',{
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},
        body:JSON.stringify({action:'scan'})
      });
      if(!res.ok)throw new Error('ARIA care scan failed');
      await fetchQueue();
    }catch(e){console.error('[CARE QUEUE] ARIA scan error:',e);}
    finally{setScanning(false);}
  };

  useEffect(()=>{fetchQueue();},[fetchQueue]);

  const riskColor=risk=>{
    if(risk==='critical')return '#EF4444';
    if(risk==='high')return '#F59E0B';
    if(risk==='medium')return '#FBBF24';
    return '#34D399';
  };

  if(loading)return(
    <div className="fiducia-card shimmer" style={{padding:'24px 28px'}}>
      <div style={{height:24,width:'70%',borderRadius:8}}/>
      <div style={{height:24,width:'50%',borderRadius:8,marginTop:10}}/>
    </div>
  );

  return(
    <div style={{maxWidth:700,margin:'0 auto',padding:'0 20px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
        <h2 style={{fontSize:20,fontWeight:500,color:'#f0f0f0',margin:0}}>
          Care Queue
          <span style={{fontSize:16,fontWeight:400,color:'rgba(255,255,255,0.3)',marginLeft:12}}>{items.length} items</span>
        </h2>
        <button onClick={runAriaScan} disabled={scanning} className="fiducia-button fiducia-button-primary" style={{padding:'8px 16px',fontSize:13,opacity:scanning?.6:1}}>
          {scanning?'Scanning…':'ARIA Scan'}
        </button>
      </div>

      {items.length===0?(
        <div className="fiducia-card" style={{textAlign:'center',padding:'40px 20px'}}>
          <p className="aria-speaks" style={{fontSize:18,margin:0}}>ARIA is looking after everyone. No pending care items.</p>
        </div>
      ):(
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          {items.map((item,idx)=>(
            <div key={item.person_id||item.id||idx} className="fiducia-card" style={{padding:'16px 24px',display:'flex',justifyContent:'space-between',alignItems:'center',gap:16}}>
              <div style={{minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{display:'inline-block',width:8,height:8,borderRadius:'50%',background:riskColor(item.risk_level),flexShrink:0}}/>
                  <p className="aria-speaks" style={{margin:0,fontSize:17}}>{item.text}</p>
                </div>
                <p style={{fontSize:13,color:'rgba(255,255,255,0.3)',marginTop:4}}>
                  {item.engagement_status} · {item.inactivity_streak} weeks inactive
                </p>
              </div>

              <div style={{display:'flex',gap:8,flexShrink:0}}>
                <button
                  className="fiducia-button fiducia-button-primary"
                  style={{padding:'8px 16px',fontSize:13}}
                  onClick={()=>{
                    const phone=String(item.phone||'').replace(/[^\d+]/g,'');
                    if(!phone){alert('No phone number for this person.');return;}
                    const clean=phone.startsWith('+')?phone.slice(1):phone;
                    if(!clean){alert('No valid phone number for this person.');return;}
                    const name=item.first_name||'';
                    const message=encodeURIComponent(`Hello ${name}, just checking in – ARIA wanted me to see how you're doing.`);
                    window.open(`https://wa.me/${clean}?text=${message}`,'_blank','noopener,noreferrer');
                  }}
                >Message</button>

                <button
                  className="fiducia-button fiducia-button-ghost"
                  style={{padding:'8px 16px',fontSize:13}}
                  onClick={()=>{if(item.person_id)window.location.href=`/person/${encodeURIComponent(item.person_id)}`;}}
                >Profile</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
                }
