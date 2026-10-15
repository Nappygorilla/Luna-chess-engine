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
    const assetResponses = Object.create(null);
    const workerUrls = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    page.on("console", msg => {
      if (msg.type() === "error") console.error("[browser console]", msg.text());
    });
    page.on("requestfailed", request => {
      console.error("[request failed]", request.url(), request.failure()?.errorText);
    });
    page.on("response", response => {
      const url = response.url();
      const asset = url.match(/\/vendor\/(luna-engine\.js|chess\.js)(?:$|\?)/i);
      if (asset) assetResponses[asset[1].toLowerCase()] = response.status();
      if (response.status() >= 400 || /luna-engine|stockfish|chess\.js|vendor\//i.test(url)) console.log("[HTTP]", response.status(), url);
    });
    page.on("worker", worker => {
      workerUrls.push(worker.url());
      console.log("[worker]", worker.url());
    });

    await page.goto("http://127.0.0.1:4173/Luna-chess-engine/", { waitUntil: "domcontentloaded" });
    try {
      await page.waitForFunction(
        () => ["Ready", "Analyzing", "Thinking"].includes(document.querySelector("#engine-state")?.textContent),
        null,
        { timeout: 30000 }
      );
    } catch (error) {
      console.error("Engine state at timeout:", await page.locator("#engine-state").textContent());
      console.error("Analysis status at timeout:", await page.locator("#analysis-sub").textContent());
      throw error;
    }
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

    // Verify the visible recovery control can recreate the worker and restore analysis.
    await page.locator("#restart-engine").click();
    await page.waitForFunction(
      () => ["Ready", "Analyzing", "Thinking"].includes(document.querySelector("#engine-state")?.textContent),
      null,
      { timeout: 30000 }
    );
    await page.waitForFunction(
      () => !["—", "…", ""].includes(document.querySelector("#best-move")?.textContent.trim()),
      null,
      { timeout: 60000 }
    );

    // Exercise the search on a known mate-in-one position, not only the opening.
    const mateResult = await page.evaluate((fen) => new Promise((resolve, reject) => {
      const worker = new Worker(new URL("vendor/luna-engine.js", window.location.href));
      const timeout = window.setTimeout(() => {
        worker.terminate();
        reject(new Error("Luna did not finish the mate-in-one test in time"));
      }, 20000);
      const finish = (callback, value) => {
        window.clearTimeout(timeout);
        worker.terminate();
        callback(value);
      };
      worker.onerror = error => finish(reject, new Error(error.message || "Luna worker failed in mate test"));
      worker.onmessage = event => {
        const line = String(event.data || "");
        if (line === "uciok") {
          worker.postMessage("isready");
        } else if (line === "readyok") {
          worker.postMessage("position fen " + fen);
          worker.postMessage("go depth 2");
        } else if (line.indexOf("info string ERROR:") === 0) {
          finish(reject, new Error(line));
        } else if (line.indexOf("bestmove ") === 0) {
          const uci = line.trim().split(/\\s+/)[1];
          const game = new Chess(fen);
          let move = null;
          if (uci && uci !== "(none)" && uci !== "0000") {
            move = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || "q" });
          }
          finish(resolve, { uci, legal: !!move, checkmate: !!move && game.in_checkmate() });
        }
      };
      worker.postMessage("uci");
    }), "7k/5Q2/6K1/8/8/8/8/8 w - - 0 1");
    assert.ok(mateResult.legal, "Luna's tactical recommendation should be a legal move");
    assert.ok(mateResult.checkmate, "Luna should find a forced mate in one");

    // A functioning search plus the worker event below proves the worker script loaded.
    assert.equal(assetResponses["chess.js"], 200, "the chess rules library should load inside the worker");
    assert.ok(workerUrls.some(url => url.includes("/vendor/luna-engine.js")), "the page should launch Luna's own engine worker");
    assert.ok(!workerUrls.some(url => /stockfish/i.test(url)), "the page must not launch Stockfish");
    assert.ok(Number(await page.locator("#depth-stat").textContent()) >= 1, "Luna should report a completed search depth");
    const recommendation = (await page.locator("#best-move").textContent()).trim();
    assert.ok(recommendation && !["—", "…", ""].includes(recommendation), "Luna should return a recommendation");
    assert.deepEqual(pageErrors, [], "browser should have no uncaught JavaScript errors after manual worker restart");
    console.log("Luna Chess Lab browser smoke test passed: Luna engine worker, local assets, legal board move, recommendation, and restart recovery.");
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
