// lib/auth.js
export async function ensureCareUser(supabaseUser){
  if(!supabaseUser?.id)throw new Error('Invalid Supabase user');

  const existing=await pool.query(
    `SELECT id,organization_id
     FROM users
     WHERE supabase_user_id=$1
     LIMIT 1`,
    [supabaseUser.id]
  );

  if(existing.rows.length)return existing.rows[0];

  const email=String(supabaseUser.email||'').trim().toLowerCase();

  if(!email)throw new Error('Authenticated user has no email address');

  const metadata=supabaseUser.user_metadata||{};
  const name=String(
    metadata.name||
    metadata.full_name||
    email.split('@')[0]||
    'User'
  ).trim();

  const client=await pool.connect();

  try{
    await client.query('BEGIN');

    const locked=await client.query(
      `SELECT id,organization_id
       FROM users
       WHERE supabase_user_id=$1
       FOR UPDATE`,
      [supabaseUser.id]
    );

    if(locked.rows.length){
      await client.query('COMMIT');
      return locked.rows[0];
    }

    const orgId=`org_${crypto.randomUUID().replace(/-/g,'')}`;

    await client.query(
      `INSERT INTO organizations(id,name)
       VALUES($1,$2)`,
      [orgId,`${name}'s Space`]
    );

    const created=await client.query(
      `INSERT INTO users
       (supabase_user_id,email,name,role,organization_id,active)
       VALUES($1,$2,$3,'owner',$4,true)
       RETURNING id,organization_id`,
      [supabaseUser.id,email,name,orgId]
    );

    await client.query('COMMIT');

    return created.rows[0];
  }catch(error){
    await client.query('ROLLBACK');
    throw error;
  }finally{
    client.release();
  }
    }
