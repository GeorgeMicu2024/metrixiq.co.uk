/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: { root: process.cwd() },
  allowedDevOrigins: ["localhost", "127.0.0.1", "192.168.68.111"],
};
export default nextConfig;
