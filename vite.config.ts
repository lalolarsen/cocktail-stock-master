import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "favicon-ia.png", "icon-192.png", "icon-512.png"],
      manifest: {
        name: "Stockia",
        short_name: "Stockia",
        description: "Sistema operativo para discotecas, bares y clubes nocturnos",
        start_url: "/",
        display: "standalone",
        orientation: "landscape",
        background_color: "#000000",
        theme_color: "#000000",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // 3 MB
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
        skipWaiting: true,
        clientsClaim: true,
        navigateFallbackDenylist: [/^\/~oauth/, /^\/auth/, /\/auth\/v1\//],
        runtimeCaching: [
          {
            // Only cache Supabase data (REST). NEVER cache /auth/v1/*, /functions/v1/*,
            // or /realtime/v1/* — those must always hit the network so a stale SW
            // can't serve another worker's session token or a cached login response.
            urlPattern: ({ url }) =>
              /\.supabase\.co$/i.test(url.hostname) &&
              url.pathname.startsWith("/rest/v1/"),
            handler: "NetworkFirst",
            method: "GET",
            options: {
              cacheName: "supabase-rest",
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60, // 1 minute — POS operators rotate frequently
              },
            },
          },
        ],
      },

    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
}));
