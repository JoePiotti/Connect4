const socket = io();
const app = document.getElementById('app');
let state = null;
let lastName = localStorage.getItem('c4_name') || '';
let animDrop = null; // { row, col } to animate once

socket.on('session', ({ token }) => {
  sessionStorage.setItem('c4_token', token);
});
socket.on('toast', ({ message }) => flashToast(message));

socket.on('disconnect', () => {
  if (document.getElementById('reconnecting')) return;
  const d = document.createElement('div');
  d.id = 'reconnecting';
  d.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;z-index:100;font-weight:600;';
  d.textContent = 'Reconnecting…';
  document.body.appendChild(d);
});

socket.on('removed', ({ message }) => {
  sessionStorage.removeItem('c4_token');
  state = null;
  renderHome();
  if (message) flashToast(message);
});

socket.on('state', s => {
  if (!sessionStorage.getItem('c4_token')) return;
  const prev = state && state.lastDrop;
  const next = s.lastDrop;
  if (next && (!prev || prev.row !== next.row || prev.col !== next.col || prev.color !== next.color)) {
    animDrop = { row: next.row, col: next.col };
  }
  state = s;
  render();
});

socket.on('connect', () => {
  const d = document.getElementById('reconnecting');
  if (d) d.remove();
  const token = sessionStorage.getItem('c4_token');
  if (token) {
    socket.emit('rejoin', { token }, res => {
      if (res && res.error) { sessionStorage.removeItem('c4_token'); state = null; renderHome(); }
    });
  } else if (!state) renderHome();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && socket.disconnected) socket.connect();
});

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function saveName(n) { lastName = n; localStorage.setItem('c4_name', n); }
function ack(res) { if (res && res.error) { const e = document.getElementById('err'); if (e) e.textContent = res.error; } }

function flashToast(message) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = message;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 500); }, 2200);
}

function leaveGame() {
  if (!confirm('Leave this game?')) return;
  sessionStorage.removeItem('c4_token');
  state = null;
  renderHome();
  socket.emit('leaveGame', {}, () => {});
}

function colorLabel(c) { return c === 1 ? 'Red' : c === 2 ? 'Yellow' : ''; }
function colorClass(c) { return c === 1 ? 'red' : c === 2 ? 'yellow' : ''; }

function render() {
  if (!state) return renderHome();
  if (state.phase === 'lobby') return renderLobby();
  return renderPlay();
}

function showQR() {
  const joinUrl = `${location.origin}/?code=${state.code}`;
  const overlay = document.createElement('div');
  overlay.className = 'qr-overlay';
  overlay.innerHTML = `
    <div class="qr-box">
      <div class="h">Scan to join</div>
      <img src="/qr?url=${encodeURIComponent(joinUrl)}" width="220" height="220" alt="QR" />
      <div class="code">${esc(state.code)}</div>
      <button class="sec" id="qrdone">Done</button>
    </div>`;
  overlay.onclick = e => { if (e.target === overlay || e.target.id === 'qrdone') overlay.remove(); };
  document.body.appendChild(overlay);
}

function copyLink() {
  const url = `${location.origin}/?code=${state.code}`;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => flashToast('Link copied'));
  } else flashToast(url);
}

function renderHome() {
  const params = new URLSearchParams(location.search);
  const preCode = (params.get('code') || '').toUpperCase().slice(0, 4);
  app.innerHTML = `
    <div class="shell" style="justify-content:center;">
      <div class="hero">
        <div class="hero-ico">🔴🟡</div>
        <div class="brand" style="font-size:26px;margin-top:6px;">Connect Four</div>
        <div class="muted">1–2 players · get four in a row</div>
      </div>
      <div class="card">
        <div class="h">Your name</div>
        <input id="name" maxlength="20" value="${esc(lastName)}" placeholder="Name" />
        <button id="create" ${preCode ? 'class="sec"' : ''}>Create a room</button>
        <div class="muted" style="text-align:center;margin:10px 0;">or join</div>
        <input id="code" maxlength="4" style="text-transform:uppercase;" value="${esc(preCode)}" placeholder="Room code" />
        <button id="join" ${preCode ? '' : 'class="sec"'}>Join room</button>
        <div class="err" id="err"></div>
      </div>
      <div style="text-align:center;margin-top:12px;">
        <a class="muted" href="https://www.party-game.net" target="_blank" rel="noopener">More party games</a>
      </div>
    </div>`;
  const name = () => document.getElementById('name').value;
  const validate = () => {
    if (name().trim().length < 2) {
      document.getElementById('err').textContent = 'Name must be at least 2 characters';
      return false;
    }
    return true;
  };
  document.getElementById('create').onclick = () => {
    if (!validate()) return; saveName(name());
    socket.emit('create', { name: name() }, ack);
  };
  document.getElementById('join').onclick = () => {
    if (!validate()) return; saveName(name());
    socket.emit('join', { code: document.getElementById('code').value, name: name() }, ack);
  };
}

function renderLobby() {
  const s = state;
  const isHost = s.hostId === s.youId;
  const connected = s.players.filter(p => p.connected);
  app.innerHTML = `
    <div class="shell">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span class="brand">🔴 Connect Four</span><span class="muted">Lobby</span>
      </div>
      <div class="card" style="text-align:center;margin-top:8px;">
        <div class="h">Room code</div>
        <div class="code">${esc(s.code)}</div>
        <div class="muted">${connected.filter(p => !p.isBot).length}/2 players${connected.some(p => p.isBot) ? ' · bot ready' : ''}</div>
        <div style="display:flex;gap:6px;margin-top:8px;">
          <button id="qr" class="sec" style="margin:0;flex:1;">QR</button>
          <button id="copy" class="sec" style="margin:0;flex:1;">Copy link</button>
        </div>
      </div>
      <div class="card" style="margin-top:8px;">
        <div class="h">Match length</div>
        ${isHost ? `<div class="tiers" style="margin-top:6px;">
          ${[1, 3, 5, 7].map(n => `<button class="tier${s.settings.matchTo === n ? ' sel' : ''}" data-m="${n}">${n}</button>`).join('')}
        </div>` : `<div class="muted" style="margin-top:6px;">First to ${s.settings.matchTo}</div>`}
      </div>
      <div class="card" style="margin-top:8px;">
        ${connected.map(p => `<div class="row"><span>${esc(p.name)}${p.id === s.youId ? ' (you)' : ''}${p.isBot ? ' · bot' : ''}${p.id === s.hostId ? ' · host' : ''}</span></div>`).join('')}
      </div>
      <div class="muted" style="margin-top:8px;text-align:center;">
        Solo starts vs a bot. Drop discs — first to four in a row wins the game.
      </div>
      ${isHost
        ? `<button id="start">${connected.filter(p => !p.isBot).length < 2 ? 'Start vs bot' : 'Start match'}</button>`
        : `<div class="muted" style="text-align:center;margin-top:12px;">Waiting for host…</div>`}
      <div style="text-align:center;margin-top:10px;">
        <span class="muted" style="cursor:pointer;text-decoration:underline;" id="leave">Leave</span>
      </div>
    </div>`;
  document.getElementById('qr').onclick = showQR;
  document.getElementById('copy').onclick = copyLink;
  document.getElementById('leave').onclick = leaveGame;
  document.querySelectorAll('.tier[data-m]').forEach(t => {
    t.onclick = () => socket.emit('setMatchTo', { matchTo: parseInt(t.getAttribute('data-m'), 10) });
  });
  const start = document.getElementById('start');
  if (start) start.onclick = () => socket.emit('start', {}, ack);
}

function renderPlay() {
  const s = state;
  const isHost = s.hostId === s.youId;
  const yourColor = Number(s.yourColor) || 0;
  const board = s.board || [];
  const legal = new Set(s.legal || []);
  const winSet = new Set((s.winCells || []).map(([r, c]) => `${r},${c}`));
  const dropKey = animDrop ? `${animDrop.row},${animDrop.col}` : null;
  animDrop = null;

  const redP = s.players.find(p => p.color === 1);
  const yelP = s.players.find(p => p.color === 2);

  let endOverlay = '';
  if (s.phase === 'gameover' || s.phase === 'matchover') {
    const r = s.lastResult || {};
    const youWin = r.winner === yourColor;
    const title = s.phase === 'matchover'
      ? (youWin ? 'Match won!' : 'Match over')
      : (r.kind === 'draw' ? 'Draw' : (youWin ? 'You win!' : 'Game over'));
    const detail = r.kind === 'draw'
      ? 'Board is full'
      : `${colorLabel(r.winner)} wins`;
    endOverlay = `
      <div class="overlay-end"><div class="box">
        <h2>${title}</h2>
        <p>${detail}<br>Match ${r.match ? r.match.red : s.match.red}–${r.match ? r.match.yellow : s.match.yellow} (to ${s.match.to})</p>
        ${isHost
          ? `<button id="nextgame">${s.phase === 'matchover' ? 'New match' : 'Next game'}</button>
             <button id="lobby" class="sec">Lobby</button>`
          : `<div class="muted">Waiting for host…</div>`}
      </div></div>`;
  }

  const turnLabel = s.phase !== 'playing'
    ? (s.phase === 'matchover' ? 'Match over' : 'Game over')
    : (s.yourTurn ? 'Your turn — tap a column' : `${colorLabel(s.turn)}'s turn`);

  let cells = '';
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 7; c++) {
      const v = board[r] ? board[r][c] : 0;
      const key = `${r},${c}`;
      const cls = [
        v ? `disc ${colorClass(v)}` : '',
        dropKey === key ? 'drop' : '',
        winSet.has(key) ? 'win' : ''
      ].filter(Boolean).join(' ');
      cells += `<div class="cell">${v ? `<div class="${cls}"></div>` : ''}</div>`;
    }
  }

  const hints = Array.from({ length: 7 }, (_, c) => {
    const can = s.yourTurn && legal.has(c);
    return `<button class="col-hint${can ? ` legal ${colorClass(yourColor)}` : ''}" data-col="${c}" ${can ? '' : 'disabled'} aria-label="Column ${c + 1}"></button>`;
  }).join('');

  app.innerHTML = `
    <div class="play">
      <div class="topbar">
        <div class="score">
          <div class="pill${yourColor === 1 ? ' you' : ''}">
            <div class="muted"><span class="swatch red"></span>${esc(redP ? redP.name : 'Red')}</div>
            <div class="n">${s.match.red}</div>
          </div>
          <div class="muted">to ${s.match.to}</div>
          <div class="pill${yourColor === 2 ? ' you' : ''}">
            <div class="muted"><span class="swatch yellow"></span>${esc(yelP ? yelP.name : 'Yellow')}</div>
            <div class="n">${s.match.yellow}</div>
          </div>
        </div>
        <button id="leave" class="sec" style="width:auto;margin:0;padding:8px 12px;font-size:13px;">Leave</button>
      </div>
      <div class="turn-banner${s.yourTurn ? ' yours' : ''}">${turnLabel}
        <div class="muted" style="font-weight:500;margin-top:2px;">You are ${colorLabel(yourColor) || '…'}</div>
      </div>
      <div class="board-wrap">
        <div class="col-hints">${hints}</div>
        <div class="board">${cells}</div>
        ${endOverlay}
      </div>
    </div>`;

  document.getElementById('leave').onclick = leaveGame;
  document.querySelectorAll('.col-hint.legal').forEach(btn => {
    btn.onclick = () => socket.emit('drop', { col: parseInt(btn.getAttribute('data-col'), 10) }, () => {});
  });
  // Also allow tapping the board cells in a column
  document.querySelectorAll('.board .cell').forEach((el, i) => {
    const col = i % 7;
    el.style.cursor = s.yourTurn && legal.has(col) ? 'pointer' : 'default';
    el.onclick = () => {
      if (!(s.yourTurn && legal.has(col))) return;
      socket.emit('drop', { col }, () => {});
    };
  });
  const next = document.getElementById('nextgame');
  if (next) next.onclick = () => socket.emit('start', {}, ack);
  const lobby = document.getElementById('lobby');
  if (lobby) lobby.onclick = () => socket.emit('returnToLobby');
}

renderHome();
