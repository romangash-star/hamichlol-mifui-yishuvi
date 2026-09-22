// Zero-dependency static file server, used only for local preview.
// The real deployment is GitHub Pages (see .github/workflows/deploy-pages.yml) -
// this script is not part of that; it just lets you open the site over http://
// during development (fetch() of the local JSON files needs a real server, not file://).
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "public");
const PORT = process.env.PORT || 3300;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

http
  .createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split("?")[0]);
    let filePath = path.join(ROOT, urlPath === "/" ? "index.html" : urlPath);

    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403);
      return res.end("Forbidden");
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end("Not found");
      }
      const ext = path.extname(filePath);
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      res.end(data);
    });
  })
  .listen(PORT, () => {
    console.log(`תצוגה מקדימה מקומית: http://localhost:${PORT}`);
  });
