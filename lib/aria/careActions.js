// lib/aria/careActions.js
export async function createCareAction(orgId, personId, actionType, assignedTo = null, notes = '', dueDate = null) {
  const res = await pool.query(
    `INSERT INTO care_actions (organization_id, person_id, action_type, assigned_to, notes, due_date, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending')
     RETURNING id`,
    [orgId, personId, actionType, assignedTo, notes, dueDate]
  );
  return res.rows[0].id;
}

export async function updateCareActionStatus(actionId, status, completedAt = null) {
  await pool.query(
    `UPDATE care_actions
     SET status = $1, completed_at = $2, updated_at = NOW()
     WHERE id = $3`,
    [status, completedAt, actionId]
  );
}
