import { supabaseAdmin } from '../../lib/supabaseClient';

export default async function handler(req, res) {
  const churchId = req.query.church_id || req.body?.church_id;

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin.rpc('get_members', { _church_id: churchId });
    if (error) return res.status(500).json({ error: error.message });
    // Always return an array, even if null
    return res.status(200).json(Array.isArray(data) ? data : []);
  }

  if (req.method === 'POST') {
    const { first_name, last_name, phone, church_id } = req.body;
    const { data, error } = await supabaseAdmin.rpc('add_member', {
      _church_id: church_id,
      _first_name: first_name,
      _last_name: last_name || '',
      _phone: phone,
    });
    if (error) return res.status(500).json({ error: error.message });
    // rpc returns an array of rows, take the first one
    const member = Array.isArray(data) ? data[0] : null;
    return res.status(200).json(member || { error: 'No member returned' });
  }

  res.status(405).end();
  }
