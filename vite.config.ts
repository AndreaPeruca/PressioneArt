import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Security headers applied to both the dev preview server and `vite preview`.
// For production deployments (Netlify, Cloudflare Pages, nginx, etc.) these
// should also be set at the hosting layer — the meta tags in index.html serve
// as a fallback for static hosts that don't support custom headers.
const SECURITY_HEADERS = {
  // Note: unsafe-eval is required by @react-pdf/renderer (Emscripten WASM runtime)
  // Note: https://va.vercel-scripts.com required for Vercel Web Analytics
  'Content-Security-Policy': "default-src 'self'; script-src 'self' blob: 'wasm-unsafe-eval' 'unsafe-eval' https://va.vercel-scripts.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://va.vercel-scripts.com; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';",
  'X-Content-Type-Options':  'nosniff',
  'X-Frame-Options':         'DENY',
  'Referrer-Policy':         'no-referrer',
  'Permissions-Policy':      'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy':   'same-origin',
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
  ],
  build: {
    // reportPDF chunk (~1.5 MB) is lazy-loaded on demand — only when the user opens
    // the report modal. Raise the warning threshold accordingly.
    chunkSizeWarningLimit: 1600,
  },
  server: {
    headers: SECURITY_HEADERS,
  },
  preview: {
    headers: SECURITY_HEADERS,
  },
})
