import { supabaseAdmin } from '../../../lib/supabaseClient';
import { detectIntent } from '../../../utils/intent';

export default async function handler(req, res) {
  const memberId = req.query.member_id;
  const speechResult = req.body.SpeechResult;
  const digits = req.body.Digits;

  const intent = detectIntent(speechResult, digits);

  // Update the most recent follow-up log for this member (call_sid unknown yet)
  const { data: logs } = await supabaseAdmin
    .from('follow_up_logs')
    .select('id')
    .eq('member_id', memberId)
    .is('call_sid', null)
    .order('called_at', { ascending: false })
    .limit(1);
  if (logs && logs.length > 0) {
    await supabaseAdmin.from('follow_up_logs').update({ intent_detected: intent }).eq('id', logs[0].id);
  }
  // Update member status if relocated
  if (intent === 'relocated') {
    await supabaseAdmin.from('members').update({ status: 'relocated' }).eq('id', memberId);
  }
  res.status(200).send('');
                                                                                      }
