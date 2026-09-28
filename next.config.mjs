/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
];

const noIndexHeaders = [
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
];

const nextConfig = {
  turbopack: { root: process.cwd() },
  poweredByHeader: false,
  allowedDevOrigins: ["localhost", "127.0.0.1", "192.168.68.111"],

  async redirects() {
    return [
      { source: "/guides", destination: "/resources", permanent: true },
      { source: "/blog", destination: "/resources", permanent: true },
      { source: "/driver-scorecards", destination: "/driver-performance-scorecards", permanent: true },
      { source: "/fleet-management-software", destination: "/fleet-performance-management", permanent: true },
      { source: "/fleet-compliance-software", destination: "/fleet-compliance-monitoring", permanent: true },
      { source: "/driver-coaching", destination: "/driver-coaching-software", permanent: true },
      { source: "/fleet-analytics", destination: "/fleet-data-analytics", permanent: true },
    ];
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/app/:path*",
        headers: noIndexHeaders,
      },
      {
        source: "/auth/:path*",
        headers: noIndexHeaders,
      },
      {
        source: "/login",
        headers: noIndexHeaders,
      },
      {
        source: "/api/:path*",
        headers: noIndexHeaders,
      },
    ];
  },
};

export default nextConfig;
