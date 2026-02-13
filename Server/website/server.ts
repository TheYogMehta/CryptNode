import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { URL } from "node:url";

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 8081);
const WEBSITE_DIR = process.cwd();

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

function send(
  res: http.ServerResponse,
  status: number,
  body: string,
  contentType: string,
) {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-cache",
  });
  res.end(body);
}

function safeResolve(targetPath: string): string | null {
  const normalized = targetPath.replace(/^\/+/, "");
  const resolved = path.resolve(WEBSITE_DIR, normalized);
  if (!resolved.startsWith(WEBSITE_DIR)) return null;
  return resolved;
}

const server = http.createServer((req, res) => {
  const method = req.method || "GET";
  if (method !== "GET" && method !== "HEAD") {
    send(res, 405, "Method Not Allowed", "text/plain; charset=utf-8");
    return;
  }

  const parsed = new URL(
    req.url || "/",
    `http://${req.headers.host || "localhost"}`,
  );
  const pathname = parsed.pathname === "/" ? "/index.html" : parsed.pathname;
  const filePath = safeResolve(pathname);

  if (!filePath) {
    send(res, 403, "Forbidden", "text/plain; charset=utf-8");
    return;
  }

  fs.stat(filePath, (statErr, stat) => {
    if (statErr || !stat.isFile()) {
      // SPA-style fallback for unknown routes.
      const fallbackPath = path.join(WEBSITE_DIR, "index.html");
      fs.readFile(fallbackPath, "utf8", (fallbackErr, html) => {
        if (fallbackErr) {
          send(res, 500, "Internal Server Error", "text/plain; charset=utf-8");
          return;
        }
        if (method === "HEAD") {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end();
          return;
        }
        send(res, 200, html, "text/html; charset=utf-8");
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    if (method === "HEAD") {
      res.writeHead(200, { "Content-Type": contentType });
      res.end();
      return;
    }

    const stream = fs.createReadStream(filePath);
    res.writeHead(200, { "Content-Type": contentType });
    stream.pipe(res);
    stream.on("error", () => {
      send(res, 500, "Internal Server Error", "text/plain; charset=utf-8");
    });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`CryptNode landing page running at http://${HOST}:${PORT}`);
});
