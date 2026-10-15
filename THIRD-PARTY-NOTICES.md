# Third-party notices

Luna Chess Lab is an independent project and is not affiliated with, endorsed by, or sponsored by Stockfish or Chess.com.

## Stockfish.js / Stockfish 19

The deployment workflow downloads stockfish@19.0.1 from npm and publishes the unmodified single-threaded lite WebAssembly browser engine as the default, plus the unmodified full single-threaded WebAssembly engine as an optional ~94 MB build. The engine is maintained by Nathan Rugg and contributors and is licensed under GNU General Public License version 3 (GPL-3.0). The matching Copying.txt licence is published alongside the engine in vendor/stockfish/.

- Source and engine documentation: https://github.com/nmrugg/stockfish.js/
- npm package version: https://www.npmjs.com/package/stockfish/v/19.0.1
- Stockfish.js source and licence: https://github.com/nmrugg/stockfish.js/
- Official Stockfish source: https://github.com/official-stockfish/Stockfish

The engine binary is not modified by this project. If you redistribute a Stockfish build or create a derivative distribution, comply with all GPLv3 requirements, including making the corresponding source and licence available. See the full licence shipped with the deployed engine for the exact terms.

## chess.js

The site bundles chess.js 0.10.3 from its npm package to validate legal moves and handle chess notation. The build publishes the upstream file and BSD-2-Clause licence unchanged.

- Source: https://github.com/jhlywa/chess.js/
- Packaged distribution: https://www.npmjs.com/package/chess.js/v/0.10.3
- Shipped copy: vendor/chess.js (with vendor/CHESSJS-LICENSE.txt)

## Fonts

DM Mono and Manrope are requested from Google Fonts, with system fallbacks.
