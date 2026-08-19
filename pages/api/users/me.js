// pages/api/users/me.js
import { getCurrentCareUser } from '../../../lib/auth';

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).end();

    const user = await getCurrentCareUser(req);
    if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    res.status(200).json(user);
}
