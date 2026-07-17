import { supabaseAdmin } from '../../../lib/supabaseClient';
import { extractNamesFromImage } from '../../../utils/ocr';
import { matchNamesToMembers } from '../../../lib/fuzzyMatch';
import { processAbsentees } from '../../../utils/followUp';
import formidable from 'formidable';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const form = new formidable.IncomingForm();
  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(500).json({ error: 'File upload error' });

    const churchId = fields.church_id[0];
    const file = files.file[0];
    if (!file) return res.status(400).json({ error: 'No file' });

    // Upload to Supabase Storage
    const fileExt = file.originalFilename.split('.').pop();
    const filePath = `${churchId}/${Date.now()}.${fileExt}`;
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('attendance')
      .upload(filePath, require('fs').readFileSync(file.filepath), {
        contentType: file.mimetype,
      });
    if (uploadError) return res.status(500).json({ error: uploadError.message });

    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('attendance')
      .getPublicUrl(filePath);

    // 1. Extract names (free OCR)
    const extractedNames = await extractNamesFromImage(publicUrl);

    // 2. Get all active members for church
    const { data: members, error: membersError } = await supabaseAdmin
      .from('members')
      .select('id, first_name, last_name')
      .eq('church_id', churchId)
      .eq('status', 'active');

    if (membersError) return res.status(500).json({ error: membersError.message });

    // 3. Match names
    const { presentIds, unmatched } = matchNamesToMembers(extractedNames, members);

    // 4. Save attendance sheet record
    const { data: sheet, error: sheetError } = await supabaseAdmin
      .from('attendance_sheets')
      .insert({
        church_id: churchId,
        image_url: publicUrl,
        extracted_names: extractedNames,
        uploaded_by: fields.uploaded_by?.[0] || 'secretary',
      })
      .select('id')
      .single();
    if (sheetError) return res.status(500).json({ error: sheetError.message });

    // 5. Create attendance records for today
    const today = new Date().toISOString().slice(0,10);
    const records = [];
    // present
    for (const id of presentIds) {
      records.push({ member_id: id, attendance_date: today, present: true, source_sheet_id: sheet.id });
    }
    // absent: all active members not in presentIds
    const activeIds = members.map(m => m.id);
    for (const id of activeIds) {
      if (!presentIds.includes(id)) {
        records.push({ member_id: id, attendance_date: today, present: false, source_sheet_id: sheet.id });
      }
    }
    const { error: insertError } = await supabaseAdmin.from('attendance_records').insert(records);
    if (insertError) return res.status(500).json({ error: insertError.message });

    // 6. Trigger follow-up (runs in background - serverless, call asynchronously)
    processAbsentees(churchId, today).catch(console.error); // fire and forget

    res.status(200).json({
      status: 'ok',
      present_count: presentIds.length,
      absent_count: activeIds.length - presentIds.length,
      unmatched_names: unmatched,
    });
  });
      }
