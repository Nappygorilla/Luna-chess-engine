const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..", "_site");
const prefix = "/Luna-chess-engine";
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".wasm": "application/wasm",
  ".css": "text/css; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, "http://127.0.0.1");
  let pathname = decodeURIComponent(requestUrl.pathname);

  // Emulate the repository subpath used by GitHub Pages project sites.
  if (pathname === prefix || pathname === prefix + "/") {
    pathname = "/index.html";
  } else if (pathname.startsWith(prefix + "/")) {
    pathname = pathname.slice(prefix.length);
  }

  const filename = path.resolve(root, "." + pathname);
  if (!filename.startsWith(root + path.sep) && filename !== path.join(root, "index.html")) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  fs.readFile(filename, (error, bytes) => {
    if (error) {
      res.writeHead(404).end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filename)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(bytes);
  });
});

(async () => {
  let browser;
  await new Promise((resolve) => server.listen(4173, "127.0.0.1", resolve));
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    page.on("console", msg => {
      if (msg.type() === "error") console.error("[browser console]", msg.text());
    });
    page.on("requestfailed", request => {
      console.error("[request failed]", request.url(), request.failure()?.errorText);
    });

    await page.goto("http://127.0.0.1:4173/Luna-chess-engine/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => document.querySelector("#engine-state")?.textContent === "Ready",
      null,
      { timeout: 60000 }
    );
    await page.waitForFunction(
      () => !["—", "…", ""].includes(document.querySelector("#best-move")?.textContent.trim()),
      null,
      { timeout: 60000 }
    );

    assert.equal(await page.locator("#board .square").count(), 64, "board should render all 64 squares");
    await page.locator('[data-square="e2"]').click();
    await page.locator('[data-square="e4"]').click();
    await page.waitForFunction(() => document.querySelector("#move-count")?.textContent.trim() === "1 plies");
    await page.waitForFunction(
      () => !["—", "…", ""].includes(document.querySelector("#best-move")?.textContent.trim()),
      null,
      { timeout: 60000 }
    );
    assert.deepEqual(pageErrors, [], "browser should have no uncaught JavaScript errors");
    console.log("Luna Chess Lab browser smoke test passed: Stockfish ready, recommendation shown, legal e2-e4 move accepted.");
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
