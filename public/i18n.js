// Dil desteği: varsayılan Türkçe, seçim localStorage'da tutulur.
// Statik metinler data-i18n / data-i18n-placeholder / data-i18n-title ile, dinamikler I18N.t(key, vars) ile çevrilir.
window.I18N = (() => {
  'use strict';
  const dict = {
    en: {
      'app.title': 'Sketch Phone',
      'badge.room': 'Room',
      'badge.copy': 'Copy link',
      'badge.copyTitle': 'Copy invite link',

      'home.title1': 'Write. Draw.',
      'home.title2': 'Freeze.',
      'home.ruined': 'Drawings ruined so far:',
      'home.misunderstood': 'Sentences misunderstood:',
      'home.statsTitle': 'Since the last server restart',
      'home.counting': ' ...and counting.',
      'home.mood': "Today's mood:",
      'home.moods': [
        'Red Wedding energy', 'Season 8 ending', 'Sprint retro after a prod incident', 'Hold the door (of the meeting room)',
        'Dracarys on the backlog', 'Winter is coming, so is the deadline', 'Shame bell before standup',
        'Small council, big opinions', 'A Lannister always pays their tech debt', 'The North remembers the last outage',
        'Valar Morghulis, especially Fridays', 'Bran-level staring at the roadmap',
      ],
      'home.name': 'Your name',
      'home.namePh': 'Nickname',
      'home.create': 'Create a Room',
      'home.or': 'or',
      'home.codePh': 'CODE',
      'home.join': 'Join Room',
      'mascot.hood': ['The pencil remembers.', 'Draw... or join the army of the dead.', 'I see your drawing. I have no comment.', 'The night is dark and full of doodles.'],
      'mascot.pixel': ['PRESS START TO DRAW', 'INSERT COIN. DRAW BADLY.', 'ACHIEVEMENT: STICK FIGURE', 'GAME OVER? NO. DRAW AGAIN.'],
      'mascot.horde': ['We are many. We all draw badly.', 'Beyond the Wall, we only draw stick figures.', 'One of us dropped the pencil. Again.', 'Bring me the pencil of a thousand sketches.'],
      'tower.title': "Night's Watch",
      'oath.p1': 'Night gathers, and now my drawing begins.',
      'oath.p2': 'It shall not end until my timer runs out. I shall take no reference, hold no ruler, erase no mistakes. I shall wear no talent and win no prizes.',
      'oath.p3': 'I am the pencil in the darkness. I am the doodler on the walls. I am the shield that guards the realms of bad art, for this round and all the rounds to come.',
      'oath.close': 'And now my watch begins',
      'sponsor': 'Powered by',

      'lobby.code': 'Room code',
      'lobby.copyInvite': '🔗 Copy invite link',
      'lobby.intro': 'Your friends can join with this link or the room code. Once everyone is in, the host starts the game.',
      'lobby.players': 'Players',
      'lobby.settings': 'Settings',
      'lobby.writeTime': 'Writing time (sec)',
      'lobby.drawTime': 'Drawing time (sec)',
      'lobby.steps': 'Steps per album',
      'lobby.stepsAll': '(0 = all players)',
      'lobby.start': 'Start Game 🚀',
      'lobby.needPlayers': 'At least {n} players needed',
      'lobby.waitHost': 'Waiting for the host to start the game...',
      'lobby.leave': 'Leave room',
      'lobby.host': 'Host',
      'lobby.you': 'You',
      'lobby.kick': 'Remove from room',
      'lobby.plan': '{n} albums · {steps} rounds · up to ~{time} of play (rounds end early when everyone has submitted)',
      'lobby.secs': '{s}s',
      'lobby.mins': '{m} min',
      'lobby.hintSteps': 'Everyone starts an album, then it passes to the next {next} players in the circle. With {n} players the game lasts {rounds} rounds.',
      'lobby.hintAll': 'Everyone gets an album and it passes through every player, so the game lasts one round per player. Set a smaller number to keep big groups short.',

      'play.round': 'Round {r} / {t}',
      'play.write': 'Write a sentence',
      'play.draw': 'Draw',
      'play.describe': 'Describe',
      'play.spectating': 'Spectating',
      'play.task': '{type} · {album}',
      'album.of': "{owner}'s album",
      'play.describeThis': 'Describe this drawing:',
      'play.promptAlt': 'Drawing to describe',
      'play.textIntro': 'Write a funny or weird sentence. The next player will try to draw it!',
      'play.textPh': 'Type something...',
      'play.submit': 'Submit ✔',
      'play.drawThis': 'Draw this:',
      'play.blank': '(left blank... draw whatever you like!)',
      'tool.brush': 'Brush (B)',
      'tool.eraser': 'Eraser (E)',
      'tool.fill': 'Fill (F)',
      'tool.undo': 'Undo (Ctrl+Z)',
      'tool.clear': 'Clear',
      'play.brushSize': 'Brush size',
      'play.done': 'Done ✔',
      'play.submitted': 'Submitted ✅',
      'play.waiting': 'Waiting for the others...',
      'play.spectTitle': "You're spectating 👀",
      'play.spectText': 'You joined after the game started. You can play in the next game.',
      'play.emptyText': "You can't submit an empty text 🙂",
      'play.timeUp': 'Time is up, submitted ⏰',

      'results.loading': 'Loading album...',
      'results.index': 'Album {i} / {n}',
      'results.wrote': '{name} wrote:',
      'results.described': '{name} described:',
      'results.drew': '{name} drew:',
      'results.nothing': '(time ran out, nothing written)',
      'results.drawingAlt': 'Drawing',
      'results.stepBack': '← Step back',
      'results.step': 'Step →',
      'results.pause': '⏸ Pause',
      'results.resume': '▶ Resume',
      'results.nextAlbum': 'Next album →',
      'results.newGame': 'New Game 🔁',
      'results.hostRevealing': 'The host is revealing the albums...',
      'results.playing': 'Playing automatically…',
      'results.allDone': 'All albums revealed',
      'results.albumDone': 'Album finished',
      'results.albumDoneWait': 'Album finished, waiting for the host to continue…',
      'results.paused': 'Paused',
      'results.pausedHost': 'Paused by the host',
      'results.lobby': 'Back to lobby 🏠',
      'results.leave': 'Leave room',
      'results.confirmLobby': 'End the reveal and bring everyone back to the lobby?',

      'toast.copied': 'Copied 📋',
      'toast.copyPrompt': 'Copy:',
      'toast.enterName': 'Enter your name first 🙂',
      'toast.enterCode': 'Enter the 4-character room code',
      'toast.lost': 'Connection lost, reconnecting...',
      'toast.kicked': 'You were removed from the room',

      // Sunucudan gelen mesajlar (anahtar = İngilizce metin)
      'srv.No such room': 'No such room',
      'srv.The game has already started, you cannot join this room right now': 'The game has already started, you cannot join this room right now',
      'srv.Room is full': 'Room is full',
      'srv.No active round': 'No active round',
      'srv.You are not in this game': 'You are not in this game',
      'srv.Could not read the drawing': 'Could not read the drawing',
      'srv.Missing player id': 'Missing player id',
    },
    tr: {
      'app.title': 'Sketch Phone',
      'badge.room': 'Oda',
      'badge.copy': 'Linki kopyala',
      'badge.copyTitle': 'Davet linkini kopyala',

      'home.title1': 'Yaz. Çiz.',
      'home.title2': 'Don.',
      'home.ruined': 'Şimdiye kadar mahvedilen çizim:',
      'home.misunderstood': 'Yanlış anlaşılan cümle:',
      'home.statsTitle': 'Sunucunun son açılışından beri',
      'home.counting': ' ...ve saymaya devam.',
      'home.mood': 'Günün ruh hali:',
      'home.moods': [
        'Kızıl Düğün enerjisi', '8. sezon finali', 'Prod kazasından sonra sprint retro', 'Kapıyı tut (toplantı odasının)',
        "Backlog'a dracarys", 'Kış geliyor, deadline da', "Standup'tan önce utanç çanı",
        'Küçük konsey, büyük fikirler', 'Bir Lannister teknik borcunu her zaman öder', 'Kuzey son kesintiyi unutmaz',
        'Valar Morghulis, özellikle cuma', "Roadmap'e Bran gibi bakmak",
      ],
      'home.name': 'Adın',
      'home.namePh': 'Takma ad',
      'home.create': 'Oda Kur',
      'home.or': 'veya',
      'home.codePh': 'KOD',
      'home.join': 'Odaya Katıl',
      'mascot.hood': ['Kalem hatırlar.', 'Çiz... ya da ölüler ordusuna katıl.', 'Çizimini görüyorum. Yorum yok.', 'Gece karanlık ve karalamalarla dolu.'],
      'mascot.pixel': ['ÇİZMEK İÇİN START', 'JETON AT. KÖTÜ ÇİZ.', 'BAŞARIM: ÇÖP ADAM', 'GAME OVER? HAYIR. YİNE ÇİZ.'],
      'mascot.horde': ['Biz çoğuz. Hepimiz kötü çizeriz.', "Sur'un ötesinde sadece çöp adam çizilir.", 'Birimiz kalemi düşürdü. Yine.', 'Bana bin eskizin kalemini getirin.'],
      'tower.title': 'Gece Nöbeti',
      'oath.p1': 'Gece çöküyor ve çizimim şimdi başlıyor.',
      'oath.p2': 'Sürem dolana dek bitmeyecek. Referans almayacağım, cetvel tutmayacağım, hata silmeyeceğim. Yetenek taşımayacak, ödül kazanmayacağım.',
      'oath.p3': 'Karanlıktaki kalemim. Duvarlardaki karalamacıyım. Kötü sanatın diyarlarını koruyan kalkanım; bu tur ve gelecek tüm turlar boyunca.',
      'oath.close': 'Ve nöbetim şimdi başlıyor',
      'sponsor': 'Destekleyen',

      'lobby.code': 'Oda kodu',
      'lobby.copyInvite': '🔗 Davet linkini kopyala',
      'lobby.intro': 'Arkadaşların bu link ya da oda koduyla katılabilir. Herkes girince kurucu oyunu başlatır.',
      'lobby.players': 'Oyuncular',
      'lobby.settings': 'Ayarlar',
      'lobby.writeTime': 'Yazma süresi (sn)',
      'lobby.drawTime': 'Çizim süresi (sn)',
      'lobby.steps': 'Albüm başına adım',
      'lobby.stepsAll': '(0 = tüm oyuncular)',
      'lobby.start': 'Oyunu Başlat 🚀',
      'lobby.needPlayers': 'En az {n} oyuncu gerekli',
      'lobby.waitHost': 'Kurucunun oyunu başlatması bekleniyor...',
      'lobby.leave': 'Odadan ayrıl',
      'lobby.host': 'Kurucu',
      'lobby.you': 'Sen',
      'lobby.kick': 'Odadan çıkar',
      'lobby.plan': '{n} albüm · {steps} tur · en fazla ~{time} oyun (herkes gönderince tur erken biter)',
      'lobby.secs': '{s} sn',
      'lobby.mins': '{m} dk',
      'lobby.hintSteps': 'Herkes bir albüm açar, albüm çemberde sıradaki {next} oyuncuya geçer. {n} oyuncuyla oyun {rounds} tur sürer.',
      'lobby.hintAll': 'Herkesin albümü olur ve albüm tüm oyunculardan geçer, yani oyuncu başına bir tur sürer. Kalabalık gruplarda kısa tutmak için daha küçük bir sayı gir.',

      'play.round': 'Tur {r} / {t}',
      'play.write': 'Bir cümle yaz',
      'play.draw': 'Çiz',
      'play.describe': 'Tarif et',
      'play.spectating': 'İzleyici',
      'play.task': '{type} · {album}',
      'album.of': 'Albüm sahibi: {owner}',
      'play.describeThis': 'Bu çizimi tarif et:',
      'play.promptAlt': 'Tarif edilecek çizim',
      'play.textIntro': 'Komik ya da tuhaf bir cümle yaz. Sıradaki oyuncu onu çizmeye çalışacak!',
      'play.textPh': 'Bir şeyler yaz...',
      'play.submit': 'Gönder ✔',
      'play.drawThis': 'Bunu çiz:',
      'play.blank': '(boş bırakılmış... ne istersen çiz!)',
      'tool.brush': 'Fırça (B)',
      'tool.eraser': 'Silgi (E)',
      'tool.fill': 'Doldur (F)',
      'tool.undo': 'Geri al (Ctrl+Z)',
      'tool.clear': 'Temizle',
      'play.brushSize': 'Fırça boyu',
      'play.done': 'Bitti ✔',
      'play.submitted': 'Gönderildi ✅',
      'play.waiting': 'Diğerleri bekleniyor...',
      'play.spectTitle': 'İzliyorsun 👀',
      'play.spectText': 'Oyun başladıktan sonra katıldın. Bir sonraki oyunda oynayabilirsin.',
      'play.emptyText': 'Boş metin gönderemezsin 🙂',
      'play.timeUp': 'Süre doldu, gönderildi ⏰',

      'results.loading': 'Albüm yükleniyor...',
      'results.index': 'Albüm {i} / {n}',
      'results.wrote': '{name} yazdı:',
      'results.described': '{name} tarif etti:',
      'results.drew': '{name} çizdi:',
      'results.nothing': '(süre doldu, bir şey yazılmadı)',
      'results.drawingAlt': 'Çizim',
      'results.stepBack': '← Geri',
      'results.step': 'İleri →',
      'results.pause': '⏸ Duraklat',
      'results.resume': '▶ Devam',
      'results.nextAlbum': 'Sonraki albüm →',
      'results.newGame': 'Yeni Oyun 🔁',
      'results.hostRevealing': 'Kurucu albümleri açıyor...',
      'results.playing': 'Otomatik oynatılıyor…',
      'results.allDone': 'Tüm albümler açıldı',
      'results.albumDone': 'Albüm bitti',
      'results.albumDoneWait': 'Albüm bitti, kurucunun devam etmesi bekleniyor…',
      'results.paused': 'Duraklatıldı',
      'results.pausedHost': 'Kurucu duraklattı',
      'results.lobby': 'Lobiye dön 🏠',
      'results.leave': 'Odadan ayrıl',
      'results.confirmLobby': 'Sunumu bitirip herkesi lobiye döndürmek istiyor musun?',

      'toast.copied': 'Kopyalandı 📋',
      'toast.copyPrompt': 'Kopyala:',
      'toast.enterName': 'Önce adını yaz 🙂',
      'toast.enterCode': '4 karakterli oda kodunu gir',
      'toast.lost': 'Bağlantı koptu, yeniden bağlanılıyor...',
      'toast.kicked': 'Odadan çıkarıldın',

      'srv.No such room': 'Böyle bir oda yok',
      'srv.The game has already started, you cannot join this room right now': 'Oyun çoktan başladı, şu an bu odaya katılamazsın',
      'srv.Room is full': 'Oda dolu',
      'srv.No active round': 'Aktif tur yok',
      'srv.You are not in this game': 'Bu oyunda değilsin',
      'srv.Could not read the drawing': 'Çizim okunamadı',
      'srv.Missing player id': 'Oyuncu kimliği eksik',
    },
  };

  let lang = 'tr';
  try { const saved = localStorage.getItem('lang'); if (saved && dict[saved]) lang = saved; } catch {}

  function t(key, vars) {
    let s = dict[lang][key];
    if (s === undefined) s = dict.en[key];
    if (s === undefined) return key;
    if (typeof s !== 'string') return s;
    if (vars) for (const k of Object.keys(vars)) s = s.split(`{${k}}`).join(vars[k]);
    return s;
  }

  // Sunucudan gelen İngilizce mesajı çevir (bilinmeyen mesaj olduğu gibi kalır)
  function server(msg) {
    if (typeof msg !== 'string') return msg;
    const m = msg.match(/^At least (\d+) players needed$/);
    if (m) return t('lobby.needPlayers', { n: m[1] });
    return dict[lang]['srv.' + msg] || msg;
  }

  function apply() {
    document.documentElement.lang = lang;
    document.title = t('app.title');
    for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
    for (const el of document.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
    for (const el of document.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
    for (const el of document.querySelectorAll('[data-i18n-alt]')) el.alt = t(el.dataset.i18nAlt);
    for (const b of document.querySelectorAll('[data-lang]')) b.classList.toggle('active', b.dataset.lang === lang);
  }

  function set(l) {
    if (!dict[l]) return;
    lang = l;
    try { localStorage.setItem('lang', l); } catch {}
    apply();
    document.dispatchEvent(new CustomEvent('langchange', { detail: { lang: l } }));
  }

  document.addEventListener('DOMContentLoaded', () => {
    apply();
    for (const b of document.querySelectorAll('[data-lang]')) b.addEventListener('click', () => set(b.dataset.lang));
  });

  return { t, server, apply, set, get lang() { return lang; }, languages: Object.keys(dict) };
})();
