import { supabaseAdmin } from '../../lib/supabaseClient';

export default async function handler(req, res) {
  const { data, error } = await supabaseAdmin.from('members').select('count');
  if (error) {
    return res.status(500).json({ error: error.message });
  }
  return res.status(200).json({ message: 'DB connected', count: data[0]?.count });
}
