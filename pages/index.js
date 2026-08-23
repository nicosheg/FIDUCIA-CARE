// pages/index.js
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import Layout from '../components/Layout';
import CareQueueList from '../components/CareQueueList';
import ScanModal from '../components/ScanModal';

export default function ARIAHome() {
    const router = useRouter();
    const [briefing, setBriefing] = useState(null);
    const [priority, setPriority] = useState([]);
    const [brainFeed, setBrainFeed] = useState([]);
    const [recommendations, setRecommendations] = useState([]);
    const [ariaObservations, setAriaObservations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showScanModal, setShowScanModal] = useState(false);

    useEffect(() => {
        async function init() {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                router.push('/login');
                return;
            }

            try {
                const headers = { 'Authorization': `Bearer ${session.access_token}` };
                const [briefRes, prioRes, feedRes, recRes, obsRes] = await Promise.all([
                    fetch('/api/daily-briefing/latest', { headers }),
                    fetch('/api/priority-queue?limit=10', { headers }),
                    fetch('/api/brain-feed?limit=10', { headers }),
                    fetch('/api/recommendations', { headers }),
                    fetch('/api/aria/observations?limit=5', { headers }),
                ]);

                const brief = briefRes.ok ? await briefRes.json() : null;
                setBriefing(brief);

                const prio = prioRes.ok ? await prioRes.json() : [];
                setPriority(prio);

                const feed = feedRes.ok ? await feedRes.json() : [];
                setBrainFeed(feed);

                const recs = recRes.ok ? await recRes.json() : [];
                setRecommendations(recs);

                const obs = obsRes.ok ? await obsRes.json() : [];
                setAriaObservations(obs);
            } catch (e) {
                console.error('ARIA Today load error:', e);
            } finally {
                setLoading(false);
            }
        }
        init();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (!session) router.push('/login');
        });
        return () => subscription.unsubscribe();
    }, [router]);

    if (loading) {
        return (
            <Layout>
                <div style={{ padding: 40, maxWidth: 900, margin: '0 auto' }}>
                    <div className="fiducia-card shimmer" style={{ padding: 24, height: 200 }} />
                </div>
            </Layout>
        );
    }

    const summary = briefing?.summary || 'Good morning. ARIA is ready.';

    return (
        <Layout>
            <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 20px' }}>
                <h1 style={{ fontSize: 28, fontWeight: 600, color: '#f0f0f0', marginBottom: 8 }}>
                    ARIA Today
                </h1>
                <p className="aria-speaks" style={{ fontSize: 18, color: 'rgba(255,255,255,0.7)', marginBottom: 24, whiteSpace: 'pre-line' }}>
                    {summary}
                </p>

                {/* ARIA Observations (highest attention) */}
                {ariaObservations.length > 0 && (
                    <div style={{ marginBottom: 32 }}>
                        <h2 style={{ fontSize: 20, fontWeight: 500, color: '#f0f0f0', marginBottom: 12 }}>
                            What Matters Now
                        </h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {ariaObservations.map((obs, idx) => (
                                <div key={idx} className="fiducia-card" style={{ padding: '12px 20px', marginBottom: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{
                                            display: 'inline-block',
                                            width: 8,
                                            height: 8,
                                            borderRadius: '50%',
                                            background: obs.severity === 'critical' ? '#EF4444' :
                                                       obs.severity === 'high' ? '#F59E0B' :
                                                       obs.severity === 'medium' ? '#FBBF24' : '#34D399',
                                        }} />
                                        <span style={{ color: '#f0f0f0', fontWeight: 500 }}>{obs.type.replace(/_/g, ' ')}</span>
                                        {obs.first_name && <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>— {obs.first_name}</span>}
                                    </div>
                                    <div style={{ marginTop: 4 }}>
                                        <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
                                            Confidence: {Math.round(obs.confidence * 100)}% · Attention: {obs.attention_score}
                                        </span>
                                        {obs.evidence && obs.evidence.inference && (
                                            <p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
                                                {obs.evidence.inference}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Priority Queue */}
                {priority.length > 0 ? (
                    <div style={{ marginBottom: 32 }}>
                        <h2 style={{ fontSize: 20, fontWeight: 500, color: '#f0f0f0', marginBottom: 12 }}>Top Priority</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {priority.slice(0, 10).map((p, idx) => (
                                <div key={idx} className="fiducia-card" style={{ padding: '12px 20px', marginBottom: 0 }}>
                                    <span style={{ color: '#f0f0f0', fontWeight: 500 }}>{p.first_name}</span>
                                    <span style={{ color: 'rgba(255,255,255,0.3)', marginLeft: 8 }}>• Score: {p.priority_score}</span>
                                    <span style={{ color: 'rgba(255,255,255,0.2)', marginLeft: 8, fontSize: 12 }}>
                                        {p.living_truth_status || 'active'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div style={{ marginBottom: 32 }}>
                        <p style={{ color: 'rgba(255,255,255,0.3)' }}>No priority signals yet.</p>
                    </div>
                )}

                <CareQueueList />

                {brainFeed.length > 0 && (
                    <div style={{ marginBottom: 32 }}>
                        <h2 style={{ fontSize: 20, fontWeight: 500, color: '#f0f0f0', marginBottom: 12 }}>Intelligence Feed</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {brainFeed.slice(0, 5).map((item, idx) => (
                                <div key={idx} className="fiducia-card" style={{ padding: '12px 20px', marginBottom: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{
                                            display: 'inline-block',
                                            width: 8,
                                            height: 8,
                                            borderRadius: '50%',
                                            background: item.priority === 2 ? '#EF4444' : item.priority === 1 ? '#F59E0B' : '#34D399',
                                        }} />
                                        <span style={{ color: '#f0f0f0', fontWeight: 500 }}>{item.title}</span>
                                    </div>
                                    <p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>{item.description}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {recommendations.length > 0 && (
                    <div style={{ marginBottom: 32 }}>
                        <h2 style={{ fontSize: 20, fontWeight: 500, color: '#f0f0f0', marginBottom: 12 }}>Recommended Actions</h2>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {recommendations.slice(0, 5).map((rec, idx) => (
                                <div key={idx} className="fiducia-card" style={{ padding: '12px 20px', marginBottom: 0 }}>
                                    <span style={{ color: '#f0f0f0' }}>{rec.recommendation_text}</span>
                                    <span style={{ color: 'rgba(255,255,255,0.3)', marginLeft: 8 }}>• {rec.action_type}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
                    <button onClick={() => setShowScanModal(true)} className="fiducia-button fiducia-button-primary">Scan Register</button>
                    <a href="/people?tab=community" className="fiducia-button fiducia-button-secondary">Community</a>
                    <a href="/people?tab=review" className="fiducia-button fiducia-button-ghost">Review Center</a>
                    <a href="/people?tab=attendance" className="fiducia-button fiducia-button-ghost">Attendance</a>
                </div>
            </div>

            <ScanModal isOpen={showScanModal} onClose={() => setShowScanModal(false)} />
        </Layout>
    );
                           }
