/**
 * Connect Four engine.
 * Board: 6 rows × 7 columns. cells[row][col] = 0 empty, 1 red, 2 yellow.
 * Row 0 is the top; pieces fall to the lowest empty row in a column.
 */

const ROWS = 6;
const COLS = 7;
const RED = 1;
const YELLOW = 2;

function emptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function cloneBoard(board) {
  return board.map(row => row.slice());
}

function other(color) {
  return color === RED ? YELLOW : RED;
}

function legalColumns(board) {
  const cols = [];
  for (let c = 0; c < COLS; c++) {
    if (board[0][c] === 0) cols.push(c);
  }
  return cols;
}

function drop(board, col, color) {
  if (col < 0 || col >= COLS || board[0][col] !== 0) return null;
  const next = cloneBoard(board);
  for (let r = ROWS - 1; r >= 0; r--) {
    if (next[r][col] === 0) {
      next[r][col] = color;
      return { board: next, row: r, col };
    }
  }
  return null;
}

function countDir(board, row, col, color, dr, dc) {
  let n = 0;
  let r = row + dr;
  let c = col + dc;
  while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === color) {
    n++;
    r += dr;
    c += dc;
  }
  return n;
}

function winnerFromMove(board, row, col) {
  const color = board[row][col];
  if (!color) return 0;
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (const [dr, dc] of dirs) {
    const total = 1 + countDir(board, row, col, color, dr, dc) + countDir(board, row, col, color, -dr, -dc);
    if (total >= 4) return color;
  }
  return 0;
}

function isDraw(board) {
  return board[0].every(cell => cell !== 0);
}

function winningCells(board, row, col) {
  const color = board[row][col];
  if (!color) return [];
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (const [dr, dc] of dirs) {
    const cells = [[row, col]];
    let r = row + dr, c = col + dc;
    while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === color) {
      cells.push([r, c]);
      r += dr; c += dc;
    }
    r = row - dr; c = col - dc;
    while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === color) {
      cells.push([r, c]);
      r -= dr; c -= dc;
    }
    if (cells.length >= 4) return cells;
  }
  return [];
}

function wouldWin(board, col, color) {
  const dropped = drop(board, col, color);
  if (!dropped) return false;
  return winnerFromMove(dropped.board, dropped.row, dropped.col) === color;
}

/** Prefer win, then block, then center-biased heuristic. */
function botPick(board, color) {
  const legal = legalColumns(board);
  if (!legal.length) return null;
  const opp = other(color);

  for (const c of legal) if (wouldWin(board, c, color)) return c;
  for (const c of legal) if (wouldWin(board, c, opp)) return c;

  const order = [3, 2, 4, 1, 5, 0, 6].filter(c => legal.includes(c));
  // Soft preference: avoid giving opponent an immediate win next
  const safe = order.filter(c => {
    const dropped = drop(board, c, color);
    if (!dropped) return false;
    const replyCols = legalColumns(dropped.board);
    return !replyCols.some(rc => wouldWin(dropped.board, rc, opp));
  });
  const pool = safe.length ? safe : order;
  return pool[Math.floor(Math.random() * Math.min(3, pool.length))];
}

module.exports = {
  ROWS, COLS, RED, YELLOW,
  emptyBoard, cloneBoard, other, legalColumns, drop,
  winnerFromMove, isDraw, winningCells, wouldWin, botPick
};
