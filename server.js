'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const GRACE_MS = 3000;            // süre bitince istemcilerin son gönderimi için tanınan pay
const ROOM_IDLE_MS = 20 * 60 * 1000; // kimse kalmayınca odanın silinme süresi
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 45;

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.send('ok'));
app.get('/dashboard', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/api/metrics', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(metricsSnapshot());
});

const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 5e6 });

/** @type {Map<string, Room>} */
const rooms = new Map();


function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

function clampInt(v, min, max, def) {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return def;
  return Math.min(max, Math.max(min, n));
}

function cleanName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').slice(0, 20) || 'Anonymous';
}

// Her oyuncuya, haberi olmadan, ismine parantez içinde bir unvan eklenir
const TITLES = [
  'knows nothing', 'first of their name', 'breaker of pencils', 'sees your drawing',
  'holds the door', 'king in the north', 'mother of doodles', 'the unburnt',
  'warden of the eraser', 'of House Stick Figure', 'definitely not a wight',
  'drinks and draws things', 'bends the knee', 'three-eyed doodler',
  'protector of the canvas', 'lord of light sketches', 'the hand of the crayon',
  'shame, shame, shame', 'winter is their excuse', 'a girl has no talent',
];
function titledName(name) {
  return `${name} (${TITLES[Math.floor(Math.random() * TITLES.length)]})`;
}

// Sunucu açıldığından beri: sayaçlar (bellekte, yeniden başlayınca sıfırlanır)
const stats = { drawings: 0, sentences: 0, games: 0, since: Date.now() };
function broadcastStats() { io.emit('stats', stats); }

// ---------- Trafik metrikleri (/dashboard ve /api/metrics) ----------
// Her şey bellekte tutulur: sunucu yeniden başlayınca sıfırlanır. Kişisel veri (IP vb.) tutulmaz.
const HOUR_MS = 3600 * 1000;
const METRICS_KEEP_HOURS = 24 * 7;
const metrics = {
  since: Date.now(),
  totals: { connections: 0, joins: 0, roomsCreated: 0, gamesStarted: 0, gamesFinished: 0, gamesAbandoned: 0, submissions: 0, kicks: 0 },
  uniquePlayers: new Set(),
  peak: { online: 0, at: null, inRooms: 0, inRoomsAt: null },
  hourly: new Map(), // hourStart -> { connections, joins, rooms, games, players: Set }
  games: [],         // son 100 oyun
  events: [],        // son 100 olay
};
function hourBucket() {
  const key = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
  let b = metrics.hourly.get(key);
  if (!b) {
    b = { connections: 0, joins: 0, rooms: 0, games: 0, players: new Set() };
    metrics.hourly.set(key, b);
    for (const k of metrics.hourly.keys()) if (key - k > METRICS_KEEP_HOURS * HOUR_MS) metrics.hourly.delete(k);
  }
  return b;
}
function logEvent(type, text) {
  metrics.events.push({ t: Date.now(), type, text });
  if (metrics.events.length > 100) metrics.events.shift();
}
function playersInRooms() {
  let n = 0;
  for (const r of rooms.values()) n += connectedPlayers(r).length;
  return n;
}
function trackPresence() {
  const online = io.engine.clientsCount;
  if (online > metrics.peak.online) { metrics.peak.online = online; metrics.peak.at = Date.now(); }
  const inRooms = playersInRooms();
  if (inRooms > metrics.peak.inRooms) { metrics.peak.inRooms = inRooms; metrics.peak.inRoomsAt = Date.now(); }
}
function metricsSnapshot() {
  const byPhase = { lobby: 0, playing: 0, results: 0 };
  const activeRooms = [];
  for (const r of rooms.values()) {
    byPhase[r.phase]++;
    const players = connectedPlayers(r).length;
    if (players > 0) activeRooms.push({ code: r.code, phase: r.phase, players, total: r.players.size, round: r.round, totalRounds: r.totalRounds, albums: r.albums.length, steps: r.totalRounds });
  }
  return {
    now: Date.now(),
    since: metrics.since,
    current: { online: io.engine.clientsCount, inRooms: playersInRooms(), rooms: rooms.size, byPhase, activeRooms },
    totals: { ...metrics.totals, uniquePlayers: metrics.uniquePlayers.size, drawings: stats.drawings, sentences: stats.sentences },
    peak: metrics.peak,
    hourly: [...metrics.hourly.entries()].sort((a, b) => a[0] - b[0])
      .map(([hour, b]) => ({ hour, connections: b.connections, joins: b.joins, rooms: b.rooms, games: b.games, players: b.players.size })),
    games: metrics.games.slice().reverse(),
    events: metrics.events.slice().reverse(),
  };
}

function createRoom(hostId) {
  const room = {
    code: genCode(),
    hostId,
    players: new Map(), // playerId -> { id, name, color, socketId, connected }
    phase: 'lobby',     // lobby | playing | results
    settings: { writeTime: 60, drawTime: 90, steps: 0 }, // steps: albüm başına adım (0 = oyuncu sayısı kadar)
    colorSeq: 0,
    round: 0,
    totalRounds: 0,
    order: [],          // oyuna başlayan oyuncuların id sırası
    albums: [],         // her oyuncuya bir albüm: { ownerId, opening, entries } — tur r>=1 girdisi entries[r-1]
    submissions: new Map(),
    roundEndsAt: 0,
    timer: null,
    reveal: { chain: 0, step: 1, auto: false, stepStartedAt: 0, stepMs: 0, replayMs: 0 },
    revealTimer: null,
    emptySince: Date.now(),
  };
  rooms.set(room.code, room);
  return room;
}

function connectedPlayers(room) {
  return [...room.players.values()].filter((p) => p.connected);
}

function pickColor(room) {
  // Altın açı ile dağıtılmış tonlar: 45 oyuncuda bile ayırt edilebilir renkler
  const i = room.colorSeq++;
  const hue = Math.round((i * 137.508) % 360);
  const light = [45, 35, 55][i % 3];
  return `hsl(${hue} 70% ${light}%)`;
}

function roundType(round) {
  return round % 2 === 0 ? 'text' : 'draw';
}

// Çember: tur r'de oyuncu i, listede kendinden r önce gelen oyuncunun albümünde çalışır.
// Albüm sahibi j açısından adım r'yi (j + r). oyuncu yapar, yani hep "listedeki bir sonraki oyuncu".
function albumIndexFor(room, playerId, round) {
  const i = room.order.indexOf(playerId);
  if (i < 0) return -1;
  const n = room.order.length;
  return (((i - round) % n) + n) % n;
}

// Albüm başına adım sayısı = tur sayısı; 0 ise herkes her albüme bir kez uğrar (oyuncu sayısı kadar)
function stepsFor(room, n) {
  const k = room.settings.steps > 0 ? Math.min(room.settings.steps, n) : n;
  return Math.max(MIN_PLAYERS, Math.min(k, n));
}

function nameOf(room, playerId) {
  const p = room.players.get(playerId);
  return p ? p.name : '?';
}

function playerList(room) {
  return [...room.players.values()].map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    connected: p.connected,
    inGame: room.order.includes(p.id),
  }));
}

function serializeAlbum(room, index) {
  const a = room.albums[index];
  if (!a) return null;
  const entry = (e) => ({
    type: e.type,
    author: nameOf(room, e.authorId),
    authorColor: room.players.get(e.authorId)?.color,
    content: e.content,
    strokes: e.strokes || null, // çizimin fırça hareketleri (sonuçta yeniden oynatılır)
  });
  const steps = [entry({ type: 'text', authorId: a.ownerId, content: a.opening }), ...a.entries.filter(Boolean).map(entry)];
  return {
    index,
    owner: nameOf(room, a.ownerId),
    ownerColor: room.players.get(a.ownerId)?.color,
    steps,
  };
}

function sendAlbum(room, target) {
  const album = serializeAlbum(room, room.reveal.chain);
  if (album) target.emit('results:album', album);
}

// ---------- Sonuç sunumu: adımlar sunucu zamanlamasıyla kendiliğinden açılır ----------
const REVEAL_DRAW_PAUSE_MS = 1500; // çizim bittikten sonra bekleme
// Cümle: okuma hızına göre 2–3.5 sn (yaklaşık 15 karakter/sn)
function textMsFor(content) {
  const len = String(content || '').length;
  return Math.max(2000, Math.min(3500, 1200 + len * 65));
}
function revealEntry(room) {
  const a = room.albums[room.reveal.chain];
  if (!a) return null;
  const i = room.reveal.step - 1;
  return i === 0 ? { type: 'text', content: a.opening } : a.entries[i - 1] || null;
}
function replayMsFor(e) {
  if (!e || e.type !== 'draw' || !e.strokes) return 0;
  return Math.max(1500, Math.min(12000, e.strokes.ms || 3000));
}
function setRevealStep(room, chain, step, auto) {
  const r = room.reveal;
  r.chain = chain; r.step = step; r.auto = auto;
  const e = revealEntry(room);
  r.replayMs = replayMsFor(e);
  r.stepMs = e && e.type === 'draw' ? (r.replayMs || 3000) + REVEAL_DRAW_PAUSE_MS : textMsFor(e && e.content);
  r.stepStartedAt = Date.now();
}
function emitReveal(room) {
  io.to(room.code).emit('results:reveal', room.reveal);
}
function scheduleReveal(room) {
  clearTimeout(room.revealTimer);
  room.revealTimer = null;
  const r = room.reveal;
  if (room.phase !== 'results' || !r.auto) return;
  room.revealTimer = setTimeout(() => {
    if (room.phase !== 'results' || !r.auto) return;
    if (r.step < room.totalRounds) {
      setRevealStep(room, r.chain, r.step + 1, true);
      emitReveal(room);
      scheduleReveal(room);
    } else {
      // Albüm bitti: ev sahibi bir sonraki albüme geçene kadar bekle
      r.auto = false;
      emitReveal(room);
    }
  }, r.stepMs);
}

function stateFor(room, playerId, { withTask = false } = {}) {
  const base = {
    code: room.code,
    hostId: room.hostId,
    you: playerId,
    phase: room.phase,
    players: playerList(room),
    settings: room.settings,
    round: room.round,
    totalRounds: room.totalRounds,
    roundEndsAt: room.roundEndsAt,
    serverNow: Date.now(),
    submitted: [...room.submissions.keys()],
    minPlayers: MIN_PLAYERS,
  };

  if (room.phase === 'playing') {
    const ai = albumIndexFor(room, playerId, room.round);
    if (ai < 0) {
      base.task = { spectator: true };
    } else {
      const album = room.albums[ai];
      base.task = {
        spectator: false,
        type: roundType(room.round),
        chainOwner: nameOf(room, album.ownerId),
        submitted: room.submissions.has(playerId),
      };
      // Önceki adımın içeriği (çizim verisi büyük olabilir) yalnızca tur başında / katılımda gönderilir
      if (withTask) {
        const prev = room.round === 0 ? null
          : room.round === 1 ? { type: 'text', authorId: album.ownerId, content: album.opening }
          : album.entries[room.round - 2] || null;
        base.task.prev = prev
          ? { type: prev.type, author: nameOf(room, prev.authorId), content: prev.content }
          : null;
      }
    }
  }

  if (room.phase === 'results') {
    base.reveal = room.reveal;
    base.albumCount = room.albums.length;
  }

  return base;
}

function broadcast(room, opts) {
  for (const p of room.players.values()) {
    if (p.socketId) io.to(p.socketId).emit('room:state', stateFor(room, p.id, opts));
  }
}

function startGame(room) {
  room.order = connectedPlayers(room).map((p) => p.id);
  const n = room.order.length;
  const k = stepsFor(room, n);
  room.albums = room.order.map((id) => ({ ownerId: id, opening: null, entries: [] }));
  room.totalRounds = k; // her albümde k adım: açılış cümlesi + (k - 1) tur
  room.round = 0;
  room.phase = 'playing';
  stats.games++;
  metrics.totals.gamesStarted++;
  hourBucket().games++;
  room.gameRecord = { code: room.code, startedAt: Date.now(), finishedAt: null, players: n, steps: k, durationMs: null, status: 'playing' };
  metrics.games.push(room.gameRecord);
  if (metrics.games.length > 100) metrics.games.shift();
  logEvent('game', `Game started in ${room.code}: ${n} players, ${k} steps per album`);
  beginRound(room);
}

function beginRound(room) {
  room.submissions = new Map();
  const type = roundType(room.round);
  const secs = type === 'draw' ? room.settings.drawTime : room.settings.writeTime;
  room.roundEndsAt = Date.now() + secs * 1000;
  clearTimeout(room.timer);
  room.timer = setTimeout(() => finishRound(room), secs * 1000 + GRACE_MS);
  broadcast(room, { withTask: true });
}

function finishRound(room) {
  if (room.phase !== 'playing') return;
  clearTimeout(room.timer);
  room.timer = null;
  const type = roundType(room.round);
  if (room.round === 0) {
    for (const a of room.albums) {
      a.opening = room.submissions.get(a.ownerId)?.content || '';
      if (a.opening) stats.sentences++;
    }
  } else {
    for (const pid of room.order) {
      const ai = albumIndexFor(room, pid, room.round);
      const sub = room.submissions.get(pid);
      let content = sub ? sub.content : null;
      if (content == null) content = type === 'text' ? '' : null;
      if (type === 'draw' && content) stats.drawings++;
      if (type === 'text' && content) stats.sentences++;
      room.albums[ai].entries[room.round - 1] = { type, authorId: pid, content, strokes: sub?.strokes || null };
    }
  }
  broadcastStats();
  room.round++;
  if (room.round >= room.totalRounds) {
    room.phase = 'results';
    if (room.gameRecord) {
      room.gameRecord.finishedAt = Date.now();
      room.gameRecord.durationMs = room.gameRecord.finishedAt - room.gameRecord.startedAt;
      room.gameRecord.status = 'finished';
      room.gameRecord = null;
      metrics.totals.gamesFinished++;
      logEvent('game', `Game finished in ${room.code}`);
    }
    room.roundEndsAt = 0;
    room.submissions = new Map();
    setRevealStep(room, 0, 1, true);
    broadcast(room);
    sendAlbum(room, io.to(room.code));
    scheduleReveal(room);
  } else {
    beginRound(room);
  }
}

function maybeFinishEarly(room) {
  const waiting = room.order.filter((pid) => {
    const p = room.players.get(pid);
    return p && p.connected && !room.submissions.has(pid);
  });
  if (waiting.length === 0) finishRound(room);
}

function transferHostIfNeeded(room) {
  const host = room.players.get(room.hostId);
  if (host && host.connected) return;
  const next = connectedPlayers(room)[0];
  if (next) room.hostId = next.id;
}

function touchEmpty(room) {
  room.emptySince = connectedPlayers(room).length === 0 ? Date.now() : null;
}

// Fırça hareketleri: istemcinin ürettiği JSON, boyut ve biçim kontrolüyle saklanır
function validateStrokes(strokes) {
  if (!strokes || typeof strokes !== 'object' || !Array.isArray(strokes.ops)) return null;
  if (strokes.ops.length > 5000) return null;
  let json;
  try { json = JSON.stringify(strokes); } catch { return null; }
  if (json.length > 1.5e6) return null;
  return { w: 800, h: 600, ms: Math.max(0, Math.min(60000, +strokes.ms || 0)), ops: strokes.ops };
}

function validateContent(type, content) {
  if (type === 'text') {
    return String(content || '').trim().slice(0, 200);
  }
  if (typeof content !== 'string') return null;
  if (!content.startsWith('data:image/png;base64,') && !content.startsWith('data:image/jpeg;base64,')) return null;
  if (content.length > 3e6) return null;
  return content;
}

io.on('connection', (socket) => {
  socket.emit('stats', stats);
  metrics.totals.connections++;
  hourBucket().connections++;
  trackPresence();
  const getRoom = () => (socket.data.code ? rooms.get(socket.data.code) : null);
  const isHost = (room) => room && room.hostId === socket.data.playerId;

  socket.on('room:create', ({ name, playerId } = {}, cb = () => {}) => {
    if (!playerId) return cb({ error: 'Missing player id' });
    const room = createRoom(playerId);
    metrics.totals.roomsCreated++;
    hourBucket().rooms++;
    logEvent('room', `Room ${room.code} created`);
    joinRoom(room, cleanName(name), playerId, cb);
  });

  socket.on('room:join', ({ code, name, playerId } = {}, cb = () => {}) => {
    if (!playerId) return cb({ error: 'Missing player id' });
    const room = rooms.get(String(code || '').trim().toUpperCase());
    if (!room) return cb({ error: 'No such room' });
    joinRoom(room, cleanName(name), playerId, cb);
  });

  function joinRoom(room, name, playerId, cb) {
    const existing = room.players.get(playerId);
    if (existing) {
      existing.connected = true;
      existing.socketId = socket.id;
      // Yeniden bağlanan oyuncu unvanını korur
    } else {
      if (room.phase !== 'lobby') return cb({ error: 'The game has already started, you cannot join this room right now' });
      if (room.players.size >= MAX_PLAYERS) return cb({ error: 'Room is full' });
      room.players.set(playerId, {
        id: playerId,
        name: titledName(name),
        color: pickColor(room),
        socketId: socket.id,
        connected: true,
      });
      metrics.totals.joins++;
      metrics.uniquePlayers.add(playerId);
      const b = hourBucket(); b.joins++; b.players.add(playerId);
      logEvent('join', `${name} joined ${room.code} (${room.players.size} players)`);
    }
    socket.data.code = room.code;
    socket.data.playerId = playerId;
    socket.join(room.code);
    transferHostIfNeeded(room);
    touchEmpty(room);
    trackPresence();
    cb({ ok: true, code: room.code });
    // Katılan kişiye tam durum (sonuç aşamasındaysa zincirlerle birlikte), diğerlerine güncelleme
    io.to(socket.id).emit('room:state', stateFor(room, playerId, { withTask: true }));
    if (room.phase === 'results') sendAlbum(room, socket);
    for (const p of room.players.values()) {
      if (p.socketId && p.id !== playerId) io.to(p.socketId).emit('room:state', stateFor(room, p.id));
    }
  }

  socket.on('room:settings', (settings = {}) => {
    const room = getRoom();
    if (!isHost(room) || room.phase !== 'lobby') return;
    room.settings.writeTime = clampInt(settings.writeTime, 15, 300, room.settings.writeTime);
    room.settings.drawTime = clampInt(settings.drawTime, 20, 600, room.settings.drawTime);
    room.settings.steps = clampInt(settings.steps, 0, MAX_PLAYERS, room.settings.steps);
    broadcast(room);
  });

  socket.on('game:start', () => {
    const room = getRoom();
    if (!isHost(room) || room.phase !== 'lobby') return;
    if (connectedPlayers(room).length < MIN_PLAYERS) {
      return socket.emit('toast', `At least ${MIN_PLAYERS} players needed`);
    }
    startGame(room);
  });

  socket.on('round:submit', ({ content, strokes } = {}, cb = () => {}) => {
    const room = getRoom();
    if (!room || room.phase !== 'playing') return cb({ error: 'No active round' });
    const pid = socket.data.playerId;
    if (!room.order.includes(pid)) return cb({ error: 'You are not in this game' });
    if (room.submissions.has(pid)) return cb({ ok: true });
    const type = roundType(room.round);
    const clean = validateContent(type, content);
    if (type === 'draw' && clean == null) return cb({ error: 'Could not read the drawing' });
    room.submissions.set(pid, { content: clean, strokes: type === 'draw' ? validateStrokes(strokes) : null });
    metrics.totals.submissions++;
    cb({ ok: true });
    broadcast(room);
    maybeFinishEarly(room);
  });

  socket.on('results:nav', ({ dir } = {}) => {
    const room = getRoom();
    if (!isHost(room) || room.phase !== 'results') return;
    const r = room.reveal;
    const before = r.chain;
    const len = room.totalRounds;
    let chain = r.chain, step = r.step, auto = r.auto;
    if (dir === 'next') {
      if (step < len) step++;
      else if (chain < room.albums.length - 1) { chain++; step = 1; auto = true; } // yeni albüm: sunum yeniden başlar
    } else if (dir === 'prev') {
      if (step > 1) step--;
      else if (chain > 0) { chain--; step = len; auto = false; }
    }
    setRevealStep(room, chain, step, auto);
    if (chain !== before) sendAlbum(room, io.to(room.code));
    emitReveal(room);
    scheduleReveal(room);
  });

  // Ev sahibi sunumu duraklatır / sürdürür
  socket.on('results:auto', ({ on } = {}) => {
    const room = getRoom();
    if (!isHost(room) || room.phase !== 'results') return;
    const r = room.reveal;
    if (on && r.step >= room.totalRounds) return; // albüm bitti: "Next album" ile ilerlenir
    setRevealStep(room, r.chain, r.step, !!on);
    emitReveal(room);
    scheduleReveal(room);
  });

  socket.on('game:restart', () => {
    const room = getRoom();
    if (!isHost(room) || room.phase === 'playing') return;
    clearTimeout(room.timer);
    room.timer = null;
    clearTimeout(room.revealTimer);
    room.revealTimer = null;
    // Ayrılanları temizle
    for (const [id, p] of room.players) if (!p.connected) room.players.delete(id);
    room.phase = 'lobby';
    room.round = 0;
    room.totalRounds = 0;
    room.order = [];
    room.albums = [];
    room.submissions = new Map();
    room.roundEndsAt = 0;
    room.reveal = { chain: 0, step: 1, auto: false, stepStartedAt: 0, stepMs: 0, replayMs: 0 };
    transferHostIfNeeded(room);
    broadcast(room);
  });

  socket.on('player:kick', ({ playerId } = {}) => {
    const room = getRoom();
    if (!isHost(room) || room.phase !== 'lobby') return;
    const target = room.players.get(playerId);
    if (!target || playerId === room.hostId) return;
    room.players.delete(playerId);
    metrics.totals.kicks++;
    logEvent('kick', `${target.name} was removed from ${room.code}`);
    if (target.socketId) {
      io.to(target.socketId).emit('kicked');
      io.sockets.sockets.get(target.socketId)?.leave(room.code);
    }
    broadcast(room);
  });

  socket.on('disconnect', () => {
    const room = getRoom();
    if (!room) return;
    const p = room.players.get(socket.data.playerId);
    if (!p || p.socketId !== socket.id) return;
    p.connected = false;
    p.socketId = null;
    if (room.phase === 'lobby') {
      room.players.delete(p.id);
    }
    transferHostIfNeeded(room);
    touchEmpty(room);
    broadcast(room);
    if (room.phase === 'playing') maybeFinishEarly(room);
  });
});

// Boş kalan odaları temizle
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.emptySince && now - room.emptySince > ROOM_IDLE_MS) {
      clearTimeout(room.timer);
      clearTimeout(room.revealTimer);
      if (room.gameRecord) { room.gameRecord.status = 'abandoned'; metrics.totals.gamesAbandoned++; }
      logEvent('room', `Room ${code} removed (idle)`);
      rooms.delete(code);
    }
  }
}, 60 * 1000);

server.listen(PORT, () => {
  console.log(`Sketch Phone running on port ${PORT}`);
});
