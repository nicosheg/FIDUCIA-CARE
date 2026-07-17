import { supabaseAdmin } from '../lib/supabaseClient.js';
import { initiateFollowUpCall } from './telephony/index.js';

export async function processAbsentees(churchId, attendanceDate) {
  const { data: absentRecords, error } = await supabaseAdmin
    .from('attendance_records')
    .select(`member_id, members!inner(id, first_name, last_name, phone, status)`)
    .eq('attendance_date', attendanceDate)
    .eq('present', false)
    .eq('members.status', 'active')
    .not('members.phone', 'is', null);

  if (error || !absentRecords) return;

  for (const record of absentRecords) {
    const member = record.members;

    // Build last 4 weeks' dates
    const weeks = [1, 2, 3, 4].map(i => {
      const d = new Date(attendanceDate);
      d.setDate(d.getDate() - 7 * i);
      return d.toISOString().slice(0, 10);
    });

    const { data: recent } = await supabaseAdmin
      .from('attendance_records')
      .select('present')
      .in('attendance_date', weeks)
      .eq('member_id', member.id)
      .order('attendance_date', { ascending: false });

    let consec = 0;
    for (const r of recent || []) {
      if (!r.present) consec++;
      else break;
    }

    if (consec === 0) {
      // 1st time absent – log for future WhatsApp/SMS
      console.log(`First absence: ${member.first_name} – send WhatsApp later`);
      // You could also insert a low-priority follow_up_log here
    } else if (consec === 1) {
      // 2nd consecutive absence → warm AI call
      await initiateFollowUpCall(member, false);
    } else if (consec === 2) {
      // 3rd consecutive absence → call + pastor flag
      await initiateFollowUpCall(member, true);
    } else {
      // 4+ weeks → immediate pastor escalation (no call)
      await supabaseAdmin.from('follow_up_logs').insert({
        member_id: member.id,
        call_status: 'escalated',
        intent_detected: 'chronic_absence',
        priority: 'high',
        notes: 'Auto escalated to pastor',
      });
    }
  }
}
