import { supabaseAdmin } from '../../lib/supabaseClient';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('settings')
      .select('value')
      .eq('key', 'call_script')
      .single();

    if (error) {
      // Return default script if not found
      const defaultScript = {
        greeting: "Hello {first_name}, this is Grace from your church.",
        body: "We missed you today. Are you doing okay?",
        prayer: "Would you like us to pray with you?",
        closing: "Thank you. We look forward to seeing you soon. God bless."
      };
      return res.status(200).json(defaultScript);
    }

    return res.status(200).json(data.value);
  }

  if (req.method === 'POST') {
    const { value } = req.body; // the template object
    const { error } = await supabaseAdmin
      .from('settings')
      .upsert({ key: 'call_script', value }, { onConflict: 'key' });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  res.status(405).end();
}
