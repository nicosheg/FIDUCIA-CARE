// hooks/useOrganization.js
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export function useOrganization() {
    const [org, setOrg] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchOrg() {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                setLoading(false);
                return;
            }
            try {
                const res = await fetch('/api/users/me', {
                    headers: { Authorization: `Bearer ${session.access_token}` }
                });
                if (res.ok) {
                    const user = await res.json();
                    if (user && user.organization_id) {
                        setOrg({ id: user.organization_id, name: user.organization_name });
                    }
                }
            } catch (e) {
                console.error('Error fetching organization:', e);
            }
            setLoading(false);
        }
        fetchOrg();
    }, []);

    return { org, loading };
                }
