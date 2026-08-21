// pages/login.js
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useRouter } from 'next/router';

function getErrorMessage(error) {
    if (typeof error === 'string') return error;
    if (error?.message) return error.message;
    if (error?.error_description) return error.error_description;
    if (typeof error === 'object' && error !== null) {
        return JSON.stringify(error);
    }
    return 'Something went wrong. Please try again.';
}

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const router = useRouter();

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) router.push('/');
        });
    }, []);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage('');
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
            setMessage(getErrorMessage(error));
        } else {
            router.push('/');
        }
        setLoading(false);
    };

    const handleMagicLink = async () => {
        if (!email) {
            setMessage('Please enter your email first.');
            return;
        }
        setLoading(true);
        setMessage('');
        const { error } = await supabase.auth.signInWithOtp({
            email,
            options: {
                emailRedirectTo: window.location.origin,
            },
        });
        if (error) {
            setMessage(getErrorMessage(error));
        } else {
            setMessage('Check your email for the login link.');
        }
        setLoading(false);
    };

    return (
        <div style={{ maxWidth: 400, margin: '80px auto', padding: '0 20px' }}>
            <h1 style={{ color: '#f0f0f0' }}>FIDUCIA CARE</h1>
            <p style={{ color: 'rgba(255,255,255,0.6)' }}>Sign in to your account</p>
            <form onSubmit={handleLogin} style={{ marginTop: 30 }}>
                <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    style={{ width: '100%', padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(20,25,40,0.8)', color: '#fff', marginBottom: 12 }}
                />
                <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    style={{ width: '100%', padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(20,25,40,0.8)', color: '#fff', marginBottom: 12 }}
                />
                <button type="submit" disabled={loading} style={{ width: '100%', padding: 12, borderRadius: 8, border: 'none', background: '#D4AF37', color: '#0A0F1A', fontWeight: 600 }}>
                    {loading ? 'Signing in...' : 'Sign In with Password'}
                </button>
            </form>
            <div style={{ marginTop: 16, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>— or —</div>
            <button
                onClick={handleMagicLink}
                disabled={loading}
                style={{ width: '100%', padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#f0f0f0', marginTop: 12 }}
            >
                Send Magic Link
            </button>
            {message && <p style={{ marginTop: 16, color: '#EF4444', textAlign: 'center' }}>{message}</p>}
        </div>
    );
}
