// lib/supabaseAdmin.js – server-only, do not import from frontend pages
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!serviceRoleKey) {
    console.warn('SUPABASE_SERVICE_ROLE_KEY is not set. Admin client will not work.')
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)
