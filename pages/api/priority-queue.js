// pages/api/priority-queue.js
import{getPriorityQueue}from'../../lib/aria/priorityQueue';
import{withOrg}from'../../lib/apiHelpers';

async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});

  try{
    const orgId=req.org.id;
    const limit=parseInt(req.query.limit,10)||10;
    const items=await getPriorityQueue(orgId,limit);
    return res.status(200).json(items);
  }catch(err){
    console.error('[ARIA] Priority queue error:',err);
    return res.status(500).json({error:'Unable to load ARIA priority signals.'});
  }
}

export default withOrg(handler);
