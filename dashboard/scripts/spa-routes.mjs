// GitHub Pages serves static files only. Give the fixed routes their own
// index.html (served with 200), and fall back to 404.html, which is also the
// app, for dynamic paths like /islander/<wallet> and /v4/analytics.
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const dist = new URL("../dist/", import.meta.url).pathname;
const index = join(dist, "index.html");

for (const route of ["analytics", "islanders", "organizers", "me"]) {
  mkdirSync(join(dist, route), { recursive: true });
  copyFileSync(index, join(dist, route, "index.html"));
}
copyFileSync(index, join(dist, "404.html"));
