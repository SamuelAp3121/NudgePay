/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Proxy: el panel llama a la API por el MISMO origen (/api/... del propio
  // dominio de Vercel) para que la cookie de sesión `ir_session` sea de
  // primera parte y ningún navegador la bloquee (Safari/Chrome 3rd-party
  // cookies). El backend real sigue siendo nudgepay-dz49.onrender.com.
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'https://nudgepay-dz49.onrender.com/api/:path*',
      },
    ];
  },
};

export default nextConfig;
