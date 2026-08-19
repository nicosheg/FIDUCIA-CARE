// lib/apiHelpers.js
import { getCurrentCareUser } from './auth';

export function withOrg(handler) {
    return async (req, res) => {
        const user = await getCurrentCareUser(req);
        if (!user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!user.organization_id) {
            return res.status(403).json({ error: 'No organization assigned to user' });
        }
        req.user = user;
        req.org = { id: user.organization_id, name: user.organization_name };
        return handler(req, res);
    };
}
