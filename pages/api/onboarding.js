// pages/api/onboarding.js
// Central nyeo Care onboarding controller.
// Existing organizations without onboarding.enabled=true are permanently exempt.

import pool from '../../lib/db';
import { withOrg } from '../../lib/apiHelpers';

const REQUIRED_EXPERIENCES = ['home', 'scan', 'people', 'review', 'profile'];

function normalizeOnboarding(settings) {
  const onboarding = settings?.onboarding;

  // Legacy/existing organizations never enter the new onboarding system.
  if (!onboarding || onboarding.enabled !== true) {
    return {
      enabled: false,
      experienced: {
        home: true,
        scan: true,
        people: true,
        review: true,
        profile: true,
      },
      completed: true,
    };
  }

  const experienced = {
    home: onboarding.experienced?.home === true,
    scan: onboarding.experienced?.scan === true,
    people: onboarding.experienced?.people === true,
    review: onboarding.experienced?.review === true,
    profile: onboarding.experienced?.profile === true,
  };

  return {
    enabled: true,
    experienced,
    completed: REQUIRED_EXPERIENCES.every(key => experienced[key] === true),
  };
}

async function handler(req, res) {
  const orgId = req.org.id;

  if (req.method === 'GET') {
    try {
      const result = await pool.query(
        `SELECT settings, aria_instructions, onboarding_completed_at
         FROM public.organizations
         WHERE id = $1
         LIMIT 1`,
        [orgId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      const organization = result.rows[0];
      const onboarding = normalizeOnboarding(organization.settings);

      return res.status(200).json({
        onboarding,
        ariaInstructions: organization.aria_instructions || '',
        onboardingCompletedAt: organization.onboarding_completed_at,
      });
    } catch (error) {
      console.error('[ONBOARDING] GET error:', error);
      return res.status(500).json({ error: 'Unable to load onboarding state' });
    }
  }

  if (req.method === 'POST') {
    const { action, experience, ariaInstructions } = req.body || {};

    try {
      const result = await pool.query(
        `SELECT settings
         FROM public.organizations
         WHERE id = $1
         LIMIT 1`,
        [orgId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Organization not found' });
      }

      const currentSettings = result.rows[0].settings || {};
      const currentOnboarding = currentSettings.onboarding;

      // Existing organizations are not part of the new system.
      if (!currentOnboarding || currentOnboarding.enabled !== true) {
        return res.status(200).json({
          success: true,
          onboarding: { enabled: false, completed: true },
        });
      }

      if (action === 'experience_completed') {
        if (!REQUIRED_EXPERIENCES.includes(experience)) {
          return res.status(400).json({ error: 'Invalid onboarding experience' });
        }

        const experienced = {
          home: currentOnboarding.experienced?.home === true,
          scan: currentOnboarding.experienced?.scan === true,
          people: currentOnboarding.experienced?.people === true,
          review: currentOnboarding.experienced?.review === true,
          profile: currentOnboarding.experienced?.profile === true,
        };

        experienced[experience] = true;

        const completed = REQUIRED_EXPERIENCES.every(
          key => experienced[key] === true
        );

        const newSettings = {
          ...currentSettings,
          onboarding: {
            ...currentOnboarding,
            enabled: true,
            experienced,
          },
        };

        await pool.query(
          `UPDATE public.organizations
           SET settings = $1::jsonb,
               onboarding_completed_at = CASE
                 WHEN $2 = true THEN COALESCE(onboarding_completed_at, NOW())
                 ELSE onboarding_completed_at
               END,
               updated_at = NOW()
           WHERE id = $3`,
          [JSON.stringify(newSettings), completed, orgId]
        );

        return res.status(200).json({
          success: true,
          onboarding: { enabled: true, experienced, completed },
        });
      }

      if (action === 'save_aria_instructions') {
        if (
          ariaInstructions !== null &&
          ariaInstructions !== undefined &&
          typeof ariaInstructions !== 'string'
        ) {
          return res.status(400).json({
            error: 'ARIA instructions must be text',
          });
        }

        const cleaned =
          typeof ariaInstructions === 'string'
            ? ariaInstructions.trim()
            : '';

        if (cleaned.length > 2000) {
          return res.status(400).json({
            error: 'ARIA instructions must be 2000 characters or less',
          });
        }

        await pool.query(
          `UPDATE public.organizations
           SET aria_instructions = $1,
               updated_at = NOW()
           WHERE id = $2`,
          [cleaned || null, orgId]
        );

        return res.status(200).json({
          success: true,
          ariaInstructions: cleaned,
        });
      }

      return res.status(400).json({ error: 'Unknown onboarding action' });
    } catch (error) {
      console.error('[ONBOARDING] POST error:', error);
      return res.status(500).json({ error: 'Unable to update onboarding' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export default withOrg(handler);
