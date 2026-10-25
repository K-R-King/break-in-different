// Small static file server for the no-Docker demo (scripts/demo.sh). No dependencies.
//   node scripts/serve-static.mjs --root dist --port 8080 --spa --headers docker/nginx.conf
//   node scripts/serve-static.mjs --root <dashboard> --port 6791 --deployment <deployment.json>
// --spa       unknown paths return index.html (React Router); otherwise path.html, then 404.html.
// --headers   copies the `add_header … always;` lines from the nginx config, so both demos send
//             the same security headers.
// --deployment answers /api/current_deployment with that file (the Convex dashboard reads its
//             backend URL and admin key there). Loopback hosts only, like `npx convex dashboard`.
import { createReadStream, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { URL } from "node:url";

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const root = resolve(opt("--root") ?? ".");
const port = Number(opt("--port") ?? 8080);
const spa = args.includes("--spa");
const deploymentFile = opt("--deployment");
const headersFile = opt("--headers");
const headers = headersFile
  ? [...readFileSync(headersFile, "utf8").matchAll(/^\s*add_header\s+(\S+)\s+"([^"]*)"\s+always;/gm)].map((m) => [m[1], m[2]])
  : [];

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
  ".pdf": "application/pdf",
};

const isFile = (p) => {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
};

// The file for a URL path, or null. Never leaves root.
function lookup(pathname) {
  const base = resolve(join(root, decodeURIComponent(pathname)));
  if (base !== root && !base.startsWith(root + sep)) return null;
  for (const p of [base, base + ".html", join(base, "index.html")]) if (isFile(p)) return p;
  return null;
}

const isLoopback = (host) => host === `127.0.0.1:${port}` || host === `localhost:${port}`;

createServer((req, res) => {
  for (const [k, v] of headers) res.setHeader(k, v);
  let pathname;
  try {
    pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  } catch {
    res.statusCode = 400;
    return res.end();
  }
  if (deploymentFile) {
    if (!isLoopback(req.headers.host)) {
      res.statusCode = 403;
      return res.end();
    }
    if (pathname === "/api/current_deployment") {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      return res.end(readFileSync(deploymentFile));
    }
  }
  let file = lookup(pathname);
  let status = 200;
  if (!file) {
    file = spa ? join(root, "index.html") : lookup("/404");
    status = spa ? 200 : 404;
  }
  if (!file) {
    res.statusCode = 404;
    return res.end("Not found");
  }
  res.statusCode = status;
  res.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream");
  if (pathname.startsWith("/assets/") || pathname.startsWith("/_next/static/")) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  if (req.method === "HEAD") return res.end();
  createReadStream(file).pipe(res);
}).listen(port, "127.0.0.1", () => console.log(`Serving ${root} at http://127.0.0.1:${port}`));
