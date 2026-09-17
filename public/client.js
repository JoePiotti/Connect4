const socket = io();
const app = document.getElementById('app');
let state = null;
let lastName = localStorage.getItem('c4_name') || '';
let animDrop = null; // { row, col } to animate once
let celebratedKey = null;
let audioCtx = null;
const WIN_REVEAL_MS = 2800;
let showEndModal = true;
let endModalTimer = null;

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
  showEndModal = true;
  clearTimeout(endModalTimer);
  renderHome();
  if (message) flashToast(message);
});

socket.on('state', s => {
  if (!sessionStorage.getItem('c4_token')) return;
  const prevPhase = state && state.phase;
  const prev = state && state.lastDrop;
  const next = s.lastDrop;
  if (next && (!prev || prev.row !== next.row || prev.col !== next.col || prev.color !== next.color)) {
    animDrop = { row: next.row, col: next.col };
  }
  const justWon = (s.phase === 'gameover' || s.phase === 'matchover')
    && prevPhase === 'playing'
    && (s.winCells || []).length;
  if (justWon) {
    showEndModal = false;
    clearTimeout(endModalTimer);
    endModalTimer = setTimeout(() => {
      showEndModal = true;
      render();
    }, WIN_REVEAL_MS);
  } else if (s.phase !== 'gameover' && s.phase !== 'matchover') {
    showEndModal = true;
    clearTimeout(endModalTimer);
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

function getAudioCtx() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

document.addEventListener('pointerdown', () => getAudioCtx(), { passive: true });

function playTada() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const t0 = ctx.currentTime + 0.02;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.24, t0);
  master.gain.exponentialRampToValueAtTime(0.001, t0 + 1.35);
  master.connect(ctx.destination);

  function tone(freq, start, dur, type, peak) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0 + start);
    gain.gain.setValueAtTime(0.0001, t0 + start);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + start + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0 + start);
    osc.stop(t0 + start + dur + 0.02);
  }

  // Short pickup, then a major “ta-da” chord
  tone(392.00, 0.00, 0.14, 'triangle', 0.55);
  tone(523.25, 0.11, 0.16, 'triangle', 0.6);
  const chord = 0.28;
  tone(523.25, chord, 0.85, 'triangle', 0.42);
  tone(659.25, chord, 0.85, 'triangle', 0.36);
  tone(783.99, chord, 0.9, 'sine', 0.32);
  tone(1046.5, chord, 0.95, 'sine', 0.28);
  tone(1567.98, chord + 0.04, 0.4, 'sine', 0.1);
}

function launchFireworks(durationMs) {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const existing = document.getElementById('fireworks');
  if (existing) existing.remove();

  const canvas = document.createElement('canvas');
  canvas.id = 'fireworks';
  canvas.className = 'fireworks';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  function resize() {
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
  }
  resize();

  const colors = ['#ff5c7a', '#f0c14a', '#7ec8ff', '#ffd76a', '#ff9a3c', '#e0aaff', '#ffffff'];
  const rockets = [];
  const particles = [];
  const duration = durationMs || 5000;

  function burst(x, y, color) {
    const n = 72 + Math.floor(Math.random() * 24);
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.2;
      const sp = (1.8 + Math.random() * 4.4) * dpr;
      particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 1, decay: 0.004 + Math.random() * 0.003,
        color, size: (2.2 + Math.random() * 2.6) * dpr
      });
    }
  }

  function spawnRocket() {
    const x = (0.12 + Math.random() * 0.76) * canvas.width;
    rockets.push({
      x, y: canvas.height * 0.92,
      ty: (0.18 + Math.random() * 0.42) * canvas.height,
      vy: -(7.5 + Math.random() * 3.5) * dpr,
      color: colors[Math.floor(Math.random() * colors.length)]
    });
  }

  for (let i = 0; i < 5; i++) {
    burst(
      (0.18 + Math.random() * 0.64) * canvas.width,
      (0.18 + Math.random() * 0.4) * canvas.height,
      colors[i % colors.length]
    );
  }
  spawnRocket();
  spawnRocket();

  const start = performance.now();
  let nextBurstAt = 280;
  function frame(now) {
    const elapsed = now - start;
    if (!canvas.parentNode) return;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'lighter';

    while (elapsed < duration - 700 && elapsed >= nextBurstAt) {
      spawnRocket();
      burst(
        (0.14 + Math.random() * 0.72) * canvas.width,
        (0.16 + Math.random() * 0.42) * canvas.height,
        colors[Math.floor(Math.random() * colors.length)]
      );
      nextBurstAt += 300 + Math.random() * 140;
    }

    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      r.y += r.vy;
      ctx.beginPath();
      ctx.fillStyle = r.color;
      ctx.arc(r.x, r.y, 3.2 * dpr, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = '#fff';
      ctx.arc(r.x, r.y, 1.4 * dpr, 0, Math.PI * 2);
      ctx.fill();
      if (r.y <= r.ty) {
        burst(r.x, r.y, r.color);
        rockets.splice(i, 1);
      }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.035 * dpr;
      p.vx *= 0.992;
      p.life -= p.decay;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(p.life, 0) * 0.45;
      ctx.beginPath();
      ctx.fillStyle = p.color;
      ctx.arc(p.x, p.y, p.size * 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = Math.max(p.life, 0);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    if (elapsed < duration || rockets.length || particles.length) {
      requestAnimationFrame(frame);
    } else {
      canvas.remove();
    }
  }
  requestAnimationFrame(frame);
}

function clearFireworks() {
  const fw = document.getElementById('fireworks');
  if (fw) fw.remove();
}

function maybeCelebrateMatch(s) {
  if (!s || s.phase === 'playing' || s.phase === 'lobby') {
    celebratedKey = null;
    clearFireworks();
    return;
  }
  if (s.phase !== 'matchover') return;
  const r = s.lastResult || {};
  if (!r.winner) return;
  const key = `${s.code}:${(r.match && r.match.red) || 0}-${(r.match && r.match.yellow) || 0}:${r.winner}`;
  if (celebratedKey === key) return;
  celebratedKey = key;
  playTada();
  launchFireworks(5200);
}

function leaveGame() {
  if (!confirm('Leave this game?')) return;
  sessionStorage.removeItem('c4_token');
  state = null;
  showEndModal = true;
  clearTimeout(endModalTimer);
  renderHome();
  socket.emit('leaveGame', {}, () => {});
}

function colorLabel(c) { return c === 1 ? 'Red' : c === 2 ? 'Yellow' : ''; }
function colorClass(c) { return c === 1 ? 'red' : c === 2 ? 'yellow' : ''; }

function render() {
  if (!state) {
    clearFireworks();
    return renderHome();
  }
  if (state.phase === 'lobby') {
    maybeCelebrateMatch(state);
    return renderLobby();
  }
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

function showAbout() {
  const overlay = document.createElement('div');
  overlay.className = 'qr-overlay';
  overlay.innerHTML = `
    <div class="qr-box" style="max-width:340px;">
      <div style="font-size:40px;margin-bottom:6px;">🔴🟡</div>
      <div class="brand" style="font-size:18px;margin-bottom:12px;">Connect Four</div>
      <p style="color:var(--muted);font-size:14px;line-height:1.6;margin:0 0 16px;text-align:left;">
        Built by one person, just for the fun of it. No ads, no tracking, no account required — grab a friend and drop some discs.<br><br>
        If you had a good time and want to say thanks, buying me a coffee means a lot.
      </p>
      <a href="https://buymeacoffee.com/joepiotti" target="_blank" rel="noopener"
         style="display:block;text-decoration:none;background:#ffdd00;color:#1a1200;font-weight:700;font-size:15px;border-radius:10px;padding:13px;text-align:center;margin-bottom:10px;">
        ☕ Buy me a coffee
      </a>
      <button class="sec" id="aboutdone" style="margin:0;">Close</button>
    </div>`;
  overlay.onclick = e => { if (e.target === overlay || e.target.id === 'aboutdone') overlay.remove(); };
  document.body.appendChild(overlay);
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
        &nbsp;·&nbsp;
        <span id="about-link" class="muted" style="cursor:pointer;text-decoration:underline;">About &amp; Support</span>
      </div>
    </div>`;
  document.getElementById('about-link').onclick = showAbout;
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
        <span class="brand">🔴 Connect Four</span>
        <span style="display:flex;align-items:center;gap:10px;">
          <span id="about-link-lobby" class="muted" style="cursor:pointer;font-size:12px;text-decoration:underline;">About</span>
          <span class="muted">Lobby</span>
        </span>
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
  document.getElementById('about-link-lobby').onclick = showAbout;
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
  const atEnd = s.phase === 'gameover' || s.phase === 'matchover';
  if (atEnd && showEndModal) {
    const r = s.lastResult || {};
    const youWin = r.winner === yourColor;
    const title = s.phase === 'matchover'
      ? (youWin ? 'Match won!' : 'Match over')
      : (r.kind === 'draw' ? 'Draw' : (youWin ? 'You win!' : 'Game over'));
    const detail = r.kind === 'draw'
      ? 'Board is full'
      : `${colorLabel(r.winner)} wins`;
    const cele = s.phase === 'matchover' ? ' celebrate' : '';
    endOverlay = `
      <div class="overlay-end${cele}"><div class="box">
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
    <div class="play${s.phase === 'matchover' ? ' celebrating' : ''}">
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
  maybeCelebrateMatch(s);
}

renderHome();
