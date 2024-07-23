import { defineConfig } from "vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { resolve } from 'path'

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
  plugins: [
    // Put the Sentry vite plugin after all other plugins
    sentryVitePlugin({
      authToken: process.env.SENTRY_AUTH_TOKEN,
      org: "plastic-labs",
      project: "yousim-web",
    }),
  ],
});
