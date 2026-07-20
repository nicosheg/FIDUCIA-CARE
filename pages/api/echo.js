export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  // Just acknowledge the upload, do nothing else
  res.status(200).json({ message: 'Upload received successfully' });
}
