// pages/login.js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import Layout from '../components/Layout';

function getErrorMessage(error) {
    if (typeof error === 'string') return error;
    if (error?.message) {
        // Translate common Supabase errors
        const msg = error.message;
        if (msg.includes('rate limit')) return 'Could not send the email right now. Please wait a moment and try again.';
        if (msg.includes('already registered')) return 'This email is already registered. Please log in instead.';
        if (msg.includes('invalid credentials')) return 'The email or password you entered is incorrect. Please try again.';
        if (msg.includes('email not confirmed')) return 'Please confirm your email address first. Check your inbox for the confirmation link.';
        return msg;
    }
    if (error?.error_description) return error.error_description;
    if (typeof error === 'object' && error !== null && Object.keys(error).length === 0) {
        return 'Something went wrong. Please try again.';
    }
    return 'An unexpected error occurred. Please try again.';
}

export default function AuthPage() {
    const router = useRouter();
    const { mode } = router.query;
    const isLogin = mode !== 'signup';

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [messageType, setMessageType] = useState(''); // 'error' or 'success'

    useEffect(() => {
        // Check if already logged in
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) router.push('/');
        });
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage('');
        setMessageType('');

        if (isLogin) {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) {
                setMessage(getErrorMessage(error));
                setMessageType('error');
            } else {
                router.push('/');
            }
        } else {
            const { error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: { name },
                },
            });
            if (error) {
                setMessage(getErrorMessage(error));
                setMessageType('error');
            } else {
                setMessage('✅ Check your email to confirm your address, then log in.');
                setMessageType('success');
                // Optionally switch to login mode after a delay
                setTimeout(() => {
                    router.push('/login');
                }, 3000);
            }
        }
        setLoading(false);
    };

    const handleMagicLink = async () => {
        if (!email) {
            setMessage('Please enter your email first.');
            setMessageType('error');
            return;
        }
        setLoading(true);
        setMessage('');
        setMessageType('');
        const { error } = await supabase.auth.signInWithOtp({
            email,
            options: {
                emailRedirectTo: window.location.origin,
            },
        });
        if (error) {
            setMessage(getErrorMessage(error));
            setMessageType('error');
        } else {
            setMessage('📨 Check your email — we\'ve sent you a magic link.');
            setMessageType('success');
        }
        setLoading(false);
    };

    const toggleMode = () => {
        setMessage('');
        setMessageType('');
        setPassword('');
        // Toggle between login and signup by changing the URL query param
        const newMode = isLogin ? 'signup' : undefined;
        router.push(`/login${newMode ? '?mode=signup' : ''}`);
    };

    return (
        <Layout>
            <div className="auth-container">
                <div className="fiducia-card auth-card">
                    <div className="auth-brand">
                        <h1 className="auth-title">FIDUCIA CARE</h1>
                        <p className="auth-tagline">Every Person. Every Story. Remembered.</p>
                    </div>

                    <p className="auth-welcome">
                        {isLogin ? 'Welcome back.' : 'Create your account.'}
                    </p>

                    <form onSubmit={handleSubmit} className="auth-form">
                        {!isLogin && (
                            <input
                                type="text"
                                placeholder="Full Name"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                required
                                className="auth-input"
                            />
                        )}
                        <input
                            type="email"
                            placeholder="Email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                            className="auth-input"
                        />
                        <input
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                            className="auth-input"
                        />
                        <button type="submit" disabled={loading} className="fiducia-button fiducia-button-primary auth-submit">
                            {loading ? (isLogin ? 'Signing in...' : 'Creating account...') : (isLogin ? 'Log In' : 'Create Account')}
                        </button>
                    </form>

                    <div className="auth-divider">— or —</div>

                    <button onClick={handleMagicLink} disabled={loading} className="fiducia-button fiducia-button-ghost auth-magic">
                        Continue with email link
                    </button>

                    {message && (
                        <p className={`auth-message ${messageType === 'error' ? 'auth-error' : 'auth-success'}`}>
                            {message}
                        </p>
                    )}

                    <p className="auth-toggle">
                        {isLogin ? (
                            <>Don't have an account? <span onClick={toggleMode} className="auth-toggle-link">Create one</span></>
                        ) : (
                            <>Already have an account? <span onClick={toggleMode} className="auth-toggle-link">Log in</span></>
                        )}
                    </p>
                </div>
            </div>

            <style jsx>{`
                .auth-container {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 80vh;
                    padding: 20px;
                }

                .auth-card {
                    max-width: 420px;
                    width: 100%;
                    padding: 40px 32px;
                    background: rgba(20,25,40,0.85);
                    backdrop-filter: blur(12px);
                    border: 1px solid rgba(255,255,255,0.04);
                    box-shadow: 0 8px 60px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.02);
                    border-radius: 32px;
                    animation: cardBreathe 20s ease-in-out infinite alternate;
                }

                .auth-brand {
                    text-align: center;
                    margin-bottom: 24px;
                }

                .auth-title {
                    font-size: 26px;
                    font-weight: 600;
                    color: #f0f0f0;
                    letter-spacing: -0.5px;
                    margin: 0;
                    padding-bottom: 4px;
                    border-bottom: 2px solid #D4AF37;
                    display: inline-block;
                }

                .auth-tagline {
                    font-size: 13px;
                    color: rgba(255,255,255,0.3);
                    margin-top: 6px;
                    letter-spacing: 0.3px;
                }

                .auth-welcome {
                    color: rgba(255,255,255,0.6);
                    font-size: 16px;
                    text-align: center;
                    margin-bottom: 24px;
                }

                .auth-form {
                    display: flex;
                    flex-direction: column;
                    gap: 14px;
                }

                .auth-input {
                    width: 100%;
                    padding: 14px 16px;
                    border-radius: 12px;
                    border: 1px solid rgba(255,255,255,0.06);
                    background: rgba(255,255,255,0.03);
                    color: #f0f0f0;
                    font-size: 15px;
                    outline: none;
                    transition: border-color 0.3s, background 0.3s;
                }

                .auth-input:focus {
                    border-color: rgba(212,175,55,0.3);
                    background: rgba(255,255,255,0.05);
                }

                .auth-input::placeholder {
                    color: rgba(255,255,255,0.25);
                }

                .auth-submit {
                    width: 100%;
                    padding: 14px;
                    font-size: 16px;
                    margin-top: 4px;
                }

                .auth-divider {
                    text-align: center;
                    color: rgba(255,255,255,0.2);
                    font-size: 13px;
                    margin: 18px 0;
                }

                .auth-magic {
                    width: 100%;
                    padding: 12px;
                    font-size: 14px;
                    border-color: rgba(255,255,255,0.08);
                }

                .auth-message {
                    margin-top: 16px;
                    text-align: center;
                    font-size: 14px;
                    padding: 10px 12px;
                    border-radius: 8px;
                }

                .auth-error {
                    color: #EF4444;
                    background: rgba(239,68,68,0.05);
                }

                .auth-success {
                    color: #34D399;
                    background: rgba(52,211,153,0.05);
                }

                .auth-toggle {
                    text-align: center;
                    color: rgba(255,255,255,0.4);
                    font-size: 14px;
                    margin-top: 20px;
                }

                .auth-toggle-link {
                    color: #D4AF37;
                    cursor: pointer;
                    font-weight: 500;
                    transition: color 0.2s;
                }

                .auth-toggle-link:hover {
                    color: #E8C84A;
                }

                @media (max-width: 480px) {
                    .auth-card {
                        padding: 32px 20px;
                    }
                    .auth-title {
                        font-size: 22px;
                    }
                }
            `}</style>
        </Layout>
    );
        }
