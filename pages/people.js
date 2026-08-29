// pages/people.js
// nyeo Care People destination.
// CommunityTab remains the underlying People UI for now; the user-facing
// concept is People, not Community.

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Layout from '../components/Layout';
import CommunityTab from '../components/CommunityTab';
import AttendanceTab from '../components/AttendanceTab';
import ReviewCenterTab from '../components/ReviewCenterTab';
import FirstExperience from '../components/FirstExperience';
import { useOnboarding } from '../components/OnboardingProvider';

export default function PeoplePage() {
  const router = useRouter();
  const onboarding = useOnboarding();
  const { tab } = router.query;

  const [activeTab, setActiveTab] = useState(tab || 'community');

  useEffect(() => {
    if (tab && ['community', 'attendance', 'review'].includes(tab)) {
      setActiveTab(tab);
    }
  }, [tab]);

  const switchTab = newTab => {
    router.push(`/people?tab=${newTab}`, undefined, {
      shallow: true,
    });
    setActiveTab(newTab);
  };

  const showPeopleExperience =
    onboarding?.loaded &&
    onboarding.enabled &&
    !onboarding.isExperienced('people');

  const showReviewExperience =
    onboarding?.loaded &&
    onboarding.enabled &&
    !onboarding.isExperienced('review');

  return (
    <Layout>
      <div
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          padding: '20px',
        }}
      >
        {showPeopleExperience && (
          <FirstExperience
            experience="people"
            onComplete={() =>
              onboarding.completeExperience('people')
            }
          />
        )}

        <div
          style={{
            display: 'flex',
            gap: 12,
            marginBottom: 24,
            borderBottom:
              '1px solid rgba(255,255,255,0.06)',
            paddingBottom: 8,
          }}
        >
          <button
            onClick={() => switchTab('community')}
            className={`fiducia-button ${
              activeTab === 'community'
                ? 'fiducia-button-primary'
                : 'fiducia-button-ghost'
            }`}
            style={{ padding: '6px 16px' }}
          >
            People
          </button>

          <button
            onClick={() => switchTab('attendance')}
            className={`fiducia-button ${
              activeTab === 'attendance'
                ? 'fiducia-button-primary'
                : 'fiducia-button-ghost'
            }`}
            style={{ padding: '6px 16px' }}
          >
            Attendance
          </button>

          <button
            onClick={() => switchTab('review')}
            className={`fiducia-button ${
              activeTab === 'review'
                ? 'fiducia-button-primary'
                : 'fiducia-button-ghost'
            }`}
            style={{ padding: '6px 16px' }}
          >
            Review
          </button>
        </div>

        {activeTab === 'community' && <CommunityTab />}

        {activeTab === 'attendance' && <AttendanceTab />}

        {activeTab === 'review' && (
          <>
            {showReviewExperience && (
              <FirstExperience
                experience="review"
                onComplete={() =>
                  onboarding.completeExperience('review')
                }
              />
            )}

            <ReviewCenterTab />
          </>
        )}
      </div>
    </Layout>
  );
          }
