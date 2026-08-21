// pages/signup.js
import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useRouter } from 'next/router';

// Helper to safely extract error message
function getErrorMessage(error) {
    if (typeof error === 'string') return error;
    if (error?.message) return error.message;
    if (error?.error_description) return error.error_description;
    if (typeof error === 'object' && error !== null) {
        return JSON.stringify(error);
    }
    return 'Something went wrong. Please try again.';
}

export default function Signup() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const router = useRouter();

    const handleSignup = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage('');
        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { name },
            },
        });
        if (error) {
            setMessage(getErrorMessage(error));
        } else {
            setMessage('Account created! Please check your email to confirm.');
            setTimeout(() => router.push('/login'), 3000);
        }
        setLoading(false);
    };

    return (
        <div style={{ maxWidth: 400, margin: '80px auto', padding: '0 20px' }}>
            <h1 style={{ color: '#f0f0f0' }}>Create FIDUCIA CARE Account</h1>
            <form onSubmit={handleSignup} style={{ marginTop: 30 }}>
                <input
                    type="text"
                    placeholder="Full Name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                    style={{ width: '100%', padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(20,25,40,0.8)', color: '#fff', marginBottom: 12, outline: 'none' }}
                />
                <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    style={{ width: '100%', padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(20,25,40,0.8)', color: '#fff', marginBottom: 12, outline: 'none' }}
                />
                <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    style={{ width: '100%', padding: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(20,25,40,0.8)', color: '#fff', marginBottom: 12, outline: 'none' }}
                />
                <button
                    type="submit"
                    disabled={loading}
                    style={{
                        width: '100%',
                        padding: 12,
                        borderRadius: 8,
                        border: 'none',
                        background: '#D4AF37',
                        color: '#0A0F1A',
                        fontWeight: 600,
                        cursor: 'pointer',
                    }}
                >
                    {loading ? 'Creating account...' : 'Sign Up'}
                </button>
            </form>
            {message && <p style={{ marginTop: 16, color: message.includes('Check') ? '#34D399' : '#EF4444', textAlign: 'center' }}>{message}</p>}
            <p style={{ marginTop: 16, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>
                Already have an account? <a href="/login" style={{ color: '#D4AF37' }}>Log in</a>
            </p>
        </div>
    );
}
