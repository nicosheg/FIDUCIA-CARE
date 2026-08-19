// scripts/create-owner.js
// Run with: node scripts/create-owner.js
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing environment variables. Ensure .env.local has NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

import readline from 'readline';
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

const ask = (question) => new Promise((resolve) => rl.question(question, resolve));

(async () => {
    const orgId = await ask('Organization ID (e.g., demo-org): ');
    const email = await ask('Owner email: ');
    const name = await ask('Owner name: ');
    rl.close();

    if (!orgId || !email || !name) {
        console.error('All fields are required.');
        process.exit(1);
    }

    const { data: existing, error: checkError } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .eq('organization_id', orgId);

    if (existing && existing.length > 0) {
        console.log('User already exists.');
        process.exit(0);
    }

    const { data, error } = await supabase
        .from('users')
        .insert({
            organization_id: orgId,
            email,
            name,
            role: 'owner',
        })
        .select();

    if (error) {
        console.error('Error creating owner:', error);
        process.exit(1);
    }

    console.log('✅ FIDUCIA CARE owner created:', data[0]);
})();
