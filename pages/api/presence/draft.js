// Fetch church profile
const profileRes = await pool.query(
  `SELECT value FROM settings WHERE key = 'church_profile' AND organization_id = $1`,
  ['demo-org']
);
const profile = profileRes.rows.length > 0 ? profileRes.rows[0].value : { services: [], programs: [] };

// Build schedule context
let scheduleContext = '';
if (profile.services && profile.services.length > 0) {
  scheduleContext = 'Church services: ' + profile.services.map(s => `${s.day} at ${s.time}`).join(', ') + '. ';
}
if (profile.programs && profile.programs.length > 0) {
  scheduleContext += 'Ongoing programs: ' + profile.programs.map(p => p.name).join(', ') + '. ';
}
