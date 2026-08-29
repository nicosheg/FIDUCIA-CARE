// pages/profile.js
// nyeo Care organization profile.
// The existing ChurchProfileTab filename is retained for compatibility,
// but its user-facing terminology is now organization-based.

import Layout from '../components/Layout';
import ChurchProfileTab from '../components/ChurchProfileTab';
import FirstExperience from '../components/FirstExperience';
import { useOnboarding } from '../components/OnboardingProvider';

export default function ProfilePage() {
  const onboarding = useOnboarding();

  const showProfileExperience =
    onboarding?.loaded &&
    onboarding.enabled &&
    !onboarding.isExperienced('profile');

  return (
    <Layout>
      <div
        style={{
          maxWidth: 700,
          margin: '0 auto',
          padding: '40px 20px',
        }}
      >
        {showProfileExperience && (
          <FirstExperience
            experience="profile"
            onComplete={() =>
              onboarding.completeExperience('profile')
            }
          />
        )}

        <h1
          style={{
            fontSize: 28,
            fontWeight: 600,
            color: '#f0f0f0',
            marginBottom: 30,
          }}
        >
          Profile
        </h1>

        <div style={{ marginBottom: 40 }}>
          <h2
            style={{
              fontSize: 20,
              fontWeight: 500,
              color: '#f0f0f0',
              marginBottom: 16,
            }}
          >
            Organization Profile
          </h2>

          <ChurchProfileTab />
        </div>

        <div style={{ marginBottom: 40 }}>
          <h2
            style={{
              fontSize: 20,
              fontWeight: 500,
              color: '#f0f0f0',
              marginBottom: 16,
            }}
          >
            Account
          </h2>

          <div
            className="fiducia-card"
            style={{ padding: 24 }}
          >
            <p
              style={{
                color: 'rgba(255,255,255,0.5)',
              }}
            >
              Account settings will appear here.
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
          }
