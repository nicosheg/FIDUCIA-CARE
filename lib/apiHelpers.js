// lib/apiHelpers.js
// Canonical API authorization boundary.
// withOrg = authenticated user + valid organization.
// withAdmin = authenticated user + valid organization + admin role.

import { getCurrentCareUser } from './auth';

export function withOrg(handler) {
  return async (req, res) => {
    try {
      const user = await getCurrentCareUser(req);

      if (!user) {
        return res.status(401).json({
          error: 'Unauthorized',
        });
      }

      if (!user.organization_id) {
        console.error(
          '[AUTH] User resolved without organization:',
          user.id
        );

        return res.status(403).json({
          error: 'Organization access is not configured.',
        });
      }

      req.user = user;
      req.org = {
        id: user.organization_id,
        name: user.organization_name,
      };

      return handler(req, res);
    } catch (err) {
      console.error(
        '[AUTH] withOrg failure:',
        err?.message || err
      );

      return res.status(500).json({
        error: 'Authentication service unavailable.',
      });
    }
  };
}

export function withAdmin(handler) {
  return withOrg(async (req, res) => {
    if (!['owner', 'admin'].includes(req.user.role)) {
      return res.status(403).json({
        error: 'Admin permissions required',
      });
    }

    return handler(req, res);
  });
          }
