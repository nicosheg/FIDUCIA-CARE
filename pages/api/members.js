import { supabaseAdmin } from '../../lib/supabaseClient';

export default async function handler(req, res) {
  console.log('==> Members API reached');
  console.log('Method:', req.method);
  console.log('Query:', req.query);
  try {
    const churchId = req.query.church_id || req.body?.church_id;

    if (req.method === 'GET') {
      console.log('Calling RPC get_members with church_id:', churchId);
      const { data, error } = await supabaseAdmin.rpc('get_members', { _church_id: churchId });
      if (error) {
        console.error('RPC error:', error);
        return res.status(500).json({ error: error.message });
      }
      console.log('RPC data:', data);
      return res.status(200).json(Array.isArray(data) ? data : []);
    }

    if (req.method === 'POST') {
      const { first_name, last_name, phone, church_id } = req.body;
      console.log('Calling RPC add_member with:', { church_id, first_name, last_name, phone });
      const { data, error } = await supabaseAdmin.rpc('add_member', {
        _church_id: church_id,
        _first_name: first_name,
        _last_name: last_name || '',
        _phone: phone,
      });
      if (error) {
        console.error('RPC error:', error);
        return res.status(500).json({ error: error.message });
      }
      console.log('RPC data:', data);
      const member = Array.isArray(data) ? data[0] : null;
      return res.status(200).json(member || { error: 'No member returned' });
    }

    res.status(405).end();
  } catch (err) {
    console.error('Unhandled error:', err);
    console.error(err.stack);
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
                  }
