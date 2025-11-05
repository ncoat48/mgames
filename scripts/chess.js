document.addEventListener('DOMContentLoaded', () => {
    // DOM refs
    const boardEl = document.getElementById('board');
    const statusEl = document.getElementById('status');
    const movesEl = document.getElementById('moves');
    const fenEl = document.getElementById('fen');
    const pgnEl = document.getElementById('pgn');
    const newBtn = document.getElementById('newBtn');
    const undoBtn = document.getElementById('undoBtn');
    const flipBtn = document.getElementById('flipBtn');
    const vsComputer = document.getElementById('vsComputer');
    const aiMode = document.getElementById('aiMode');
    const fullscreenBtn = document.getElementById('chessFullscreen');

    // Game state
    let game = new Chess();
    let selectedSquare = null;
    let boardFlipped = false;
    let moveHistory = [];

    // Pieces unicode mapping
    const unicodePieces = {
        p: '♟', r: '♜', n: '♞', b: '♝', q: '♛', k: '♚',
        P: '♙', R: '♖', N: '♘', B: '♗', Q: '♕', K: '♔'
    };

    // Render board squares and pieces
    function renderBoard() {
        boardEl.innerHTML = '';
        const board = game.board();
        // ranks 8 -> 1 top to bottom
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                // compute coordinates depending on flip
                const fileIndex = boardFlipped ? 7 - c : c;
                const rankIndex = boardFlipped ? r : r;
                const fileChar = 'abcdefgh'[fileIndex];
                const rankChar = String(8 - r);
                const squareName = `${fileChar}${rankChar}`;

                // piece is from logical board; adjust read for flip so pieces display correctly
                const piece = board[r][c];

                const sq = document.createElement('div');
                sq.className = `square ${((r + c) % 2 === 0) ? 'light' : 'dark'}`;
                sq.dataset.square = squareName;
                sq.setAttribute('role', 'button');
                sq.setAttribute('aria-label', `square ${squareName}`);
                // piece
                if (piece) {
                    const p = document.createElement('div');
                    p.className = 'piece ' + (piece.color === 'w' ? 'white' : 'black');
                    const key = piece.color === 'w' ? piece.type.toUpperCase() : piece.type;
                    p.textContent = unicodePieces[key] || '';
                    sq.appendChild(p);
                }

                // click handler
                sq.addEventListener('click', () => onSquareClick(squareName));
                boardEl.appendChild(sq);
            }
        }

        // highlight selected and valid moves
        if (selectedSquare) {
            const legal = game.moves({ square: selectedSquare, verbose: true }).map(m => m.to);
            Array.from(boardEl.children).forEach(el => {
                if (el.dataset.square === selectedSquare) el.classList.add('selected');
                if (legal.includes(el.dataset.square)) el.classList.add('highlight');
            });
        }
    }

    function onSquareClick(square) {
        // if a square was already selected, attempt move
        if (selectedSquare) {
            const move = game.move({ from: selectedSquare, to: square, promotion: 'q' });
            if (move) {
                moveHistory.push(move);
                selectedSquare = null;
                updateUI();
                if (vsComputer.checked && !game.game_over()) {
                    setTimeout(makeComputerMove, 250);
                }
                return;
            } else {
                // if clicked own piece, select it; otherwise clear
                const piece = game.get(square);
                if (piece && piece.color === game.turn()) {
                    selectedSquare = square;
                } else {
                    selectedSquare = null;
                }
                renderBoard();
                return;
            }
        }

        // select if piece belongs to current player
        const piece = game.get(square);
        if (piece && piece.color === game.turn()) {
            selectedSquare = square;
            renderBoard();
        } else {
            selectedSquare = null;
            renderBoard();
        }
    }

    function updateUI() {
        renderBoard();
        statusEl.textContent = getStatus();
        fenEl.textContent = game.fen();
        pgnEl.textContent = game.pgn();

        // update moves list
        const history = game.history({ verbose: true });
        movesEl.innerHTML = '';
        if (history.length) {
            const ol = document.createElement('ol');
            ol.style.paddingLeft = '18px';
            for (let i = 0; i < history.length; i += 2) {
                const li = document.createElement('li');
                const white = history[i];
                const black = history[i + 1];
                li.textContent = `${white ? white.san : ''}${black ? ' — ' + black.san : ''}`;
                ol.appendChild(li);
            }
            movesEl.appendChild(ol);
        }
    }

    function getStatus() {
        if (game.in_checkmate()) return 'Checkmate — ' + (game.turn() === 'w' ? 'Black' : 'White') + ' wins';
        if (game.in_stalemate()) return 'Stalemate — draw';
        if (game.in_threefold_repetition()) return 'Draw — threefold repetition';
        if (game.insufficient_material()) return 'Draw — insufficient material';
        if (game.in_check()) return (game.turn() === 'w' ? 'White' : 'Black') + ' to move — in check';
        return (game.turn() === 'w' ? 'White' : 'Black') + ' to move';
    }

    // ---- AI ----
    function makeComputerMove() {
        if (game.game_over()) return;
        const mode = aiMode.value;
        const possible = game.moves();
        if (!possible.length) return;

        if (mode === 'random') {
            const m = possible[Math.floor(Math.random() * possible.length)];
            game.move(m);
            updateUI();
            return;
        }

        const depth = mode === 'minimax2' ? 2 : 3;
        const best = minimaxRoot(depth, true);
        if (best) {
            game.move(best);
            updateUI();
        }
    }

    function minimaxRoot(depth, isMax) {
        const moves = game.moves();
        let bestMove = null;
        let bestValue = -Infinity;
        for (let i = 0; i < moves.length; i++) {
            const move = moves[i];
            game.move(move);
            const value = minimax(depth - 1, -Infinity, Infinity, !isMax);
            game.undo();
            if (value > bestValue) {
                bestValue = value;
                bestMove = move;
            }
        }
        return bestMove;
    }

    function minimax(depth, alpha, beta, isMax) {
        if (depth === 0) return evaluateBoard();
        const moves = game.moves();
        if (isMax) {
            let maxEval = -Infinity;
            for (let i = 0; i < moves.length; i++) {
                game.move(moves[i]);
                const evalScore = minimax(depth - 1, alpha, beta, false);
                game.undo();
                maxEval = Math.max(maxEval, evalScore);
                alpha = Math.max(alpha, evalScore);
                if (beta <= alpha) break;
            }
            return maxEval;
        } else {
            let minEval = Infinity;
            for (let i = 0; i < moves.length; i++) {
                game.move(moves[i]);
                const evalScore = minimax(depth - 1, alpha, beta, true);
                game.undo();
                minEval = Math.min(minEval, evalScore);
                beta = Math.min(beta, evalScore);
                if (beta <= alpha) break;
            }
            return minEval;
        }
    }

    function evaluateBoard() {
        const values = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
        let total = 0;
        const b = game.board();
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = b[r][c];
                if (!piece) continue;
                const val = values[piece.type] || 0;
                total += piece.color === 'w' ? val : -val;
            }
        }
        return total;
    }

    // ---- Events ----
    newBtn.onclick = () => {
        game = new Chess();
        selectedSquare = null;
        moveHistory = [];
        updateUI();
    };

    undoBtn.onclick = () => {
        if (game.history().length > 0) game.undo();
        selectedSquare = null;
        updateUI();
    };

    flipBtn.onclick = () => {
        boardFlipped = !boardFlipped;
        // flipping is visual only: we simply re-render with a reversed mapping
        // Instead of transforming DOM, we control mapping inside renderBoard by reading board normally.
        renderBoard();
    };

    fullscreenBtn.addEventListener('click', toggleFullscreen);
    document.addEventListener('fullscreenchange', () => {
        // re-render to let ResizeObserver pick up size
        renderBoard();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'u' || e.key === 'U') undoBtn.click();
        if (e.key === 'n' || e.key === 'N') newBtn.click();
        if (e.key === 'f' || e.key === 'F') toggleFullscreen();
        if (e.key === 'Escape' && document.fullscreenElement) document.exitFullscreen();
    });

    function toggleFullscreen() {
        const container = document.querySelector('.chess-container');
        if (!document.fullscreenElement) {
            container.requestFullscreen?.();
        } else {
            document.exitFullscreen?.();
        }
    }

    // ---- Responsive sizing ----
    // We'll use ResizeObserver to update CSS custom property --square-size (used by CSS for font sizing)
    // This avoids race conditions where window.innerHeight isn't settled on mobile.
    function updateSquareSize(widthPx) {
        // set CSS variable on board element so CSS can use it
        const squareSize = widthPx / 8;
        boardEl.style.setProperty('--square-size', `${squareSize}px`);
        // also update any inline piece font-sizes just in case
        const squares = boardEl.querySelectorAll('.square');
        const pieceSize = squareSize * 0.62;
        squares.forEach(sq => {
            const piece = sq.querySelector('.piece');
            if (piece) piece.style.fontSize = `${pieceSize}px`;
        });
    }

    // Use ResizeObserver if available
    if (window.ResizeObserver) {
        const ro = new ResizeObserver(entries => {
            for (let ent of entries) {
                const w = ent.contentRect.width;
                updateSquareSize(w);
            }
        });
        ro.observe(boardEl);
    } else {
        // fallback to debounced resize
        let rtid = null;
        window.addEventListener('resize', () => {
            clearTimeout(rtid);
            rtid = setTimeout(() => {
                updateSquareSize(boardEl.clientWidth);
            }, 120);
        });
    }

    // Prevent layout race by scheduling a few early updates after load
    window.addEventListener('load', () => {
        setTimeout(() => updateSquareSize(boardEl.clientWidth), 60);
        setTimeout(() => updateSquareSize(boardEl.clientWidth), 300);
        setTimeout(() => updateSquareSize(boardEl.clientWidth), 800);
    });

    // Initial render & UI update
    renderBoard();
    updateUI();

    // Expose a small helper so AI can be toggled quickly
    vsComputer.addEventListener('change', () => {
        // if enabling and it's AI's turn, immediate move
        if (vsComputer.checked && game.turn() === 'b') {
            setTimeout(makeComputerMove, 200);
        }
    });

    // If user changes AI mode while it's AI's turn, trigger move
    aiMode.addEventListener('change', () => {
        if (vsComputer.checked && game.turn() === 'b') setTimeout(makeComputerMove, 200);
    });

});
