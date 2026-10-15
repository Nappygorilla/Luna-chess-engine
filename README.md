# Luna Chess Lab

**Luna Chess Lab** is an original browser-first chess analysis workspace. Move pieces on an interactive board, explore legal positions, and view engine recommendations and candidate lines powered by Stockfish.

## Website features

- Responsive board with click-to-move and drag-and-drop interactions
- Legal moves, captures, checks, checkmate, draws, and automatic queen promotion
- Stockfish 19 analysis in the browser using a single-threaded lite WebAssembly build
- Best move arrow, evaluation score, principal variations, search depth, node count, and elapsed time
- Adjustable search depth and candidate lines, undo, board flip, palette choices, FEN copy, and PGN export
- Optional mode to play White against the engine as Black
- No account, database, or server-side position storage

## Publish on GitHub Pages

1. Open **Settings → Pages** in this repository.
2. Under **Build and deployment**, select **GitHub Actions** as the source.
3. Visit **Actions** and open **Build and deploy Luna Chess Lab**. The workflow runs on each push to main and can also be started manually.
4. When the deployment succeeds, GitHub Actions will show the public Pages URL.

The build workflow downloads the pinned stockfish@19.0.1 npm package, adds its single-threaded lite WebAssembly engine and corresponding licence to the Pages artifact, and deploys the static website. The chess rules library is bundled locally with its licence. Google Fonts remain an optional external enhancement with system-font fallbacks. Visitors need an internet connection on first load for the published site and engine assets to be downloaded.

## Run locally

A local web server is recommended because the engine runs as a Web Worker. From this folder, run the following command:

    python -m http.server 8000

Then open http://localhost:8000. The local server also needs the Stockfish browser files at vendor/stockfish/; the GitHub Pages workflow prepares these assets automatically for the hosted site.

## Project structure

- index.html — website layout, original theme, interactive chessboard, and engine interface
- .github/workflows/deploy.yml — builds the deployable site and publishes it to GitHub Pages
- THIRD-PARTY-NOTICES.md — third-party attribution and licensing information

## Licensing

The original website design and glue code are available under the MIT License. Stockfish and chess.js retain their own licences. See THIRD-PARTY-NOTICES.md and the engine licence shipped in the deployed site.
