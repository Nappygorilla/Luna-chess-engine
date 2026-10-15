/* Luna Engine — original browser chess engine.
 * Search: iterative-deepening negamax, alpha-beta/PVS, quiescence, move ordering,
 * a transposition table, repetition-aware draw handling, and positional evaluation.
 * Rules and legal move generation are provided by the separately licensed chess.js.
 */
'use strict';

importScripts('chess.js');

(function () {
  if (typeof Chess !== 'function') {
    self.postMessage('info string ERROR: chess.js did not load');
    return;
  }

  var MATE = 32000;
  var INF = 33000;
  var MATE_BOUND = 31000;
  var MAX_PLY = 64;
  var MAX_QPLY = 12;
  var MAX_NODES = 420000;
  var MAX_TIME_MS = 6500;
  var MAX_TT_ENTRIES = 180000;
  var VALUES = { p: 100, n: 320, b: 335, r: 500, q: 930, k: 0 };
  var PROMOTION_VALUE = { q: 930, r: 500, b: 335, n: 320 };
  var game = new Chess();
  var table = new Map();
  var repetition = new Map();
  var killers = [];
  var historyScores = Object.create(null);
  var multiPV = 3;
  var isSearching = false;
  var activeSearch = null;
  var lastFen = game.fen();

  function moveUci(move) {
    return move.from + move.to + (move.promotion || '');
  }

  function moveOptions(move) {
    var options = { from: move.from, to: move.to };
    if (move.promotion) options.promotion = move.promotion;
    return options;
  }

  function keyFromFen(fen) {
    var fields = fen.split(' ');
    var key = fields.slice(0, 4).join(' ');
    var halfmove = Number(fields[4] || 0);
    if (halfmove >= 90) key += ' ' + halfmove;
    return { key: key, repetitionKey: fields.slice(0, 4).join(' '), halfmove: halfmove };
  }

  function positionInfo() {
    return keyFromFen(game.fen());
  }

  function incrementRepetition(key) {
    repetition.set(key, (repetition.get(key) || 0) + 1);
  }

  function decrementRepetition(key) {
    var count = repetition.get(key) || 0;
    if (count <= 1) repetition.delete(key);
    else repetition.set(key, count - 1);
  }

  function resetSearchHistory() {
    repetition = new Map();
    incrementRepetition(positionInfo().repetitionKey);
  }

  function clearSearchCaches() {
    table.clear();
    killers = [];
    historyScores = Object.create(null);
  }

  function capTable() {
    if (table.size <= MAX_TT_ENTRIES) return;
    var removeCount = Math.floor(MAX_TT_ENTRIES / 3);
    var iterator = table.keys();
    while (removeCount-- > 0) {
      var next = iterator.next();
      if (next.done) break;
      table.delete(next.value);
    }
  }

  function scoreToTable(score, ply) {
    if (score > MATE_BOUND) return score + ply;
    if (score < -MATE_BOUND) return score - ply;
    return score;
  }

  function scoreFromTable(score, ply) {
    if (score > MATE_BOUND) return score - ply;
    if (score < -MATE_BOUND) return score + ply;
    return score;
  }

  function isDraw(info) {
    return (repetition.get(info.repetitionKey) || 0) >= 3 ||
      info.halfmove >= 100 ||
      game.insufficient_material();
  }

  function sideSign(color) {
    return color === 'w' ? 1 : -1;
  }

  function evaluateWhite() {
    var board = game.board();
    var pawnsByFile = { w: [0,0,0,0,0,0,0,0], b: [0,0,0,0,0,0,0,0] };
    var counts = {
      w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
      b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 }
    };
    var pieces = [];
    var phase = 0;
    var white = 0;

    for (var r = 0; r < 8; r++) {
      for (var c = 0; c < 8; c++) {
        var p = board[r][c];
        if (!p) continue;
        counts[p.color][p.type]++;
        pieces.push({ row: r, col: c, type: p.type, color: p.color });
        if (p.type === 'p') pawnsByFile[p.color][c]++;
        if (p.type === 'n' || p.type === 'b') phase += 1;
        else if (p.type === 'r') phase += 2;
        else if (p.type === 'q') phase += 4;
      }
    }
    phase = Math.min(24, phase);
    var middleWeight = phase / 24;
    var endWeight = 1 - middleWeight;

    for (var i = 0; i < pieces.length; i++) {
      var pc = pieces[i];
      var color = pc.color;
      var sign = sideSign(color);
      var row = pc.row;
      var file = pc.col;
      var type = pc.type;
      var advance = color === 'w' ? 7 - row : row;
      var centerDistance = Math.abs(file - 3.5) + Math.abs(row - 3.5);
      var positional = 0;

      if (type === 'p') {
        positional += advance * 5;
        positional += (3.5 - Math.abs(file - 3.5)) * 3;
        var adjacentPawn = (file > 0 ? pawnsByFile[color][file - 1] : 0) +
          (file < 7 ? pawnsByFile[color][file + 1] : 0);
        if (pawnsByFile[color][file] > 1) positional -= (pawnsByFile[color][file] - 1) * 13;
        if (adjacentPawn === 0) positional -= 11;

        var passed = true;
        for (var rr = 0; rr < 8 && passed; rr++) {
          var isAhead = color === 'w' ? rr < row : rr > row;
          if (!isAhead) continue;
          for (var ff = Math.max(0, file - 1); ff <= Math.min(7, file + 1); ff++) {
            var blocker = board[rr][ff];
            if (blocker && blocker.type === 'p' && blocker.color !== color) {
              passed = false;
              break;
            }
          }
        }
        if (passed) {
          var passedBonus = [0, 0, 8, 16, 28, 46, 78, 0];
          positional += passedBonus[Math.max(0, Math.min(7, advance))];
          var supportRow = color === 'w' ? row + 1 : row - 1;
          if (supportRow >= 0 && supportRow < 8) {
            for (var supportFile = Math.max(0, file - 1); supportFile <= Math.min(7, file + 1); supportFile++) {
              var supporter = board[supportRow][supportFile];
              if (supporter && supporter.type === 'p' && supporter.color === color) {
                positional += 8;
                break;
              }
            }
          }
        }
      } else if (type === 'n') {
        positional += 28 - centerDistance * 7;
        if (advance === 0) positional -= 5;
      } else if (type === 'b') {
        positional += 18 - centerDistance * 3;
        positional += advance * 1.5;
      } else if (type === 'r') {
        if (advance === 6) positional += 18;
        var ownPawns = pawnsByFile[color][file];
        var enemyColor = color === 'w' ? 'b' : 'w';
        var enemyPawns = pawnsByFile[enemyColor][file];
        if (ownPawns === 0 && enemyPawns === 0) positional += 13;
        else if (ownPawns === 0) positional += 6;
      } else if (type === 'q') {
        positional += (14 - centerDistance * 2) * middleWeight;
      } else if (type === 'k') {
        var centerPenalty = (centerDistance - 1) * 5;
        positional += centerPenalty * middleWeight;
        positional += (7 - centerDistance) * 7 * endWeight;
        var homeRow = color === 'w' ? 7 : 0;
        if (row === homeRow && (file === 2 || file === 6)) positional += 24 * middleWeight;
        else if (row === homeRow && (file === 3 || file === 4)) positional -= 12 * middleWeight;

        var shieldRow = color === 'w' ? row - 1 : row + 1;
        if (shieldRow >= 0 && shieldRow < 8) {
          for (var shieldFile = Math.max(0, file - 1); shieldFile <= Math.min(7, file + 1); shieldFile++) {
            var shieldPawn = board[shieldRow][shieldFile];
            if (shieldPawn && shieldPawn.type === 'p' && shieldPawn.color === color) {
              positional += 7 * middleWeight;
            } else if (pawnsByFile[color][shieldFile] === 0) {
              positional -= 3 * middleWeight;
            }
          }
        }
      }

      white += sign * (VALUES[type] + positional);
    }

    if (counts.w.b >= 2) white += 28;
    if (counts.b.b >= 2) white -= 28;

    // Keep a small, explicit tempo bonus so equal positions are not entirely inert.
    white += game.turn() === 'w' ? 8 : -8;
    return white;
  }

  function evaluate() {
    return evaluateWhite() * sideSign(game.turn());
  }

  function checkStop(state) {
    state.nodes++;
    if (state.nodes >= MAX_NODES) {
      state.aborted = true;
      return true;
    }
    if ((state.nodes & 1023) === 0 && Date.now() - state.startTime >= MAX_TIME_MS) {
      state.aborted = true;
      return true;
    }
    return false;
  }

  function historyKey(color, move) {
    return color + move.from + move.to + (move.promotion || '');
  }

  function moveOrderScore(move, ttMove, ply, preferredMove) {
    var uci = moveUci(move);
    if (preferredMove && uci === preferredMove) return 3000000;
    if (ttMove && uci === ttMove) return 2500000;
    if (move.promotion) return 900000 + (PROMOTION_VALUE[move.promotion] || 0);
    if (move.captured) {
      return 700000 + (VALUES[move.captured] || 0) * 10 - (VALUES[move.piece] || 0);
    }
    if (killers[ply]) {
      if (killers[ply][0] === uci) return 600000;
      if (killers[ply][1] === uci) return 590000;
    }
    return historyScores[historyKey(game.turn(), move)] || 0;
  }

  function orderMoves(moves, ttMove, ply, preferredMove) {
    var color = game.turn();
    moves.sort(function (a, b) {
      return moveOrderScore(b, ttMove, ply, preferredMove) -
        moveOrderScore(a, ttMove, ply, preferredMove);
    });
    // Preserve deterministic ordering when heuristic scores tie.
    return moves;
  }

  function rememberQuietCutoff(move, ply, depth, color) {
    if (move.captured || move.promotion) return;
    var uci = moveUci(move);
    if (!killers[ply]) killers[ply] = [];
    if (killers[ply][0] !== uci) {
      killers[ply][1] = killers[ply][0];
      killers[ply][0] = uci;
    }
    var key = historyKey(color, move);
    historyScores[key] = Math.min(200000, (historyScores[key] || 0) + depth * depth * 18);
  }

  function quiescence(alpha, beta, ply, qply, state, info) {
    if (checkStop(state)) return 0;
    state.seldepth = Math.max(state.seldepth, ply);
    if (ply >= MAX_PLY - 1 || qply >= MAX_QPLY) return evaluate();
    if (isDraw(info)) return 0;

    var inCheck = game.in_check();
    var standPat = -INF;
    if (!inCheck) {
      standPat = evaluate();
      if (standPat >= beta) return beta;
      if (standPat > alpha) alpha = standPat;
    }

    var moves = game.moves({ verbose: true });
    if (moves.length === 0) return inCheck ? -MATE + ply : 0;
    if (!inCheck) {
      moves = moves.filter(function (move) {
        return !!move.captured || !!move.promotion;
      });
      if (moves.length === 0) return alpha;
    }

    orderMoves(moves, null, ply, null);
    for (var i = 0; i < moves.length; i++) {
      var move = moves[i];
      game.move(moveOptions(move));
      var childInfo = positionInfo();
      incrementRepetition(childInfo.repetitionKey);
      var score = -quiescence(-beta, -alpha, ply + 1, qply + 1, state, childInfo);
      decrementRepetition(childInfo.repetitionKey);
      game.undo();
      if (state.aborted) return 0;
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  function negamax(depth, alpha, beta, ply, state, info) {
    if (checkStop(state)) return 0;
    state.seldepth = Math.max(state.seldepth, ply);
    if (ply >= MAX_PLY - 1) return evaluate();
    if (isDraw(info)) return 0;
    if (depth <= 0) return quiescence(alpha, beta, ply, 0, state, info);

    var alphaOriginal = alpha;
    var entry = table.get(info.key);
    var ttMove = entry ? entry.bestMove : null;
    if (entry && entry.depth >= depth) {
      var ttScore = scoreFromTable(entry.score, ply);
      if (entry.flag === 0) return ttScore;
      if (entry.flag === 1 && ttScore >= beta) return ttScore;
      if (entry.flag === 2 && ttScore <= alpha) return ttScore;
    }

    var inCheck = game.in_check();
    var moves = game.moves({ verbose: true });
    if (moves.length === 0) return inCheck ? -MATE + ply : 0;
    orderMoves(moves, ttMove, ply, null);

    var bestScore = -INF;
    var bestMove = null;
    var color = game.turn();
    for (var i = 0; i < moves.length; i++) {
      var move = moves[i];
      game.move(moveOptions(move));
      var childInfo = positionInfo();
      incrementRepetition(childInfo.repetitionKey);
      var score;
      if (i === 0) {
        score = -negamax(depth - 1, -beta, -alpha, ply + 1, state, childInfo);
      } else {
        var quietMove = !move.captured && !move.promotion && !inCheck;
        var reduced = depth >= 3 && i >= 4 && quietMove;
        score = -negamax(depth - (reduced ? 2 : 1), -alpha - 1, -alpha, ply + 1, state, childInfo);
        if (!state.aborted && reduced && score > alpha) {
          score = -negamax(depth - 1, -alpha - 1, -alpha, ply + 1, state, childInfo);
        }
        if (!state.aborted && score > alpha && score < beta) {
          score = -negamax(depth - 1, -beta, -alpha, ply + 1, state, childInfo);
        }
      }
      decrementRepetition(childInfo.repetitionKey);
      game.undo();
      if (state.aborted) return 0;

      if (score > bestScore) {
        bestScore = score;
        bestMove = moveUci(move);
      }
      if (score > alpha) alpha = score;
      if (alpha >= beta) {
        rememberQuietCutoff(move, ply, depth, color);
        break;
      }
    }

    var flag = 0;
    if (bestScore <= alphaOriginal) flag = 2;
    else if (bestScore >= beta) flag = 1;
    table.set(info.key, {
      depth: depth,
      score: scoreToTable(bestScore, ply),
      flag: flag,
      bestMove: bestMove
    });
    capTable();
    return bestScore;
  }

  function searchRoot(depth, excluded, hint, state) {
    var rootInfo = positionInfo();
    var allMoves = game.moves({ verbose: true });
    var moves = allMoves.filter(function (move) {
      return excluded.indexOf(moveUci(move)) === -1;
    });
    if (moves.length === 0) return null;

    var rootEntry = table.get(rootInfo.key);
    orderMoves(moves, rootEntry ? rootEntry.bestMove : null, 0, hint);
    var alpha = -INF;
    var beta = INF;
    var bestScore = -INF;
    var bestMove = null;

    for (var i = 0; i < moves.length; i++) {
      var move = moves[i];
      game.move(moveOptions(move));
      var childInfo = positionInfo();
      incrementRepetition(childInfo.repetitionKey);

      var score;
      if (i === 0) {
        score = -negamax(depth - 1, -beta, -alpha, 1, state, childInfo);
      } else {
        score = -negamax(depth - 1, -alpha - 1, -alpha, 1, state, childInfo);
        if (!state.aborted && score > alpha && score < beta) {
          score = -negamax(depth - 1, -beta, -alpha, 1, state, childInfo);
        }
      }

      decrementRepetition(childInfo.repetitionKey);
      game.undo();
      if (state.aborted) return { aborted: true };

      if (score > bestScore) {
        bestScore = score;
        bestMove = moveUci(move);
      }
      if (score > alpha) alpha = score;
    }

    if (excluded.length === 0 && bestMove) {
      table.set(rootInfo.key, {
        depth: depth,
        score: scoreToTable(bestScore, 0),
        flag: 0,
        bestMove: bestMove
      });
      capTable();
    }
    return { move: bestMove, score: bestScore, legalCount: allMoves.length };
  }

  function pvFromTable(rootFen, firstMove, depth) {
    var clone;
    try {
      clone = new Chess(rootFen);
    } catch (error) {
      return [firstMove];
    }
    var pv = [];
    var first = clone.moves({ verbose: true }).filter(function (move) {
      return moveUci(move) === firstMove;
    })[0];
    if (!first) return [firstMove];
    pv.push(moveUci(first));
    clone.move(moveOptions(first));

    for (var ply = 1; ply < depth; ply++) {
      var info = keyFromFen(clone.fen());
      var entry = table.get(info.key);
      if (!entry || !entry.bestMove) break;
      var candidate = clone.moves({ verbose: true }).filter(function (move) {
        return moveUci(move) === entry.bestMove;
      })[0];
      if (!candidate) break;
      pv.push(moveUci(candidate));
      clone.move(moveOptions(candidate));
      if (clone.game_over()) break;
    }
    return pv;
  }

  function scoreToUci(score) {
    if (score >= MATE_BOUND) {
      var winningMate = Math.max(1, Math.ceil((MATE - score) / 2));
      return 'mate ' + winningMate;
    }
    if (score <= -MATE_BOUND) {
      var losingMate = Math.max(1, Math.ceil((MATE + score) / 2));
      return 'mate -' + losingMate;
    }
    return 'cp ' + Math.round(score);
  }

  function emitInfo(depth, lines, state) {
    var elapsed = Math.max(0, Date.now() - state.startTime);
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var pv = pvFromTable(state.rootFen, line.move, depth);
      if (!pv.length) pv = [line.move];
      self.postMessage(
        'info depth ' + depth +
        ' seldepth ' + state.seldepth +
        ' nodes ' + state.nodes +
        ' time ' + elapsed +
        ' multipv ' + (i + 1) +
        ' score ' + scoreToUci(line.score) +
        ' pv ' + pv.join(' ')
      );
    }
  }

  function finishSearch(state, lines) {
    if (state.finished) return;
    state.finished = true;
    isSearching = false;
    if (activeSearch === state) activeSearch = null;
    var best = lines && lines.length ? lines[0].move : null;
    if (!best) {
      var legalMoves = game.moves({ verbose: true });
      best = legalMoves.length ? moveUci(legalMoves[0]) : '(none)';
    }
    self.postMessage('bestmove ' + best);
  }

  function startSearch(requestedDepth) {
    if (activeSearch) {
      activeSearch.stopRequested = true;
      return;
    }
    var state = {
      rootFen: game.fen(),
      targetDepth: Math.max(1, Math.min(10, Number(requestedDepth) || 5)),
      depth: 1,
      startTime: Date.now(),
      nodes: 0,
      seldepth: 0,
      aborted: false,
      stopRequested: false,
      finished: false
    };
    activeSearch = state;
    isSearching = true;
    resetSearchHistory();
    var lastCompletedLines = [];
    var previousHints = [];

    function iterate() {
      if (state.finished || activeSearch !== state) return;
      if (state.stopRequested) {
        finishSearch(state, lastCompletedLines);
        return;
      }
      if (state.depth > state.targetDepth) {
        finishSearch(state, lastCompletedLines);
        return;
      }
      state.aborted = false;
      var iterationLines = [];
      var excluded = [];
      var rootLegal = game.moves({ verbose: true });
      var wanted = Math.min(multiPV, rootLegal.length);

      for (var pvIndex = 0; pvIndex < wanted; pvIndex++) {
        if (state.aborted || state.stopRequested) break;
        var result = searchRoot(state.depth, excluded, previousHints[pvIndex] || null, state);
        if (!result || result.aborted || !result.move) break;
        iterationLines.push({ move: result.move, score: result.score });
        excluded.push(result.move);
      }

      if (state.aborted || state.stopRequested || iterationLines.length !== wanted) {
        finishSearch(state, lastCompletedLines);
        return;
      }

      lastCompletedLines = iterationLines;
      previousHints = iterationLines.map(function (line) { return line.move; });
      emitInfo(state.depth, iterationLines, state);
      state.depth++;
      setTimeout(iterate, 0);
    }
    setTimeout(iterate, 0);
  }

  function handleCommand(command) {
    if (typeof command !== 'string') return;
    var text = command.trim();
    if (text === 'uci') {
      self.postMessage('id name Luna Engine 0.1');
      self.postMessage('id author Luna Chess Lab');
      self.postMessage('option name MultiPV type spin default 3 min 1 max 3');
      self.postMessage('uciok');
      return;
    }
    if (text === 'isready') {
      self.postMessage('readyok');
      return;
    }
    if (text === 'ucinewgame') {
      clearSearchCaches();
      resetSearchHistory();
      return;
    }
    if (text.indexOf('setoption name MultiPV value ') === 0) {
      multiPV = Math.max(1, Math.min(3, Number(text.split(/\s+/).pop()) || 3));
      return;
    }
    if (text.indexOf('position fen ') === 0) {
      var fen = text.slice('position fen '.length).trim();
      try {
        game = new Chess(fen);
        lastFen = game.fen();
        resetSearchHistory();
      } catch (error) {
        self.postMessage('info string ERROR: invalid FEN position');
      }
      return;
    }
    if (text === 'position startpos') {
      game = new Chess();
      lastFen = game.fen();
      resetSearchHistory();
      return;
    }
    if (text.indexOf('go depth ') === 0) {
      var depth = Number(text.slice('go depth '.length).split(/\s+/)[0]);
      startSearch(depth);
      return;
    }
    if (text === 'stop') {
      if (activeSearch) activeSearch.stopRequested = true;
      else self.postMessage('bestmove (none)');
      return;
    }
    if (text === 'quit') {
      if (activeSearch) activeSearch.stopRequested = true;
    }
  }

  self.onmessage = function (event) {
    handleCommand(event.data);
  };

  resetSearchHistory();
  self.postMessage('info string Luna Engine 0.1 initialized');
})();