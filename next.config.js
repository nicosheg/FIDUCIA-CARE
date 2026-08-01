/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      { source: '/members', destination: '/community', permanent: true },
    ];
  },
  env: {
    NEXT_PUBLIC_APP_NAME: 'FIDUCIA CARE',
  },
};
module.exports = nextConfig;
