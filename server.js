'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const GRACE_MS = 3000;            // süre bitince istemcilerin son gönderimi için tanınan pay
const ROOM_IDLE_MS = 20 * 60 * 1000; // kimse kalmayınca odanın silinme süresi
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 16;

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.send('ok'));

const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 5e6 });

/** @type {Map<string, Room>} */
const rooms = new Map();

const COLORS = [
  '#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4',
  '#f032e6', '#bfef45', '#fabed4', '#469990', '#dcbeff', '#9a6324',
  '#800000', '#aaffc3', '#808000', '#000075',
];

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

function createRoom(hostId) {
  const room = {
    code: genCode(),
    hostId,
    players: new Map(), // playerId -> { id, name, color, socketId, connected }
    phase: 'lobby',     // lobby | playing | results
    settings: { writeTime: 60, drawTime: 90 },
    round: 0,
    totalRounds: 0,
    order: [],          // oyuna başlayan oyuncuların id sırası
    chains: [],         // { ownerId, entries: [{ type, authorId, content }] }
    submissions: new Map(),
    roundEndsAt: 0,
    timer: null,
    reveal: { chain: 0, step: 1 },
    emptySince: Date.now(),
  };
  rooms.set(room.code, room);
  return room;
}

function connectedPlayers(room) {
  return [...room.players.values()].filter((p) => p.connected);
}

function pickColor(room) {
  const used = new Set([...room.players.values()].map((p) => p.color));
  return COLORS.find((c) => !used.has(c)) || COLORS[room.players.size % COLORS.length];
}

function roundType(round) {
  return round % 2 === 0 ? 'text' : 'draw';
}

function chainIndexFor(room, playerId, round) {
  const i = room.order.indexOf(playerId);
  if (i < 0) return -1;
  return (i + round) % room.order.length;
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

function serializeChains(room) {
  return room.chains.map((c) => ({
    owner: nameOf(room, c.ownerId),
    ownerColor: room.players.get(c.ownerId)?.color,
    entries: c.entries.map((e) => ({
      type: e.type,
      author: nameOf(room, e.authorId),
      authorColor: room.players.get(e.authorId)?.color,
      content: e.content,
    })),
  }));
}

function stateFor(room, playerId, { withChains = false } = {}) {
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
    const ci = chainIndexFor(room, playerId, room.round);
    if (ci < 0) {
      base.task = { spectator: true };
    } else {
      const chain = room.chains[ci];
      const prev = chain.entries[chain.entries.length - 1] || null;
      base.task = {
        spectator: false,
        type: roundType(room.round),
        chainOwner: nameOf(room, chain.ownerId),
        prev: prev
          ? { type: prev.type, author: nameOf(room, prev.authorId), content: prev.content }
          : null,
        submitted: room.submissions.has(playerId),
      };
    }
  }

  if (room.phase === 'results') {
    base.reveal = room.reveal;
    if (withChains) base.chains = serializeChains(room);
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
  room.totalRounds = n;
  room.chains = room.order.map((id) => ({ ownerId: id, entries: [] }));
  room.round = 0;
  room.phase = 'playing';
  beginRound(room);
}

function beginRound(room) {
  room.submissions = new Map();
  const type = roundType(room.round);
  const secs = type === 'draw' ? room.settings.drawTime : room.settings.writeTime;
  room.roundEndsAt = Date.now() + secs * 1000;
  clearTimeout(room.timer);
  room.timer = setTimeout(() => finishRound(room), secs * 1000 + GRACE_MS);
  broadcast(room);
}

function finishRound(room) {
  if (room.phase !== 'playing') return;
  clearTimeout(room.timer);
  room.timer = null;
  const type = roundType(room.round);
  for (const pid of room.order) {
    const ci = chainIndexFor(room, pid, room.round);
    let content = room.submissions.get(pid);
    if (content == null) content = type === 'text' ? '' : null;
    room.chains[ci].entries.push({ type, authorId: pid, content });
  }
  room.round++;
  if (room.round >= room.totalRounds) {
    room.phase = 'results';
    room.roundEndsAt = 0;
    room.submissions = new Map();
    room.reveal = { chain: 0, step: 1 };
    broadcast(room, { withChains: true });
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
  const getRoom = () => (socket.data.code ? rooms.get(socket.data.code) : null);
  const isHost = (room) => room && room.hostId === socket.data.playerId;

  socket.on('room:create', ({ name, playerId } = {}, cb = () => {}) => {
    if (!playerId) return cb({ error: 'Missing player id' });
    const room = createRoom(playerId);
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
      if (name) existing.name = name;
    } else {
      if (room.phase !== 'lobby') return cb({ error: 'The game has already started, you cannot join this room right now' });
      if (room.players.size >= MAX_PLAYERS) return cb({ error: 'Room is full' });
      room.players.set(playerId, {
        id: playerId,
        name,
        color: pickColor(room),
        socketId: socket.id,
        connected: true,
      });
    }
    socket.data.code = room.code;
    socket.data.playerId = playerId;
    socket.join(room.code);
    transferHostIfNeeded(room);
    touchEmpty(room);
    cb({ ok: true, code: room.code });
    // Katılan kişiye tam durum (sonuç aşamasındaysa zincirlerle birlikte), diğerlerine güncelleme
    io.to(socket.id).emit('room:state', stateFor(room, playerId, { withChains: true }));
    for (const p of room.players.values()) {
      if (p.socketId && p.id !== playerId) io.to(p.socketId).emit('room:state', stateFor(room, p.id));
    }
  }

  socket.on('room:settings', (settings = {}) => {
    const room = getRoom();
    if (!isHost(room) || room.phase !== 'lobby') return;
    room.settings.writeTime = clampInt(settings.writeTime, 15, 300, room.settings.writeTime);
    room.settings.drawTime = clampInt(settings.drawTime, 20, 600, room.settings.drawTime);
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

  socket.on('round:submit', ({ content } = {}, cb = () => {}) => {
    const room = getRoom();
    if (!room || room.phase !== 'playing') return cb({ error: 'No active round' });
    const pid = socket.data.playerId;
    if (!room.order.includes(pid)) return cb({ error: 'You are not in this game' });
    if (room.submissions.has(pid)) return cb({ ok: true });
    const type = roundType(room.round);
    const clean = validateContent(type, content);
    if (type === 'draw' && clean == null) return cb({ error: 'Could not read the drawing' });
    room.submissions.set(pid, clean);
    cb({ ok: true });
    broadcast(room);
    maybeFinishEarly(room);
  });

  socket.on('results:nav', ({ dir } = {}) => {
    const room = getRoom();
    if (!isHost(room) || room.phase !== 'results') return;
    const r = room.reveal;
    const len = room.chains[r.chain]?.entries.length || 0;
    if (dir === 'next') {
      if (r.step < len) r.step++;
      else if (r.chain < room.chains.length - 1) { r.chain++; r.step = 1; }
    } else if (dir === 'prev') {
      if (r.step > 1) r.step--;
      else if (r.chain > 0) { r.chain--; r.step = room.chains[r.chain].entries.length; }
    }
    io.to(room.code).emit('results:reveal', r);
  });

  socket.on('game:restart', () => {
    const room = getRoom();
    if (!isHost(room) || room.phase === 'playing') return;
    clearTimeout(room.timer);
    room.timer = null;
    // Ayrılanları temizle
    for (const [id, p] of room.players) if (!p.connected) room.players.delete(id);
    room.phase = 'lobby';
    room.round = 0;
    room.totalRounds = 0;
    room.order = [];
    room.chains = [];
    room.submissions = new Map();
    room.roundEndsAt = 0;
    room.reveal = { chain: 0, step: 1 };
    transferHostIfNeeded(room);
    broadcast(room);
  });

  socket.on('player:kick', ({ playerId } = {}) => {
    const room = getRoom();
    if (!isHost(room) || room.phase !== 'lobby') return;
    const target = room.players.get(playerId);
    if (!target || playerId === room.hostId) return;
    room.players.delete(playerId);
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
      rooms.delete(code);
    }
  }
}, 60 * 1000);

server.listen(PORT, () => {
  console.log(`Sketch Phone running on port ${PORT}`);
});
