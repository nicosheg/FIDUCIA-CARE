import { supabaseAdmin } from '../../lib/supabaseClient';

export default async function handler(req, res) {
  console.log('==> Members API reached (direct table access)');
  console.log('Method:', req.method);
  console.log('Query:', req.query);
  
  const churchId = req.query.church_id || req.body?.church_id;

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('members')
        .select('*')
        .eq('church_id', churchId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('DB query error:', error);
        return res.status(500).json({ error: error.message });
      }

      console.log('Members found:', data?.length);
      return res.status(200).json(data || []);
    }

    if (req.method === 'POST') {
      const { first_name, last_name, phone, church_id } = req.body;
      console.log('Inserting member:', { first_name, last_name, phone, church_id });

      const { data, error } = await supabaseAdmin
        .from('members')
        .insert({ first_name, last_name, phone, church_id, status: 'active' })
        .select()
        .single();

      if (error) {
        console.error('Insert error:', error);
        return res.status(500).json({ error: error.message });
      }

      console.log('Inserted member:', data);
      return res.status(200).json(data);
    }

    res.status(405).end();
  } catch (err) {
    console.error('Unhandled error:', err);
    return res.status(500).json({ error: err.message });
  }
          }
