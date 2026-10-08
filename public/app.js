(() => {
  'use strict';

  // ---------- Yardımcılar ----------
  const $ = (id) => document.getElementById(id);
  const socket = io({ transports: ['websocket', 'polling'] });

  const playerId = (() => {
    let id = sessionStorage.getItem('playerId');
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now());
      sessionStorage.setItem('playerId', id);
    }
    return id;
  })();

  let state = null;           // sunucudan gelen son durum
  let albums = {};            // sonuç aşamasında gelen albümler (index -> album)
  let serverOffset = 0;       // sunucu saati - istemci saati
  let timerInterval = null;
  let autoSubmitted = false;
  let alarmed = false;
  let lastRoundKey = null;

  let toastTimer = null;
  function toast(msg, ms = 2500) {
    const el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, ms);
  }

  function showView(name) {
    for (const v of document.querySelectorAll('.view')) v.hidden = v.id !== `view-${name}`;
  }

  function initials(name) {
    return name.replace(/\s*\(.*\)\s*$/, '').trim().split(/\s+/).map((s) => s[0]).join('').slice(0, 2).toUpperCase();
  }

  function avatar(p) {
    const el = document.createElement('span');
    el.className = 'avatar';
    el.style.background = p.color || '#999';
    el.textContent = initials(p.name || '?');
    return el;
  }

  function inviteLink(code) {
    return `${location.origin}${location.pathname}?room=${code}`;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied 📋');
    } catch {
      prompt('Copy:', text);
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- Giriş ekranı süsleri ----------
  // Her maskotun kendi replikleri var
  const MASCOTS = {
    hood: ['The pencil remembers.', 'Draw... or join the army of the dead.', 'I see your drawing. I have no comment.', 'The night is dark and full of doodles.'],
    pixel: ['PRESS START TO DRAW', 'INSERT COIN. DRAW BADLY.', 'ACHIEVEMENT: STICK FIGURE', 'GAME OVER? NO. DRAW AGAIN.'],
    horde: ['We are many. We all draw badly.', 'Beyond the Wall, we only draw stick figures.', 'One of us dropped the pencil. Again.', 'Bring me the pencil of a thousand sketches.'],
  };
  (function decorateHome() {
    const snow = document.querySelector('.snow');
    if (snow) {
      for (let i = 0; i < 40; i++) {
        const f = document.createElement('span');
        f.className = 'flake';
        f.textContent = ['❄', '❅', '❆', '•'][i % 4];
        f.style.left = Math.random() * 100 + '%';
        f.style.fontSize = (8 + Math.random() * 14) + 'px';
        f.style.animationDuration = (7 + Math.random() * 9) + 's';
        f.style.animationDelay = (-Math.random() * 16) + 's';
        f.style.opacity = (0.4 + Math.random() * 0.6).toFixed(2);
        snow.appendChild(f);
      }
    }
    // Rastgele bir maskot seç
    const keys = Object.keys(MASCOTS);
    const pick = keys[Math.floor(Math.random() * keys.length)];
    for (const k of keys) $('mascot-' + k).toggleAttribute('hidden', k !== pick);
    const BUBBLES = MASCOTS[pick];
    let bi = 0;
    $('walkerBubble').textContent = BUBBLES[0];

    // Günün ruh hali
    const MOODS = [
      'Red Wedding energy', 'Season 8 ending', 'Sprint retro after a prod incident', 'Hold the door (of the meeting room)',
      'Dracarys on the backlog', 'Winter is coming, so is the deadline', 'Shame bell before standup',
      'Small council, big opinions', 'A Lannister always pays their tech debt', 'The North remembers the last outage',
      'Valar Morghulis, especially Fridays', 'Bran-level staring at the roadmap',
    ];
    $('moodText').textContent = MOODS[Math.floor(Math.random() * MOODS.length)];

    // Sayaç
    $('statsLine').onclick = () => { const b = $('statsLine'); if (!b.dataset.more) { b.dataset.more = '1'; b.append(' ...and counting.'); } };

    // Sur ve yemin
    $('towerBtn').onclick = () => { $('oath').hidden = !$('oath').hidden; };
    $('oathClose').onclick = () => { $('oath').hidden = true; };

    // Rozete tıklayınca buz çatırtısı
    const badge = document.querySelector('.sponsor');
    badge.onclick = () => {
      playIceCrack();
      badge.classList.remove('cracked'); void badge.offsetWidth; badge.classList.add('cracked');
    };
    setInterval(() => {
      if ($('view-home').hidden) return;
      const b = $('walkerBubble');
      bi = (bi + 1) % BUBBLES.length;
      b.style.animation = 'none';
      void b.offsetWidth; // animasyonu yeniden tetikle
      b.textContent = BUBBLES[bi];
      b.style.animation = '';
    }, 6000);
  })();

  // ---------- Giriş ----------
  const savedName = localStorage.getItem('name') || '';
  $('nameInput').value = savedName;
  const urlCode = new URLSearchParams(location.search).get('room') || new URLSearchParams(location.search).get('oda');
  if (urlCode) $('codeInput').value = urlCode.toUpperCase();

  function getName() {
    const name = $('nameInput').value.trim();
    if (!name) { toast('Enter your name first 🙂'); $('nameInput').focus(); return null; }
    localStorage.setItem('name', name);
    return name;
  }

  $('createBtn').onclick = () => {
    const name = getName();
    if (!name) return;
    socket.emit('room:create', { name, playerId }, (res) => {
      if (res.error) return toast(res.error);
      sessionStorage.setItem('roomCode', res.code);
      history.replaceState(null, '', `?room=${res.code}`);
    });
  };

  function join(code) {
    const name = getName();
    if (!name) return;
    if (!code || code.length < 4) { toast('Enter the 4-character room code'); return; }
    socket.emit('room:join', { code, name, playerId }, (res) => {
      if (res.error) return toast(res.error);
      sessionStorage.setItem('roomCode', res.code);
      history.replaceState(null, '', `?room=${res.code}`);
    });
  }
  $('joinBtn').onclick = () => join($('codeInput').value.trim().toUpperCase());
  $('codeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('joinBtn').click(); });
  $('nameInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') ($('codeInput').value ? $('joinBtn') : $('createBtn')).click();
  });

  // Sayfa yenilendiyse odaya otomatik geri dön
  socket.on('connect', () => {
    const code = sessionStorage.getItem('roomCode');
    const name = localStorage.getItem('name');
    if (code && name) {
      socket.emit('room:join', { code, name, playerId }, (res) => {
        if (res.error) {
          sessionStorage.removeItem('roomCode');
          if (state) { state = null; showView('home'); toast(res.error); }
        }
      });
    }
  });

  socket.on('disconnect', () => toast('Connection lost, reconnecting...', 4000));

  // Keepalive: Render'ın ücretsiz planı 15 dk HTTP isteği gelmezse servisi uyutur ve bellekteki odalar silinir.
  // Odadayken 5 dakikada bir küçük bir istek atarak uzun oyunlarda sunucuyu uyanık tutuyoruz.
  setInterval(() => {
    if (!state || !sessionStorage.getItem('roomCode')) return;
    fetch('/health', { cache: 'no-store', keepalive: true }).catch(() => {});
  }, 5 * 60 * 1000);
  socket.on('toast', (msg) => toast(msg));
  socket.on('kicked', () => {
    sessionStorage.removeItem('roomCode');
    state = null;
    showView('home');
    toast('You were removed from the room');
  });

  function leaveRoom() {
    sessionStorage.removeItem('roomCode');
    history.replaceState(null, '', location.pathname);
    location.reload();
  }
  $('leaveBtn').onclick = leaveRoom;

  // ---------- Durum ----------
  socket.on('room:state', (s) => {
    const prevPhase = state?.phase;
    state = s;
    serverOffset = s.serverNow - Date.now();
    if (s.phase !== 'results') albums = {};
    render(prevPhase);
  });

  socket.on('results:album', (album) => {
    albums[album.index] = album;
    if (state && state.phase === 'results') renderResults();
  });

  socket.on('results:reveal', (reveal) => {
    if (!state) return;
    state.reveal = reveal;
    renderResults();
  });

  function render(prevPhase) {
    const s = state;
    $('roomBadge').hidden = false;
    $('badgeCode').textContent = s.code;

    if (s.phase === 'lobby') { showView('lobby'); renderLobby(); }
    else if (s.phase === 'playing') { showView('play'); renderPlay(prevPhase); }
    else if (s.phase === 'results') {
      if (prevPhase !== 'results') { $('albumEntries').innerHTML = ''; delete $('albumEntries').dataset.chain; }
      showView('results'); renderResults(); stopTimer();
    }
  }

  $('badgeCopy').onclick = () => copyText(inviteLink(state.code));
  $('copyLinkBtn').onclick = () => copyText(inviteLink(state.code));

  // ---------- Lobi ----------
  function renderLobby() {
    const s = state;
    const isHost = s.hostId === s.you;
    $('lobbyCode').textContent = s.code;
    const list = $('lobbyPlayers');
    list.innerHTML = '';
    for (const p of s.players) {
      const li = document.createElement('li');
      li.appendChild(avatar(p));
      const name = document.createElement('span');
      name.textContent = p.name;
      li.appendChild(name);
      if (p.id === s.hostId) { const t = document.createElement('span'); t.className = 'tag'; t.textContent = 'Host'; li.appendChild(t); }
      else if (p.id === s.you) { const t = document.createElement('span'); t.className = 'tag you'; t.textContent = 'You'; li.appendChild(t); }
      else if (isHost) {
        const k = document.createElement('button'); k.className = 'kick'; k.title = 'Remove from room'; k.textContent = '✕';
        k.onclick = () => socket.emit('player:kick', { playerId: p.id });
        li.appendChild(k);
      }
      list.appendChild(li);
    }
    $('playerCount').textContent = `(${s.players.length})`;
    const n = s.players.length;
    const steps = Math.max(s.minPlayers, Math.min(s.settings.steps > 0 ? s.settings.steps : n, Math.max(n, s.minPlayers)));
    // Tahmini süre: turlar yazma/çizim diye sırayla gider, her tur en fazla ayarlanan süre kadar sürer
    const textRounds = Math.ceil(steps / 2), drawRounds = Math.floor(steps / 2);
    const maxSecs = textRounds * s.settings.writeTime + drawRounds * s.settings.drawTime;
    const fmtMin = (secs) => secs < 90 ? `${secs}s` : `${Math.round(secs / 60)} min`;
    $('lobbyPlan').textContent = n >= s.minPlayers
      ? `${n} albums · ${steps} rounds · up to ~${fmtMin(maxSecs)} of play (rounds end early when everyone has submitted)`
      : '';
    $('hostPanel').hidden = !isHost;
    $('waitHost').hidden = isHost;
    if (isHost) {
      if (document.activeElement !== $('writeTime')) $('writeTime').value = s.settings.writeTime;
      if (document.activeElement !== $('drawTime')) $('drawTime').value = s.settings.drawTime;
      if (document.activeElement !== $('stepsInput')) $('stepsInput').value = s.settings.steps || 0;
      $('stepsHint').textContent = s.settings.steps > 0
        ? `Everyone starts an album, then it passes to the next ${s.settings.steps - 1} players in the circle. With ${n} players the game lasts ${Math.min(s.settings.steps, Math.max(n, 2))} rounds.`
        : 'Everyone gets an album and it passes through every player, so the game lasts one round per player. Set a smaller number to keep big groups short.';
      $('startBtn').disabled = s.players.length < s.minPlayers;
      $('startBtn').textContent = s.players.length < s.minPlayers
        ? `At least ${s.minPlayers} players needed`
        : 'Start Game 🚀';
    }
  }

  function pushSettings() {
    socket.emit('room:settings', { writeTime: $('writeTime').value, drawTime: $('drawTime').value, steps: $('stepsInput').value });
  }
  $('writeTime').addEventListener('change', pushSettings);
  $('drawTime').addEventListener('change', pushSettings);
  $('stepsInput').addEventListener('change', pushSettings);
  $('startBtn').onclick = () => socket.emit('game:start');

  // ---------- Oyun ----------
  function renderPlay(prevPhase) {
    const s = state;
    const t = s.task;
    const roundKey = `${s.code}:${s.round}`;
    const newRound = roundKey !== lastRoundKey;
    lastRoundKey = roundKey;

    const typeLabel = s.round === 0 ? 'Write a sentence' : t.type === 'draw' ? 'Draw' : 'Describe';
    $('roundLabel').textContent = `Round ${s.round + 1} / ${s.totalRounds}`;
    $('taskLabel').textContent = t.spectator ? 'Spectating' : `${typeLabel} · ${t.chainOwner}'s album`;

    $('textPhase').hidden = true;
    $('drawPhase').hidden = true;
    $('waitPhase').hidden = true;
    $('spectatorPhase').hidden = true;

    if (t.spectator) { $('spectatorPhase').hidden = false; startTimer(); return; }

    if (t.submitted) {
      $('waitPhase').hidden = false;
      renderWaitList($('waitPlayers'));
      stopTimer();
      return;
    }

    if (newRound) { autoSubmitted = false; alarmed = false; }

    // t.prev yalnızca tur başında / yeniden katılımda gelir; ara güncellemelerde mevcut istem korunur
    const hasPrevInfo = t.prev !== undefined;
    if (t.type === 'text') {
      $('textPhase').hidden = false;
      if (hasPrevInfo) {
        const hasImg = t.prev && t.prev.type === 'draw';
        $('textPromptWrap').hidden = !hasImg;
        $('textIntro').hidden = hasImg;
        if (hasImg) $('textPromptImg').src = t.prev.content || blankImage();
      }
      if (newRound) { $('textInput').value = ''; updateCount(); setTimeout(() => $('textInput').focus(), 50); }
    } else {
      $('drawPhase').hidden = false;
      if (hasPrevInfo) {
        $('drawPromptText').textContent = (t.prev && t.prev.content) ? t.prev.content : '(left blank... draw whatever you like!)';
      }
      if (newRound) { resetCanvas(); }
      fitCanvas();
    }
    startTimer();
  }

  // Oyundaki oyuncular ve bu turdaki gönderim durumları
  function renderWaitList(list) {
    const s = state;
    list.innerHTML = '';
    for (const p of s.players.filter((x) => x.inGame)) {
      const li = document.createElement('li');
      if (!p.connected) li.classList.add('offline');
      if (s.submitted.includes(p.id)) li.classList.add('done');
      li.appendChild(avatar(p));
      const n = document.createElement('span'); n.textContent = p.name; li.appendChild(n);
      const st = document.createElement('span'); st.className = 'tag'; st.style.background = s.submitted.includes(p.id) ? '#3cb44b' : '#bbb';
      st.textContent = s.submitted.includes(p.id) ? '✔' : '…'; li.appendChild(st);
      list.appendChild(li);
    }
  }

  function blankImage() {
    const c = document.createElement('canvas'); c.width = 800; c.height = 600;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 800, 600);
    ctx.fillStyle = '#999'; ctx.font = '28px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('(no drawing submitted)', 400, 300);
    return c.toDataURL('image/png');
  }

  function updateCount() { $('textCount').textContent = `${$('textInput').value.length}/200`; }
  $('textInput').addEventListener('input', updateCount);
  $('textInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitText(); }
  });

  function submitText(force = false) {
    const text = $('textInput').value.trim();
    if (!text && !force) { toast("You can't submit an empty text 🙂"); return; }
    $('textSubmit').disabled = true;
    socket.emit('round:submit', { content: text }, (res) => {
      $('textSubmit').disabled = false;
      if (res.error) toast(res.error);
    });
  }
  $('textSubmit').onclick = () => submitText();

  function submitDraw() {
    $('drawSubmit').disabled = true;
    const data = canvas.toDataURL('image/png');
    const strokes = { w: canvas.width, h: canvas.height, ms: timeline(ops).ms, ops };
    socket.emit('round:submit', { content: data, strokes }, (res) => {
      $('drawSubmit').disabled = false;
      if (res.error) toast(res.error);
    });
  }
  $('drawSubmit').onclick = submitDraw;

  function autoSubmit() {
    if (autoSubmitted || !state || state.phase !== 'playing' || state.task.spectator || state.task.submitted) return;
    autoSubmitted = true;
    if (state.task.type === 'text') submitText(true); else submitDraw();
    toast('Time is up, submitted ⏰');
  }

  // ---------- Zamanlayıcı ----------
  function startTimer() {
    stopTimer();
    const tick = () => {
      if (!state || !state.roundEndsAt) return;
      const total = (state.task.type === 'draw' ? state.settings.drawTime : state.settings.writeTime) * 1000;
      const remain = Math.max(0, state.roundEndsAt - (Date.now() + serverOffset));
      const pct = Math.max(0, Math.min(100, (remain / total) * 100));
      $('timerFill').style.width = pct + '%';
      $('timerFill').classList.toggle('warn', remain < 10000);
      $('timerText').textContent = Math.ceil(remain / 1000) + 's';
      const urgent = remain > 0 && remain <= 5000;
      $('timerText').classList.toggle('urgent', urgent);
      if (urgent && !alarmed && !state.task.spectator && !state.task.submitted) { alarmed = true; playAlarm(); }
      if (remain <= 0) autoSubmit();
    };
    tick();
    timerInterval = setInterval(tick, 500);
  }
  function stopTimer() { clearInterval(timerInterval); timerInterval = null; $('timerText').classList.remove('urgent'); }

  socket.on('stats', (st) => {
    $('statDrawings').textContent = st.drawings.toLocaleString('en-US');
    $('statSentences').textContent = st.sentences.toLocaleString('en-US');
  });

  // Buz sesi: ince, kısa bir "tink" ve yüksek frekanslı hafif bir çıtırtı (dosya yok, Web Audio)
  function playIceCrack() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const ctx = audioCtx, t0 = ctx.currentTime;
      // 1) Cam gibi iki ince tını
      for (const [freq, delay, amp] of [[2637, 0, 0.12], [3520, 0.06, 0.07]]) {
        const osc = ctx.createOscillator(); const g = ctx.createGain();
        osc.type = 'sine'; osc.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t0 + delay);
        g.gain.exponentialRampToValueAtTime(amp, t0 + delay + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + delay + 0.35);
        osc.connect(g).connect(ctx.destination); osc.start(t0 + delay); osc.stop(t0 + delay + 0.4);
      }
      // 2) Çok hafif, tiz çıtırtı
      const dur = 0.3;
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
      const d = buf.getChannelData(0);
      let next = 0.01;
      for (let i = 0; i < d.length; i++) {
        const t = i / ctx.sampleRate;
        if (t >= next) {
          next = t + 0.015 + Math.random() * 0.05;
          const len = Math.floor(ctx.sampleRate * 0.002);
          for (let k = 0; k < len && i + k < d.length; k++) d[i + k] += (Math.random() * 2 - 1) * (1 - k / len);
        }
      }
      const src = ctx.createBufferSource(); src.buffer = buf;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5000;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.08, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(hp).connect(g).connect(ctx.destination); src.start(t0);
    } catch { /* ses yoksa geç */ }
    if (navigator.vibrate) navigator.vibrate(20);
  }

  // Son 5 saniyede ufak bir bip (Web Audio; tarayıcı etkileşim sonrası ses çalmaya izin verir)
  let audioCtx = null;
  function playAlarm() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const t0 = audioCtx.currentTime;
      for (let i = 0; i < 3; i++) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = i === 2 ? 1100 : 880;
        gain.gain.setValueAtTime(0.0001, t0 + i * 0.22);
        gain.gain.exponentialRampToValueAtTime(0.25, t0 + i * 0.22 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.22 + 0.16);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(t0 + i * 0.22);
        osc.stop(t0 + i * 0.22 + 0.18);
      }
    } catch { /* ses desteklenmiyorsa sessizce geç */ }
    if (navigator.vibrate) navigator.vibrate([120, 80, 120]);
  }

  // ---------- Çizim ----------
  const canvas = $('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const PALETTE = ['#000000', '#7f7f7f', '#ffffff', '#c1272d', '#ed1c24', '#f7941d', '#fff200', '#8dc63f',
    '#00a651', '#00aeef', '#0072bc', '#2e3192', '#662d91', '#ec008c', '#f49ac1', '#a0522d'];
  let color = '#000000';
  let size = 6;
  let tool = 'brush';
  let drawing = false;
  let last = null;
  const undoStack = [];
  // Fırça hareketleri kaydı: sonuç ekranında çizim, çizenin hareketleriyle yeniden oynatılır
  let ops = [];          // { t:'d', tool:'b'|'e', c, s, ts, d, p:[x,y,...] } | { t:'f', c, x, y, ts } | { t:'c', ts }
  let drawStart = 0;
  let curOp = null;
  function recTime() { if (!drawStart) drawStart = performance.now(); return Math.round(performance.now() - drawStart); }

  const pal = $('palette');
  for (const c of PALETTE) {
    const sw = document.createElement('button');
    sw.className = 'swatch' + (c === color ? ' active' : '');
    sw.style.background = c;
    sw.title = c;
    sw.onclick = () => {
      color = c;
      for (const x of pal.children) x.classList.toggle('active', x === sw);
      if (tool === 'eraser') setTool('brush');
      updateSizePreview();
    };
    pal.appendChild(sw);
  }

  function setTool(t) {
    tool = t;
    for (const b of document.querySelectorAll('.tool[data-tool]')) b.classList.toggle('active', b.dataset.tool === t);
    canvas.style.cursor = t === 'fill' ? 'cell' : 'crosshair';
  }
  for (const b of document.querySelectorAll('.tool[data-tool]')) b.onclick = () => setTool(b.dataset.tool);

  $('sizeInput').addEventListener('input', () => { size = +$('sizeInput').value; updateSizePreview(); });
  function updateSizePreview() {
    const p = $('sizePreview');
    const d = Math.max(4, Math.min(28, size));
    p.style.width = d + 'px'; p.style.height = d + 'px';
    p.style.background = tool === 'eraser' ? '#ddd' : color;
  }
  updateSizePreview();

  function snapshot() {
    undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (undoStack.length > 30) undoStack.shift();
  }
  $('undoBtn').onclick = () => {
    const img = undoStack.pop();
    if (img) { ctx.putImageData(img, 0, 0); ops.pop(); } // her snapshot bir op'a karşılık gelir
  };
  $('clearBtn').onclick = () => { snapshot(); fillWhite(); ops.push({ t: 'c', ts: recTime() }); };

  function fillWhite() {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  function resetCanvas() {
    undoStack.length = 0;
    ops = []; drawStart = 0; curOp = null;
    fillWhite();
    setTool('brush');
  }
  function fitCanvas() { /* CSS ile ölçekleniyor; burada ek iş yok */ }
  fillWhite();

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (canvas.width / r.width),
      y: (e.clientY - r.top) * (canvas.height / r.height),
    };
  }

  function strokeTo(p) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = tool === 'eraser' ? size * 2 : size;
    ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last = p;
    if (curOp) {
      const n = curOp.p.length;
      const dx = p.x - curOp.p[n - 2], dy = p.y - curOp.p[n - 1];
      if (dx * dx + dy * dy >= 2.25) curOp.p.push(Math.round(p.x), Math.round(p.y)); // 1.5px'ten yakın noktaları atla
      curOp.d = recTime() - curOp.ts;
    }
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const p = pos(e);
    snapshot();
    if (tool === 'fill') {
      ops.push({ t: 'f', c: color, x: Math.floor(p.x), y: Math.floor(p.y), ts: recTime() });
      floodFill(Math.floor(p.x), Math.floor(p.y), color);
      return;
    }
    drawing = true;
    last = p;
    curOp = { t: 'd', tool: tool === 'eraser' ? 'e' : 'b', c: color, s: size, ts: recTime(), d: 0, p: [Math.round(p.x), Math.round(p.y)] };
    ops.push(curOp);
    // Tek tık = nokta
    ctx.fillStyle = tool === 'eraser' ? '#ffffff' : color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, (tool === 'eraser' ? size * 2 : size) / 2, 0, Math.PI * 2);
    ctx.fill();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    e.preventDefault();
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of events) strokeTo(pos(ev));
  });
  const stop = (e) => {
    if (!drawing) return;
    drawing = false; last = null;
    if (curOp) { curOp.d = recTime() - curOp.ts; curOp = null; }
    try { canvas.releasePointerCapture(e.pointerId); } catch {}
  };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);
  canvas.addEventListener('pointerleave', (e) => { if (drawing && e.pointerType === 'mouse' && !canvas.hasPointerCapture(e.pointerId)) stop(e); });

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function floodFill(sx, sy, hex) { floodFillOn(ctx, canvas.width, canvas.height, sx, sy, hex); }
  function floodFillOn(ctx, w, h, sx, sy, hex) {
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) return;
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const [r, g, b] = hexToRgb(hex);
    const idx = (sy * w + sx) * 4;
    const tr = d[idx], tg = d[idx + 1], tb = d[idx + 2];
    if (tr === r && tg === g && tb === b) return;
    const tol = 40;
    const match = (i) => Math.abs(d[i] - tr) <= tol && Math.abs(d[i + 1] - tg) <= tol && Math.abs(d[i + 2] - tb) <= tol;
    const stack = [sx + sy * w];
    const seen = new Uint8Array(w * h);
    while (stack.length) {
      const p = stack.pop();
      if (seen[p]) continue;
      const i = p * 4;
      if (!match(i)) continue;
      seen[p] = 1;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
      const x = p % w;
      if (x > 0) stack.push(p - 1);
      if (x < w - 1) stack.push(p + 1);
      if (p >= w) stack.push(p - w);
      if (p < w * (h - 1)) stack.push(p + w);
    }
    ctx.putImageData(img, 0, 0);
  }

  // Klavye kısayolları
  document.addEventListener('keydown', (e) => {
    if (!state || state.phase !== 'playing' || $('drawPhase').hidden) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); $('undoBtn').click(); }
    if (e.key === 'b') setTool('brush');
    if (e.key === 'e') setTool('eraser');
    if (e.key === 'f') setTool('fill');
  });

  // ---------- Yeniden oynatım ----------
  // Sanal zaman çizelgesi: uzun duraksamalar 250 ms'ye, tek bir fırça darbesi 2.5 sn'ye kısaltılır
  function timeline(ops) {
    let v = 0, prevEnd = 0;
    const items = [];
    for (const op of ops) {
      const gap = Math.min(250, Math.max(0, (op.ts || 0) - prevEnd));
      const dur = op.t === 'd' ? Math.max(60, Math.min(2500, op.d || 0)) : 150;
      const vs = v + gap, ve = vs + dur;
      items.push({ op, vs, ve });
      v = ve; prevEnd = (op.ts || 0) + (op.t === 'd' ? (op.d || 0) : 0);
    }
    return { items, ms: v };
  }

  // strokes'u durationMs içinde, sunucu saatine göre startedAt anından başlayarak canvas'a çizer.
  // Geç katılan biri için geçen süre büyük olur ve çizim anında tamamlanır.
  function startReplay(cv, strokes, durationMs, startedAt) {
    const c = cv.getContext('2d', { willReadFrequently: true });
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, cv.width, cv.height);
    const { items, ms } = timeline(strokes.ops || []);
    const scale = ms > 0 ? Math.max(0.01, durationMs) / ms : 1;
    const token = String(Math.random());
    cv.dataset.replay = token;
    let i = 0, pi = 0;
    const applyPoints = (op, upto) => {
      const w = op.tool === 'e' ? op.s * 2 : op.s, col = op.tool === 'e' ? '#ffffff' : op.c;
      const n = op.p.length / 2;
      upto = Math.min(upto, n);
      if (pi === 0 && upto > 0) {
        c.fillStyle = col; c.beginPath(); c.arc(op.p[0], op.p[1], w / 2, 0, Math.PI * 2); c.fill();
        pi = 1;
      }
      if (upto > pi) {
        c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = w; c.strokeStyle = col;
        c.beginPath(); c.moveTo(op.p[(pi - 1) * 2], op.p[(pi - 1) * 2 + 1]);
        for (let k = pi; k < upto; k++) c.lineTo(op.p[k * 2], op.p[k * 2 + 1]);
        c.stroke();
        pi = upto;
      }
    };
    const applyOp = (op) => {
      if (op.t === 'd') applyPoints(op, op.p.length / 2);
      else if (op.t === 'f') floodFillOn(c, cv.width, cv.height, op.x, op.y, op.c);
      else if (op.t === 'c') { c.fillStyle = '#ffffff'; c.fillRect(0, 0, cv.width, cv.height); }
    };
    const frame = () => {
      if (cv.dataset.replay !== token) return;
      const v = (Date.now() + serverOffset - startedAt) / scale;
      while (i < items.length) {
        const it = items[i];
        if (it.ve <= v) { applyOp(it.op); i++; pi = 0; continue; }
        if (it.vs < v && it.op.t === 'd') {
          const n = it.op.p.length / 2;
          applyPoints(it.op, Math.max(1, Math.floor(((v - it.vs) / (it.ve - it.vs)) * n)));
        }
        break;
      }
      if (i < items.length) requestAnimationFrame(frame);
    };
    frame();
  }

  // ---------- Sonuçlar ----------
  function renderResults() {
    const s = state;
    const isHost = s.hostId === s.you;
    const r = s.reveal;
    const chain = albums[r.chain];
    $('resultsHostNav').hidden = !isHost;
    $('resultsWait').hidden = isHost;
    if (!chain) { $('albumTitle').textContent = 'Loading album...'; return; }
    $('albumTitle').textContent = `${chain.owner}'s album`;
    $('albumIndex').textContent = `Album ${r.chain + 1} / ${s.albumCount}`;

    const wrap = $('albumEntries');
    const key = `${r.chain}`;
    if (wrap.dataset.chain !== key) { wrap.innerHTML = ''; wrap.dataset.chain = key; }
    // Eksik kartları ekle, fazla olanları kaldır
    while (wrap.children.length > r.step) wrap.lastChild.remove();
    const totalSteps = s.totalRounds || chain.steps.length;
    const verb = (e, i) => e.type === 'text' ? (i === 0 ? 'wrote' : 'described') : 'drew';
    const content = (e) => {
      if (e.type === 'text') {
        const t = document.createElement('div');
        t.className = 'text' + (e.content ? '' : ' empty');
        t.textContent = e.content || '(time ran out, nothing written)';
        return t;
      }
      if (e.strokes && e.strokes.ops && e.strokes.ops.length) {
        const cv = document.createElement('canvas');
        cv.width = e.strokes.w || 800; cv.height = e.strokes.h || 600;
        cv.className = 'replay';
        return cv;
      }
      const img = document.createElement('img');
      img.src = e.content || blankImage();
      img.alt = 'Drawing';
      return img;
    };
    for (let i = wrap.children.length; i < r.step; i++) {
      const e = chain.steps[i];
      if (!e) break;
      const card = document.createElement('div');
      card.className = 'entry';
      const who = document.createElement('div');
      who.className = 'who';
      who.appendChild(avatar({ name: e.author, color: e.authorColor }));
      const nm = document.createElement('span'); nm.textContent = `${e.author} ${verb(e, i)}:`; who.appendChild(nm);
      const st = document.createElement('span'); st.className = 'step'; st.textContent = `${i + 1}/${totalSteps}`;
      who.appendChild(st);
      card.appendChild(who);
      const body = content(e);
      card.appendChild(body);
      if (body.tagName === 'CANVAS') {
        // Sadece şu an açılan adım canlı oynatılır; önceki adımlar anında tamamlanmış gösterilir
        const live = i === r.step - 1 && r.replayMs > 0;
        startReplay(body, e.strokes, live ? r.replayMs : 1, live ? r.stepStartedAt : 0);
      }
      wrap.appendChild(card);
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    const albumDone = r.step >= totalSteps;
    const atEnd = r.chain === s.albumCount - 1 && albumDone;
    $('prevBtn').disabled = r.chain === 0 && r.step <= 1;
    $('nextBtn').hidden = albumDone;
    $('autoBtn').hidden = albumDone;
    $('autoBtn').textContent = r.auto ? '⏸ Pause' : '▶ Resume';
    $('nextAlbumBtn').hidden = !(albumDone && !atEnd);
    $('restartBtn').hidden = !atEnd;
    $('resultsStatus').textContent = r.auto ? 'Playing automatically…'
      : atEnd ? 'All albums revealed'
      : albumDone ? (isHost ? 'Album finished' : 'Album finished, waiting for the host to continue…')
      : (isHost ? 'Paused' : 'Paused by the host');
    // Host albümlerin sonunu beklemeden herkesi lobiye döndürebilir
    $('lobbyBtn').hidden = !isHost || atEnd;
  }
  $('nextBtn').onclick = () => socket.emit('results:nav', { dir: 'next' });
  $('prevBtn').onclick = () => socket.emit('results:nav', { dir: 'prev' });
  $('restartBtn').onclick = () => socket.emit('game:restart');
  $('nextAlbumBtn').onclick = () => socket.emit('results:nav', { dir: 'next' });
  $('autoBtn').onclick = () => { if (state && state.reveal) socket.emit('results:auto', { on: !state.reveal.auto }); };
  $('lobbyBtn').onclick = () => {
    if (confirm('End the reveal and bring everyone back to the lobby?')) socket.emit('game:restart');
  };
  $('leaveBtn2').onclick = leaveRoom;
  document.addEventListener('keydown', (e) => {
    if (!state || state.phase !== 'results' || state.hostId !== state.you) return;
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); $('nextBtn').hidden ? null : $('nextBtn').click(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); $('prevBtn').click(); }
  });

  showView('home');
})();
