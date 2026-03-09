/** @type {import('next').NextConfig} */
const path = require('path');

const API_BACKEND = process.env.API_BACKEND_URL || 'http://localhost:4000';

const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "coin-images.coingecko.com",
        pathname: "/coins/images/**",
      },
      {
        protocol: "https",
        hostname: "assets.coingecko.com",
        pathname: "/**",
      },
    ],
  },
  async rewrites() {
    return [
      { source: '/api/v1/auth/:path*', destination: `${API_BACKEND}/api/v1/auth/:path*` },
      { source: '/api/v1/wallet/:path*', destination: `${API_BACKEND}/api/v1/wallet/:path*` },
      { source: '/api/v1/profile', destination: `${API_BACKEND}/api/v1/profile` },
      { source: '/api/v1/profile/:path*', destination: `${API_BACKEND}/api/v1/profile/:path*` },
      { source: '/api/v1/accounts', destination: `${API_BACKEND}/api/v1/accounts` },
      { source: '/api/v1/accounts/:path*', destination: `${API_BACKEND}/api/v1/accounts/:path*` },
      { source: '/api/v1/kyc/:path*', destination: `${API_BACKEND}/api/v1/kyc/:path*` },
      { source: '/api/v1/ai/:path*', destination: `${API_BACKEND}/api/v1/ai/:path*` },
      { source: '/api/v1/2fa/:path*', destination: `${API_BACKEND}/api/v1/2fa/:path*` },
      { source: '/api/market/orders', destination: `${API_BACKEND}/api/v1/market/orders` },
      { source: '/api/market/orders/:path*', destination: `${API_BACKEND}/api/v1/market/orders/:path*` },
      { source: '/api/market/orderbook/:path*', destination: `${API_BACKEND}/api/v1/market/orderbook/:path*` },
      { source: '/api/market/trades/:path*', destination: `${API_BACKEND}/api/v1/market/trades/:path*` },
      { source: '/api/market/chart', destination: `${API_BACKEND}/api/v1/market/chart` },
    ];
  },
  webpack: (config, { dev }) => {
    config.resolve.alias['@'] = path.join(__dirname, 'src');
    if (dev) {
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
      };
    }
    return config;
  },
  turbopack: {
    resolveAlias: {
      '@': path.join(__dirname, 'src'),
    },
  },
};

module.exports = nextConfig;
