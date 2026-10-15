# Third-party notices

Luna Chess Lab is an independent project and is not affiliated with, endorsed by, or sponsored by Stockfish or Chess.com.

## Stockfish.js / Stockfish 19

The deployment workflow downloads stockfish@19.0.1 from npm and publishes the unmodified single-threaded lite WebAssembly browser engine with the site. The engine is maintained by Nathan Rugg and contributors and is licensed under GNU General Public License version 3 (GPL-3.0). The matching Copying.txt licence is published alongside the engine in vendor/stockfish/.

- Source and engine documentation: https://github.com/nmrugg/stockfish.js/
- npm package version: https://www.npmjs.com/package/stockfish/v/19.0.1
- Stockfish.js source and licence: https://github.com/nmrugg/stockfish.js/
- Official Stockfish source: https://github.com/official-stockfish/Stockfish

The engine binary is not modified by this project. If you redistribute a Stockfish build or create a derivative distribution, comply with all GPLv3 requirements, including making the corresponding source and licence available. See the full licence shipped with the deployed engine for the exact terms.

## chess.js

The page uses chess.js 0.10.3 from cdnjs to validate legal moves and handle chess notation. It is distributed under the BSD-2-Clause licence.

- Source: https://github.com/jhlywa/chess.js/
- CDN: https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js

## Fonts

DM Mono and Manrope are requested from Google Fonts, with system fallbacks.
