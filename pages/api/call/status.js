import { supabaseAdmin } from '../../../lib/supabaseClient';

export default async function handler(req, res) {
  const memberId = req.query.member_id;
  const callSid = req.body.CallSid;
  const callStatus = req.body.CallStatus;

  await supabaseAdmin
    .from('follow_up_logs')
    .update({ call_sid: callSid, call_status: callStatus })
    .eq('member_id', memberId)
    .is('call_sid', null);
  res.status(200).send('');
}
