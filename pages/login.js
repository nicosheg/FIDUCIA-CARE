// pages/login.js
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useRouter } from 'next/router';

function getErrorMessage(error) {
    if (typeof error === 'string') return error;
    if (error?.message) return error.message;
    if (error?.error_description) return error.error_description;
    if (typeof error === 'object' && error !== null && Object.keys(error).length === 0) {
        return 'Something went wrong. Please try again.';
    }
    return 'An unexpected error occurred.';
}

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [isLogin, setIsLogin] = useState(true);
    const [name, setName] = useState('');
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
            if (error.message?.includes('already registered') || error.code === 'user_already_exists') {
                setMessage('This email is already registered. Please log in instead.');
            } else if (error.message?.includes('rate limit') || error.message?.includes('rate_limited')) {
                setMessage('You\'ve been temporarily rate-limited. Please wait a moment and try again.');
            } else {
                setMessage(getErrorMessage(error));
            }
        } else {
            setMessage('✅ Account created! You can now log in.');
            setTimeout(() => setIsLogin(true), 2000);
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
            if (error.message?.includes('rate limit')) {
                setMessage('Rate limit exceeded. Please wait a moment before requesting another magic link.');
            } else {
                setMessage(getErrorMessage(error));
            }
        } else {
            setMessage('📨 Check your email — I\'ve sent you a way in.');
        }
        setLoading(false);
    };

    const switchMode = () => {
        setMessage('');
        setIsLogin(!isLogin);
        setPassword('');
    };

    return (
        <div className="auth-container">
            <div className="auth-canvas">
                <div className="auth-ambient" />
            </div>
            <div className="auth-panel">
                <div className="auth-brand">
                    <span className="auth-wordmark">FIDUCIA CARE</span>
                    <span className="auth-tagline">Every Person. Every Story. Remembered.</span>
                </div>

                <p className="auth-welcome">
                    {isLogin
                        ? 'Welcome back. Sign in to continue.'
                        : 'Welcome. Let\'s help you remember every person who matters to your community.'}
                </p>

                <form onSubmit={isLogin ? handleLogin : handleSignup} className="auth-form">
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
                    <button type="submit" disabled={loading} className="auth-button">
                        {loading ? (isLogin ? 'Signing in...' : 'Creating your space...') : (isLogin ? 'Sign In' : 'Sign Up')}
                    </button>
                </form>

                <div className="auth-divider">— or —</div>

                <button onClick={handleMagicLink} disabled={loading} className="auth-magic">
                    Send Magic Link
                </button>

                {message && <p className={`auth-message ${message.includes('✅') ? 'success' : 'error'}`}>{message}</p>}

                <p className="auth-toggle">
                    {isLogin ? (
                        <>Don't have an account? <span onClick={switchMode} className="auth-toggle-link">Create one</span></>
                    ) : (
                        <>Already have an account? <span onClick={switchMode} className="auth-toggle-link">Log in</span></>
                    )}
                </p>
            </div>

            <style jsx>{`
                .auth-container {
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 20px;
                    background: #0A0F1A;
                }

                .auth-canvas {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    z-index: 0;
                    overflow: hidden;
                    background: radial-gradient(ellipse at 50% 50%, #141c2b 0%, #0A0F1A 70%);
                }

                .auth-ambient {
                    position: absolute;
                    width: 150%;
                    height: 150%;
                    top: -25%;
                    left: -25%;
                    background: radial-gradient(ellipse at 40% 50%, rgba(212,175,55,0.02) 0%, transparent 60%);
                    animation: drift 30s ease-in-out infinite;
                }

                @keyframes drift {
                    0% { transform: translateX(0) translateY(0); }
                    50% { transform: translateX(-1%) translateY(-1%); }
                    100% { transform: translateX(0) translateY(0); }
                }

                .auth-panel {
                    position: relative;
                    z-index: 1;
                    width: 100%;
                    max-width: 420px;
                    background: rgba(20,25,40,0.85);
                    backdrop-filter: blur(12px);
                    border-radius: 32px;
                    padding: 40px 32px;
                    border: 1px solid rgba(255,255,255,0.04);
                    box-shadow: 0 8px 60px rgba(0,0,0,0.4);
                }

                .auth-brand {
                    text-align: center;
                    margin-bottom: 24px;
                }

                .auth-wordmark {
                    display: block;
                    font-size: 24px;
                    font-weight: 600;
                    color: #f0f0f0;
                    letter-spacing: -0.5px;
                    padding-bottom: 4px;
                    border-bottom: 2px solid #D4AF37;
                    display: inline-block;
                }

                .auth-tagline {
                    display: block;
                    font-size: 13px;
                    color: rgba(255,255,255,0.3);
                    margin-top: 6px;
                    letter-spacing: 0.3px;
                }

                .auth-welcome {
                    color: rgba(255,255,255,0.6);
                    font-size: 15px;
                    text-align: center;
                    margin-bottom: 24px;
                    line-height: 1.6;
                }

                .auth-form {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
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
                    transition: border-color 0.3s;
                }

                .auth-input:focus {
                    border-color: rgba(212,175,55,0.3);
                }

                .auth-button {
                    width: 100%;
                    padding: 14px;
                    border-radius: 12px;
                    border: none;
                    background: #D4AF37;
                    color: #0A0F1A;
                    font-weight: 600;
                    font-size: 16px;
                    cursor: pointer;
                    transition: background 0.2s, transform 0.1s;
                }

                .auth-button:hover {
                    background: #E8C84A;
                }

                .auth-button:active {
                    transform: scale(0.98);
                }

                .auth-button:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }

                .auth-divider {
                    text-align: center;
                    color: rgba(255,255,255,0.2);
                    font-size: 13px;
                    margin: 16px 0;
                }

                .auth-magic {
                    width: 100%;
                    padding: 12px;
                    border-radius: 12px;
                    border: 1px solid rgba(255,255,255,0.08);
                    background: transparent;
                    color: rgba(255,255,255,0.6);
                    font-size: 14px;
                    cursor: pointer;
                    transition: background 0.2s;
                }

                .auth-magic:hover {
                    background: rgba(255,255,255,0.03);
                }

                .auth-message {
                    margin-top: 16px;
                    text-align: center;
                    font-size: 14px;
                    padding: 10px 12px;
                    border-radius: 8px;
                }

                .auth-message.error {
                    color: #EF4444;
                    background: rgba(239,68,68,0.05);
                }

                .auth-message.success {
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
                }

                .auth-toggle-link:hover {
                    text-decoration: underline;
                }
            `}</style>
        </div>
    );
            }
