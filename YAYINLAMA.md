# Yayınlama: GitHub → Vercel

Yaklaşık 15 dakika. Gerekenler: GitHub hesabı, [Git](https://git-scm.com/downloads), [Node.js 20+](https://nodejs.org).

## 1. GitHub deposu

1. github.com/new → Repository name: `roomforsun` → **Public** → README **ekleme** → Create repository.
2. Paketi aç, terminali `roomforsun` klasöründe başlat. Commit ve depo adresi (`https://github.com/HErenKlc/roomforsun.git`) hazır; tek komut:

```bash
git push -u origin main
```

İlk `push`'ta GitHub giriş penceresi açılır (HErenKlc hesabıyla).

## 2. Çalıştığını yerelde gör (isteğe bağlı)

```bash
cd web
npm install
npm test        # "TAMAM" yazmalı
npm run dev     # http://localhost:5173
```

## 3. Vercel

1. vercel.com → **Sign up with GitHub** (aynı hesap).
2. **Add New → Project** → `roomforsun` → **Import**.
3. **Root Directory: `web`** (önemli) → Framework otomatik "Vite" gelir.
4. **Environment Variables** → `GEMINI_API_KEY` = Google AI Studio'dan alınan anahtar (aistudio.google.com → Get API key). Anahtarsız da çalışır; planlama notu şablon metinle çıkar.
5. **Deploy**. Link `https://roomforsun-....vercel.app` gibi olur.

Sonraki her `git push` otomatik yeniden yayınlar.

## 4. Yayından sonra kontrol

- Linki aç, Karapınar TM seçili gelsin, sayılar 10–20 saniyede dolsun.
- "Bölgeyi hesapla" → 23 trafo tablosu.
- "Planlama notu oluştur" → Gemini metni (anahtar girildiyse).
- Telefonda aç.
- Görev 3 teslimine kadar her gün bir kez aç: Open-Meteo veya Vercel sorunu varsa erken gör.

## 5. EPİAŞ ile 10 yıllık yük (sabah)

```bash
cd model
pip install "eptr2[allextras]" pandas numpy lightgbm holidays
# .env dosyası: EPTR_USERNAME=... EPTR_PASSWORD=...  (kayit.epias.com.tr, ücretsiz)
python epias_cek.py     # 2016–2025, ~10 dk
python train.py         # modeli ve geri testi yeniden üretir (web/public altına yazar)
cd ..
git add . && git commit -m "EPİAŞ 2016-2025 ile yeniden eğitim" && git push
```
