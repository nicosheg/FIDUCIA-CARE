import { supabaseAdmin } from '../../../lib/supabaseClient';
import { initiateFollowUpCall } from '../../../utils/telephony';

export default async function handler(req, res) {
  const memberId = req.query.member_id;
  const callSid = req.body.CallSid;
  const callStatus = req.body.CallStatus;
  const called = req.body.Called; // phone number

  // Update existing log
  const { data: logs } = await supabaseAdmin
    .from('follow_up_logs')
    .select('id, priority, retry_count')
    .eq('member_id', memberId)
    .order('called_at', { ascending: false })
    .limit(1);

  if (logs?.length) {
    const log = logs[0];
    await supabaseAdmin.from('follow_up_logs').update({
      call_sid: callSid,
      call_status: callStatus,
    }).eq('id', log.id);

    // Retry logic: if no-answer and not already retried once
    if (callStatus === 'no-answer' && (!log.retry_count || log.retry_count < 1)) {
      await supabaseAdmin.from('follow_up_logs').update({ retry_count: (log.retry_count || 0) + 1 }).eq('id', log.id);
      // Re-initiate call (wait a few seconds)
      const { data: member } = await supabaseAdmin.from('members').select('*').eq('id', memberId).single();
      await initiateFollowUpCall(member, log.priority === 'high');
    }

    // If call completed, trigger Google Sheets update
    if (callStatus === 'completed') {
      // Import and call sheet append function
      const { appendToSheet } = require('../../../utils/sheets');
      await appendToSheet(memberId, log.intent_detected, new Date().toISOString());
    }
  }

  res.status(200).send('');
}
