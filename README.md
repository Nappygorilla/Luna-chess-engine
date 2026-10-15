# Luna Chess Lab

**Luna Chess Lab** is an original browser-first chess analysis workspace. The site's recommendations now come from **Luna Engine**, an engine authored for this project rather than a Stockfish wrapper.

## Website features

- Responsive board with click-to-move and drag-and-drop interactions
- Legal moves, captures, checks, checkmate, draws, and automatic queen promotion
- Luna Engine's own positional evaluation and move search
- Iterative-deepening negamax with alpha-beta/PVS search, quiescence search, move ordering, repetition-aware draw handling, and a transposition table
- Best-move arrow, evaluation score, candidate principal variations, search depth, node count, and elapsed time
- Adjustable search depth, undo, board flip, palette choices, FEN copy, and PGN export
- Optional mode to play White against Luna Engine as Black
- Automatic worker restart attempts, a manual Restart control, and search/startup watchdogs
- No account, database, or server-side position storage

## Engine strength: early baseline

Luna Engine v0.1 is the first original baseline, not a proven Stockfish-beater. Its search/evaluation code is in `engine/luna-engine-worker.js`; its legal move generation and chess notation come from the separately licensed `chess.js` library. Search effort is bounded for browser responsiveness, so the configured depth is a target, not a guarantee that every browser completes that depth. We must benchmark engine versions by playing many paired games against reference engines with colors reversed before claiming strength gains.

## Publish on GitHub Pages

1. Open **Settings → Pages** in this repository.
2. Under **Build and deployment**, select **GitHub Actions** as the source.
3. Visit **Actions** and open **Build and deploy Luna Chess Lab**. The workflow runs on each push to main and can also be started manually.
4. When the deployment succeeds, GitHub Actions will show the public Pages URL.

The workflow copies the original Luna Engine worker into the site's vendor directory and packages the pinned `chess.js@0.10.3` library and licence. It does not download or launch Stockfish. Google Fonts are an optional external enhancement with system-font fallbacks. Visitors need an internet connection on first load to retrieve the website, although chess analysis itself runs on the visitor's device.

## Run locally

A local web server is recommended because the engine runs as a Web Worker. From this folder, run:

    python -m http.server 8000

Then open http://localhost:8000. The deployment workflow prepares `vendor/luna-engine.js` and `vendor/chess.js` in the published artifact.

## Project structure

- `index.html` — website layout, original theme, interactive chessboard, and engine interface
- `engine/luna-engine-worker.js` — original Luna search, evaluation, move ordering, and transposition-table implementation
- `.github/workflows/deploy.yml` — builds, smoke-tests, and publishes the static site
- `scripts/smoke-test.cjs` — Chromium smoke test for assets, moves, recommendations, and worker recovery
- `THIRD-PARTY-NOTICES.md` — third-party attribution and licensing information

## Licensing

The original website and Luna Engine code are available under the MIT License. `chess.js` retains its upstream licence; see `THIRD-PARTY-NOTICES.md`.
