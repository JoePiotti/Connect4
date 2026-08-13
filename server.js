const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const { randomUUID } = require('crypto');
const eng = require('./lib/engine');
const { RED, YELLOW } = eng;

const app = express();
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
}));

app.get('/qr', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).end();
  try {
    const svg = await QRCode.toString(url, { type: 'svg', margin: 2 });
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(svg);
  } catch (e) { res.status(500).end(); }
});

const server = http.createServer(app);
const io = new Server(server, { pingInterval: 10000, pingTimeout: 8000 });

const MIN_PLAYERS = 1;
const MAX_PLAYERS = 2;
const MATCH_DEFAULT = 3;
const MATCH_LENGTHS = [1, 3, 5, 7];

const rooms = {};
const sessions = {};

function makeCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 4; i++) c += A[Math.floor(Math.random() * A.length)];
  return rooms[c] ? makeCode() : c;
}

function makeRoom() {
  const room = {
    code: makeCode(),
    players: [],
    hostId: null,
    phase: 'lobby', // lobby | playing | gameover | matchover
    settings: { matchTo: MATCH_DEFAULT },
    board: null,
    turn: null, // RED | YELLOW
    colors: {},
    match: { [RED]: 0, [YELLOW]: 0 },
    lastDrop: null,
    winCells: [],
    lastResult: null,
    botTimer: null
  };
  rooms[room.code] = room;
  return room;
}

function byId(room, id) { return room.players.find(p => p.id === id); }

function colorName(c) { return c === RED ? 'Red' : c === YELLOW ? 'Yellow' : ''; }

function stateFor(room, player) {
  const myColor = room.colors[player.id] || 0;
  const s = {
    code: room.code,
    phase: room.phase,
    youId: player.id,
    hostId: room.hostId,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    settings: room.settings,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      connected: p.connected,
      color: room.colors[p.id] || 0,
      isBot: !!p.isBot
    })),
    yourColor: myColor,
    match: { red: room.match[RED], yellow: room.match[YELLOW], to: room.settings.matchTo }
  };

  if (room.phase === 'playing' || room.phase === 'gameover' || room.phase === 'matchover') {
    s.board = room.board.map(row => row.slice());
    s.turn = room.turn;
    s.yourTurn = room.phase === 'playing' && myColor === room.turn;
    s.legal = room.phase === 'playing' && s.yourTurn ? eng.legalColumns(room.board) : [];
    s.lastDrop = room.lastDrop;
    s.winCells = room.winCells || [];
  }
  if (room.lastResult) s.lastResult = room.lastResult;
  return s;
}

function broadcast(room) {
  room.players.forEach(p => { if (p.socket) p.socket.emit('state', stateFor(room, p)); });
}

function toast(room, message) {
  room.players.forEach(p => { if (p.socket) p.socket.emit('toast', { message }); });
}

function clearBotTimer(room) {
  if (room.botTimer) { clearTimeout(room.botTimer); room.botTimer = null; }
}

function botPlayer(room) {
  return room.players.find(p => p.isBot) || null;
}

function ensureBot(room) {
  const humans = room.players.filter(p => !p.isBot);
  if (humans.length >= 2) {
    room.players = room.players.filter(p => !p.isBot);
    return;
  }
  if (botPlayer(room)) return;
  const bot = {
    id: randomUUID(),
    name: 'Bot',
    connected: true,
    isBot: true,
    socket: null
  };
  room.players.push(bot);
}

function assignColors(room) {
  const humans = room.players.filter(p => !p.isBot);
  const order = [...humans, ...room.players.filter(p => p.isBot)];
  room.colors = {};
  if (order[0]) room.colors[order[0].id] = RED;
  if (order[1]) room.colors[order[1].id] = YELLOW;
}

function scheduleBot(room) {
  clearBotTimer(room);
  if (room.phase !== 'playing') return;
  const bot = botPlayer(room);
  if (!bot) return;
  const color = room.colors[bot.id];
  if (color !== room.turn) return;
  room.botTimer = setTimeout(() => botTick(room), 400 + Math.random() * 500);
}

function botTick(room) {
  room.botTimer = null;
  if (room.phase !== 'playing') return;
  const bot = botPlayer(room);
  if (!bot) return;
  const color = room.colors[bot.id];
  if (color !== room.turn) return;
  const col = eng.botPick(room.board, color);
  if (col == null) return;
  applyDrop(room, color, col);
}

function startGame(room) {
  clearBotTimer(room);
  room.board = eng.emptyBoard();
  room.lastDrop = null;
  room.winCells = [];
  room.lastResult = null;
  room.phase = 'playing';
  // Alternate who starts each game in a match; first game Red starts
  const gamesPlayed = room.match[RED] + room.match[YELLOW];
  room.turn = gamesPlayed % 2 === 0 ? RED : YELLOW;
  broadcast(room);
  scheduleBot(room);
}

function finishGame(room, winnerColor, kind) {
  clearBotTimer(room);
  if (winnerColor) room.match[winnerColor] += 1;
  room.lastResult = {
    winner: winnerColor || 0,
    kind,
    match: { red: room.match[RED], yellow: room.match[YELLOW] }
  };
  if (winnerColor && room.match[winnerColor] >= room.settings.matchTo) {
    room.phase = 'matchover';
  } else {
    room.phase = 'gameover';
  }
  broadcast(room);
}

function applyDrop(room, color, col) {
  if (room.phase !== 'playing' || color !== room.turn) return false;
  const dropped = eng.drop(room.board, col, color);
  if (!dropped) return false;
  room.board = dropped.board;
  room.lastDrop = { row: dropped.row, col: dropped.col, color };
  const win = eng.winnerFromMove(room.board, dropped.row, dropped.col);
  if (win) {
    room.winCells = eng.winningCells(room.board, dropped.row, dropped.col);
    finishGame(room, win, 'win');
    return true;
  }
  if (eng.isDraw(room.board)) {
    room.winCells = [];
    finishGame(room, 0, 'draw');
    return true;
  }
  room.turn = eng.other(color);
  broadcast(room);
  scheduleBot(room);
  return true;
}

function closeRoom(room) {
  clearBotTimer(room);
  room.players.forEach(p => {
    if (p.id && sessions[p.id] && sessions[p.id].code === room.code) delete sessions[p.id];
  });
  delete rooms[room.code];
}

function removeFromRoom(room, target, notice) {
  clearBotTimer(room);
  const idx = room.players.indexOf(target);
  if (idx === -1) return;
  if (target.socket && notice) target.socket.emit('removed', { message: notice });
  if (target.socket) target.socket = null;
  room.players.splice(idx, 1);
  delete room.colors[target.id];
  delete sessions[target.id];
  if (room.hostId === target.id) {
    const human = room.players.find(p => !p.isBot);
    room.hostId = human ? human.id : (room.players[0] && room.players[0].id) || null;
  }
  const humans = room.players.filter(p => !p.isBot);
  if (!humans.length) {
    closeRoom(room);
    return;
  }
  if (room.phase !== 'lobby') {
    room.phase = 'lobby';
    room.board = null;
    room.match = { [RED]: 0, [YELLOW]: 0 };
    toast(room, 'Returned to lobby');
  }
  broadcast(room);
}

io.on('connection', (socket) => {
  let me = null; // { code, playerId }

  function ctx() {
    if (!me) return null;
    const room = rooms[me.code];
    if (!room) return null;
    const player = byId(room, me.playerId);
    if (!player) return null;
    return { room, player };
  }

  function leaveCurrent(notice) {
    const c = ctx();
    if (!c) { me = null; return null; }
    const name = c.player.name;
    const room = c.room;
    removeFromRoom(room, c.player, notice);
    me = null;
    return { room, name };
  }

  function bindPlayer(room, player) {
    player.socket = socket;
    player.connected = true;
    me = { code: room.code, playerId: player.id };
    sessions[player.id] = { code: room.code, token: player.token };
    socket.emit('session', { token: player.token });
    broadcast(room);
  }

  socket.on('create', ({ name }, ack) => {
    name = String(name || '').trim().slice(0, 20);
    if (name.length < 2) return ack && ack({ error: 'Name must be at least 2 characters' });
    leaveCurrent(null);
    const room = makeRoom();
    const player = {
      id: randomUUID(),
      name,
      connected: true,
      isBot: false,
      socket,
      token: randomUUID()
    };
    room.players.push(player);
    room.hostId = player.id;
    bindPlayer(room, player);
    ack && ack({});
  });

  socket.on('join', ({ code, name }, ack) => {
    name = String(name || '').trim().slice(0, 20);
    if (name.length < 2) return ack && ack({ error: 'Name must be at least 2 characters' });
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    const room = rooms[code];
    if (!room) return ack && ack({ error: 'Room not found' });
    if (room.phase !== 'lobby') return ack && ack({ error: 'Game already started' });
    const humans = room.players.filter(p => !p.isBot);
    if (humans.length >= MAX_PLAYERS) return ack && ack({ error: 'Room is full' });
    leaveCurrent(null);
    // Drop bot seat when a human joins
    room.players = room.players.filter(p => !p.isBot);
    const player = {
      id: randomUUID(),
      name,
      connected: true,
      isBot: false,
      socket,
      token: randomUUID()
    };
    room.players.push(player);
    if (!room.hostId) room.hostId = player.id;
    bindPlayer(room, player);
    ack && ack({});
  });

  socket.on('rejoin', ({ token }, ack) => {
    let found = null;
    for (const room of Object.values(rooms)) {
      const player = room.players.find(p => p.token === token);
      if (player) { found = { room, player }; break; }
    }
    if (!found) return ack && ack({ error: 'Session expired' });
    found.player.socket = socket;
    found.player.connected = true;
    me = { code: found.room.code, playerId: found.player.id };
    socket.emit('session', { token: found.player.token });
    broadcast(found.room);
    ack && ack({});
  });

  socket.on('setMatchTo', ({ matchTo }) => {
    const c = ctx(); if (!c) return;
    if (c.player.id !== c.room.hostId || c.room.phase !== 'lobby') return;
    if (!MATCH_LENGTHS.includes(matchTo)) return;
    c.room.settings.matchTo = matchTo;
    broadcast(c.room);
  });

  socket.on('leaveGame', (_p, ack) => {
    const left = leaveCurrent(null);
    if (left && left.room && rooms[left.room.code]) toast(left.room, `${left.name} left`);
    ack && ack({});
  });

  socket.on('start', (_p, ack) => {
    const c = ctx(); if (!c) return;
    if (c.player.id !== c.room.hostId) return ack && ack({ error: 'Only the host can start' });
    if (c.room.phase !== 'lobby' && c.room.phase !== 'gameover' && c.room.phase !== 'matchover') {
      return ack && ack({ error: 'Cannot start now' });
    }
    if (c.room.phase === 'matchover' || c.room.phase === 'lobby') {
      c.room.match = { [RED]: 0, [YELLOW]: 0 };
    }
    ensureBot(c.room);
    if (c.room.players.length < 2) return ack && ack({ error: 'Need an opponent or bot' });
    if (c.room.phase === 'lobby' || c.room.phase === 'matchover' || !c.room.colors[c.room.players[0].id]) {
      assignColors(c.room);
    }
    startGame(c.room);
    ack && ack({});
  });

  socket.on('drop', ({ col }, ack) => {
    const c = ctx(); if (!c) return ack && ack({ ok: false, reason: 'No game' });
    const { room, player } = c;
    const color = room.colors[player.id];
    if (room.phase !== 'playing') return ack && ack({ ok: false, reason: 'Not now' });
    if (color !== room.turn) return ack && ack({ ok: false, reason: 'Not your turn' });
    col = Number(col);
    if (!Number.isInteger(col)) return ack && ack({ ok: false, reason: 'Bad column' });
    const ok = applyDrop(room, color, col);
    if (!ok) return ack && ack({ ok: false, reason: 'Illegal drop' });
    ack && ack({ ok: true });
  });

  socket.on('returnToLobby', () => {
    const c = ctx(); if (!c) return;
    if (c.player.id !== c.room.hostId) return;
    clearBotTimer(c.room);
    c.room.phase = 'lobby';
    c.room.board = null;
    c.room.lastDrop = null;
    c.room.winCells = [];
    c.room.lastResult = null;
    broadcast(c.room);
  });

  socket.on('disconnect', () => {
    const c = ctx();
    if (!c) return;
    c.player.connected = false;
    c.player.socket = null;
    broadcast(c.room);
  });
});

const PORT = process.env.PORT || 3021;
server.listen(PORT, () => console.log(`Connect Four on :${PORT}`));
