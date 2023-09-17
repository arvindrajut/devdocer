/** @type {import('next').NextConfig} */
const nextConfig = {
    // Can be safely removed in newer versions of Next.js
    future: {
      webpack5: true, // Enable Webpack 5
    },
    webpack(config) {
      config.resolve.fallback = {
        ...config.resolve.fallback, // Keep existing fallback options
        fs: false, // Set fs to false
        os: false, // Set os to false
      };
      return config;
    },
  };
  
  module.exports = nextConfig;
  