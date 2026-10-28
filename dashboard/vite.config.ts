import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The indexer's GraphQL API (Hasura) is proxied so the browser stays same-origin.
export default defineConfig({
  // GitHub Pages serves the app from /<repo>/; set BASE_PATH there.
  base: process.env.BASE_PATH ?? "/",
  plugins: [react()],
  server: {
    proxy: {
      "/v1/graphql": process.env.GRAPHQL_PROXY_TARGET ?? "http://localhost:8080",
    },
  },
});
