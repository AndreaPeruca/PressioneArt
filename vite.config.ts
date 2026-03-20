import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Security headers applied to both the dev preview server and `vite preview`.
// For production deployments (Netlify, Cloudflare Pages, nginx, etc.) these
// should also be set at the hosting layer — the meta tags in index.html serve
// as a fallback for static hosts that don't support custom headers.
const SECURITY_HEADERS = {
  'X-Content-Type-Options':  'nosniff',
  'X-Frame-Options':         'DENY',
  'Referrer-Policy':         'no-referrer',
  'Permissions-Policy':      'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy':   'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
  ],
  server: {
    headers: SECURITY_HEADERS,
  },
  preview: {
    headers: SECURITY_HEADERS,
  },
})
