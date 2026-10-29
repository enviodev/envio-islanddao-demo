import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // GitHub Pages serves the app from /<repo>/; set BASE_PATH there.
  base: process.env.BASE_PATH ?? "/",
  plugins: [react()],
});
