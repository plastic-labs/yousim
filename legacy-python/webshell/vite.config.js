import { defineConfig } from "vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { resolve } from 'path'

const SENTRY_DSN = import.meta.env?.VITE_SENTRY_DSN
let plugins = []
if (SENTRY_DSN) {
  plugins = [
    sentryVitePlugin({
      authToken: SENTRY_DSN,
      org: "plastic-labs",
      project: "yousim-web",
    }),
  ]
}

export default defineConfig({
  build: {
    sourcemap: true, // Source map generation must be turned on
    rollupOptions: {
      input: {
        main: resolve(__dirname, "./index.html"),
        share: resolve(__dirname, "./share.html"),
      }
    }
  },
  server: {
    host: '0.0.0.0',
  },
  plugins: plugins,
});
