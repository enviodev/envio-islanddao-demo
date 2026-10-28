import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The indexer's GraphQL API (Hasura) is proxied so the browser stays same-origin.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/v1/graphql": process.env.GRAPHQL_PROXY_TARGET ?? "http://localhost:8080",
    },
  },
});
