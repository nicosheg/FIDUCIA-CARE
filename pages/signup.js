// pages/signup.js
import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useRouter } from 'next/router';

function getErrorMessage(error) {
    // If error is null/undefined, return a generic message
    if (!error) return 'Something went wrong. Please try again.';
    
    // If it's a string, use it directly
    if (typeof error === 'string') return error;
    
    // If it has a message property, use that
    if (error.message) return error.message;
    
    // If it has an error_description (common in OAuth errors)
    if (error.error_description) return error.error_description;
    
    // If it's an empty object, we don't know the real error
    if (typeof error === 'object' && Object.keys(error).length === 0) {
        return 'An unknown error occurred. Please check your connection and try again.';
    }
    
    // Fallback: stringify the object (but we should avoid showing raw JSON to users)
    return JSON.stringify(error);
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
        try {
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: { name },
                },
            });
            
            // Debug: log the full response to the console
            console.log('Signup response:', { data, error });
            
            if (error) {
                setMessage(getErrorMessage(error));
            } else {
                setMessage('Account created! Please check your email to confirm.');
                // Redirect to login after a delay
                setTimeout(() => router.push('/login'), 3000);
            }
        } catch (err) {
            // Catch any network/other errors
            console.error('Signup exception:', err);
            setMessage('Network error. Please check your connection and try again.');
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
