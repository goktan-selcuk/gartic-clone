# 🎨 Çizgi Telefon — Gartic Phone klonu

Arkadaşlarla tarayıcıdan oynanan çizim-telefon oyunu. Biri bir cümle yazar, sıradaki onu çizer,
bir sonraki çizimi tarif eder... Turlar bitince her "albüm" adım adım açılır ve zincirin nereye
gittiği görülür.

- Kurulum gerektirmez: linki paylaş, herkes adını yazıp katılsın.
- 2–45 oyuncu. Tur sayısı = oyuncu sayısı.
- Yazma / çizim süreleri ev sahibi tarafından ayarlanır.
- Fırça, silgi, doldurma, geri al, 16 renk. Mobilde de çalışır.
- Sayfa yenilense bile oyuncu aynı odaya geri döner.
- Her şey bellekte tutulur; sunucu yeniden başlarsa odalar silinir (geçici kullanım için tasarlandı).

## Yerelde çalıştırma

```bash
npm install
npm start
# http://localhost:3000
```

`PORT` ortam değişkeni ile port değiştirilebilir.

## Yayınlama

Oyun WebSocket (Socket.IO) kullandığı için **Vercel/Netlify gibi serverless platformlarda çalışmaz**;
sürekli çalışan tek bir Node süreci gerekir. Ücretsiz/ucuz seçenekler:

### Render (en kolay, ücretsiz)

1. https://render.com → **New +** → **Web Service** → bu GitHub reposunu seç.
2. Ayarları `render.yaml` dosyasından otomatik alır (Node, `npm ci`, `node server.js`).
3. Birkaç dakikada `https://<isim>.onrender.com` adresi hazır olur.

Not: Ücretsiz planda 15 dk hareketsizlikten sonra uyur, ilk açılış ~30 sn sürer.

### Fly.io

```bash
fly launch --copy-config --yes   # fly.toml hazır
fly deploy
```

### Kendi sunucun (VPS) — Docker

```bash
docker build -t gartic-clone .
docker run -d --restart unless-stopped -p 80:3000 gartic-clone
```

veya Docker'sız:

```bash
npm ci --omit=dev
PORT=80 node server.js
```

Şirket ağında sadece iç kullanım için, kendi bilgisayarında `npm start` deyip
`http://<senin-ip>:3000` adresini paylaşman da yeterli.

## Nasıl oynanır

1. Biri **Yeni Oda Kur** der, çıkan linki/kodu diğerlerine atar.
2. Herkes gelince ev sahibi **Oyunu Başlat**'a basar.
3. Tur 1: herkes bir cümle yazar.
4. Tur 2: herkes başkasının cümlesini çizer.
5. Tur 3: herkes başkasının çizimini tarif eder... ve böyle devam eder.
6. Sonunda ev sahibi albümleri tek tek açar (→ tuşu veya boşluk).

## Yapı

- `server.js` — Express + Socket.IO, oda ve tur mantığı (bellek içi).
- `public/` — Vanilla JS istemci; `app.js` oyun akışı ve canvas çizim.
