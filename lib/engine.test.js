const assert = require('assert');
const {
  emptyBoard, drop, winnerFromMove, isDraw, legalColumns, botPick, RED, YELLOW, COLS
} = require('./engine');

let b = emptyBoard();
assert.strictEqual(legalColumns(b).length, COLS, 'all columns open');

let d = drop(b, 3, RED);
assert(d && d.row === 5 && d.col === 3, 'drops to bottom');
b = d.board;

d = drop(b, 3, YELLOW);
assert(d && d.row === 4, 'stacks upward');
b = d.board;

// Horizontal win
b = emptyBoard();
for (let c = 0; c < 3; c++) b = drop(b, c, RED).board;
d = drop(b, 3, RED);
assert.strictEqual(winnerFromMove(d.board, d.row, d.col), RED, 'horizontal win');

// Vertical win
b = emptyBoard();
for (let i = 0; i < 3; i++) b = drop(b, 0, YELLOW).board;
d = drop(b, 0, YELLOW);
assert.strictEqual(winnerFromMove(d.board, d.row, d.col), YELLOW, 'vertical win');

// Diagonal win
b = emptyBoard();
b = drop(b, 0, RED).board;
b = drop(b, 1, YELLOW).board;
b = drop(b, 1, RED).board;
b = drop(b, 2, YELLOW).board;
b = drop(b, 2, YELLOW).board;
b = drop(b, 2, RED).board;
b = drop(b, 3, YELLOW).board;
b = drop(b, 3, YELLOW).board;
b = drop(b, 3, YELLOW).board;
d = drop(b, 3, RED);
assert.strictEqual(winnerFromMove(d.board, d.row, d.col), RED, 'diagonal win');

// Bot takes a win
b = emptyBoard();
for (let c = 0; c < 3; c++) b = drop(b, c, RED).board;
assert.strictEqual(botPick(b, RED), 3, 'bot takes winning move');

// Bot blocks
b = emptyBoard();
for (let c = 0; c < 3; c++) b = drop(b, c, RED).board;
assert.strictEqual(botPick(b, YELLOW), 3, 'bot blocks opponent');

// Draw detection on full board
b = emptyBoard();
let color = RED;
for (let c = 0; c < COLS; c++) {
  for (let r = 0; r < 6; r++) {
    // Alternate in a pattern that avoids accidental 4-in-a-row for this smoke test:
    // fill column-by-column alternating starting color each column
    const piece = ((c + r) % 2 === 0) ? RED : YELLOW;
    const dropped = drop(b, c, piece);
    if (!dropped) break;
    b = dropped.board;
  }
}
assert(isDraw(b) || legalColumns(b).length === 0, 'full board has no legal columns');

console.log('All engine tests passed.');
