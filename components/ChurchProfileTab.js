// components/ChurchProfileTab.js
// Legacy filename retained for compatibility.
// User-facing concept: Organization Profile.
// This component also stores ARIA's editable organization-level guidance.

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function ChurchProfileTab() {
  const [services, setServices] = useState([
    { day: 'Sunday', time: '09:00' },
  ]);
  const [programs, setPrograms] = useState([{ name: '' }]);
  const [ariaInstructions, setAriaInstructions] = useState('');
  const [saved, setSaved] = useState(false);
  const [ariaSaved, setAriaSaved] = useState(false);

  useEffect(() => {
    async function fetchProfile() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) return;

      try {
        const headers = {
          Authorization: `Bearer ${session.access_token}`,
        };

        const [profileRes, onboardingRes] = await Promise.all([
          fetch('/api/church-profile', { headers }),
          fetch('/api/onboarding', { headers }),
        ]);

        if (profileRes.ok) {
          const data = await profileRes.json();

          if (data.services) setServices(data.services);
          if (data.programs) setPrograms(data.programs);
        }

        if (onboardingRes.ok) {
          const data = await onboardingRes.json();
          setAriaInstructions(data.ariaInstructions || '');
        }
      } catch (error) {
        console.error('[PROFILE] Load error:', error);
      }
    }

    fetchProfile();
  }, []);

  const saveProfile = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) return;

    try {
      const response = await fetch('/api/church-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          services: services.filter(s => s.day),
          programs: programs.filter(p => p.name),
        }),
      });

      if (!response.ok) {
        throw new Error('Unable to save organization profile');
      }

      setSaved(true);

      setTimeout(() => {
        setSaved(false);
      }, 2000);
    } catch (error) {
      console.error('[PROFILE] Save error:', error);
    }
  };

  const saveAriaInstructions = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) return;

    try {
      const response = await fetch('/api/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          action: 'save_aria_instructions',
          ariaInstructions,
        }),
      });

      if (!response.ok) {
        throw new Error('Unable to save ARIA instructions');
      }

      setAriaSaved(true);

      setTimeout(() => {
        setAriaSaved(false);
      }, 2000);
    } catch (error) {
      console.error('[ARIA] Instruction save error:', error);
    }
  };

  const addService = () =>
    setServices([...services, { day: '', time: '' }]);

  const addProgram = () =>
    setPrograms([...programs, { name: '' }]);

  return (
    <div className="organization-profile-tab">
      {/* ARIA organization-level guidance */}
      <div
        className="fiducia-card"
        style={{
          padding: 24,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            color: '#D4AF37',
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: '.08em',
            textTransform: 'uppercase',
            marginBottom: 8,
          }}
        >
          ARIA
        </div>

        <h3
          style={{
            color: '#f0f0f0',
            margin: '0 0 8px',
            fontSize: 20,
            fontWeight: 500,
          }}
        >
          What should ARIA keep in mind?
        </h3>

        <p
          style={{
            color: 'rgba(255,255,255,.5)',
            lineHeight: 1.6,
            marginBottom: 16,
          }}
        >
          Tell ARIA something important about your organization.
          You can change this whenever you want.
        </p>

        <textarea
          value={ariaInstructions}
          onChange={e =>
            setAriaInstructions(e.target.value)
          }
          maxLength={2000}
          placeholder="For example: We care deeply about noticing people who may be quietly becoming disconnected."
          style={{
            width: '100%',
            minHeight: 120,
            resize: 'vertical',
            padding: 14,
            borderRadius: 14,
            border: '1px solid rgba(255,255,255,.08)',
            background: 'rgba(255,255,255,.03)',
            color: '#fff',
            outline: 'none',
            fontSize: 15,
            lineHeight: 1.6,
            fontFamily: 'inherit',
          }}
        />

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 12,
            gap: 12,
          }}
        >
          <span
            style={{
              color: 'rgba(255,255,255,.3)',
              fontSize: 12,
            }}
          >
            {ariaInstructions.length}/2000
          </span>

          <button
            onClick={saveAriaInstructions}
            className="fiducia-button fiducia-button-primary"
          >
            {ariaSaved ? 'Saved ✓' : 'Save for ARIA'}
          </button>
        </div>
      </div>

      {/* Organization schedule */}
      <div
        className="fiducia-card"
        style={{
          padding: 24,
          marginBottom: 20,
        }}
      >
        <h3
          style={{
            color: '#D4AF37',
            marginBottom: 16,
          }}
        >
          Schedule
        </h3>

        {services.map((s, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              gap: 10,
              marginBottom: 10,
            }}
          >
            <input
              placeholder="Day"
              value={s.day}
              onChange={e => {
                const newServices = [...services];
                newServices[i] = {
                  ...newServices[i],
                  day: e.target.value,
                };
                setServices(newServices);
              }}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.03)',
                color: '#fff',
                outline: 'none',
                flex: 1,
              }}
            />

            <input
              placeholder="Time"
              value={s.time}
              onChange={e => {
                const newServices = [...services];
                newServices[i] = {
                  ...newServices[i],
                  time: e.target.value,
                };
                setServices(newServices);
              }}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.03)',
                color: '#fff',
                outline: 'none',
                flex: 1,
              }}
            />

            <button
              onClick={() =>
                setServices(
                  services.filter((_, idx) => idx !== i)
                )
              }
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255,255,255,0.4)',
                cursor: 'pointer',
                fontSize: 16,
              }}
            >
              ✕
            </button>
          </div>
        ))}

        <button
          onClick={addService}
          className="fiducia-button fiducia-button-ghost"
          style={{ marginTop: 8 }}
        >
          + Add Schedule
        </button>
      </div>

      {/* Organization programs/events */}
      <div
        className="fiducia-card"
        style={{
          padding: 24,
          marginBottom: 30,
        }}
      >
        <h3
          style={{
            color: '#D4AF37',
            marginBottom: 16,
          }}
        >
          Programs / Events
        </h3>

        {programs.map((p, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              gap: 10,
              marginBottom: 10,
            }}
          >
            <input
              placeholder="Program name"
              value={p.name}
              onChange={e => {
                const newPrograms = [...programs];
                newPrograms[i] = {
                  ...newPrograms[i],
                  name: e.target.value,
                };
                setPrograms(newPrograms);
              }}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.03)',
                color: '#fff',
                outline: 'none',
                flex: 1,
              }}
            />

            <button
              onClick={() =>
                setPrograms(
                  programs.filter((_, idx) => idx !== i)
                )
              }
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255,255,255,0.4)',
                cursor: 'pointer',
                fontSize: 16,
              }}
            >
              ✕
            </button>
          </div>
        ))}

        <button
          onClick={addProgram}
          className="fiducia-button fiducia-button-ghost"
          style={{ marginTop: 8 }}
        >
          + Add Program
        </button>
      </div>

      <button
        onClick={saveProfile}
        className="fiducia-button fiducia-button-primary"
        style={{ width: '100%' }}
      >
        {saved ? 'Saved ✓' : 'Save Profile'}
      </button>
    </div>
  );
                                    }
