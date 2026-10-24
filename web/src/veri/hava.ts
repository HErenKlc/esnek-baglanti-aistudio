// Open-Meteo Historical Weather API (ERA5 tabanlı) — tarayıcıdan canlı, gerçek veri.
// Lisans: CC BY 4.0, ticari olmayan ücretsiz kullanım. Atıf: Open-Meteo.com, ERA5 (Copernicus).

// Hava 20 yıl (2006–2025): P90 bir kuyruk değeri; 10 yılda neredeyse "en kötü tek yıl"a eşit ve gürültülü.
// Yük 10 yıl (EPİAŞ 2016+). İkisi bağımsız girdiler; dönemlerin aynı olması gerekmez.
// Open-Meteo ücretsiz sürümünde istek ağırlığı ≈ değişken/10 × gün/14; 3 değişken × 20 yıl ≈ 157 (dakikada 600 sınırı).
export const HAVA_YILLARI = Array.from({ length: 20 }, (_, i) => 2006 + i);
export const SAAT_YIL = 8760;
export const HAVA_KAYNAK =
  "Open-Meteo Historical Weather API (ERA5), CC BY 4.0. Copernicus Climate Change Service bilgisi kullanılmıştır.";

export interface HavaYili {
  yil: number;
  poa: Float32Array; // eğik yüzey ışınımı, W/m²
  sicaklik: Float32Array; // °C
  ruzgar: Float32Array; // m/s (10 m)
}

export interface HavaSonucu {
  yillar: HavaYili[];
  eksikOran: number; // doldurulan eksik saat oranı
  egikKaynak: "GTI" | "GHI";
}

// Sonucu değil, SÖZÜ (Promise) saklıyoruz. Sayfa açılışında yenile() birkaç yerden
// eşzamanlı çağrılıyor; sonucu saklasaydık hepsi boş önbellek görüp aynı 1,6 MB'lık
// dosyayı ayrı ayrı indirirdi (DevTools'ta iki kez göründüğü gibi). Söz saklanınca
// ilk çağrı indirir, diğerleri onu bekler.
const onbellek = new Map<string, Promise<HavaSonucu>>();

/**
 * Önceden çekilmiş hava dosyasını çözer (model/hava_onbellek.py üretir).
 * Zaman damgası saklanmaz: yıl başına 8.760 değer, yer kazanmak için tam sayıya
 * ölçeklenmiş hâlde durur. Burada aynı ölçekle geri çevriliyor.
 */
function onbellekCoz(j: any): HavaSonucu {
  const yillar: HavaYili[] = j.yillar.map((yil: number, y: number) => {
    const poa = new Float32Array(SAAT_YIL);
    const sicaklik = new Float32Array(SAAT_YIL);
    const ruzgar = new Float32Array(SAAT_YIL);
    for (let i = 0; i < SAAT_YIL; i++) {
      poa[i] = j.poa[y][i];
      sicaklik[i] = j.sicaklik[y][i] / 10;
      ruzgar[i] = j.ruzgar[y][i] / 10;
    }
    return { yil, poa, sicaklik, ruzgar };
  });
  if (yillar.length < 3) throw new Error("Önbellek dosyasında yeterli tam yıl yok.");
  return { yillar, eksikOran: j.eksikOran ?? 0, egikKaynak: j.egikKaynak === "GHI" ? "GHI" : "GTI" };
}

export function havaGetir(enlem: number, boylam: number, egim = 30): Promise<HavaSonucu> {
  const anahtar = `${enlem.toFixed(2)},${boylam.toFixed(2)},${egim}`;
  const var_ = onbellek.get(anahtar);
  if (var_) return var_;

  const soz = getir(enlem, boylam, egim);
  onbellek.set(anahtar, soz);
  // Başarısız bir söz önbellekte kalırsa "tekrar dene" düğmesi hiç çalışmaz: hata
  // sonsuza kadar geri döner. O yüzden düşen sözü önbellekten çıkarıyoruz.
  soz.catch(() => onbellek.delete(anahtar));
  return soz;
}

async function getir(enlem: number, boylam: number, egim: number): Promise<HavaSonucu> {
  // Önce depoda hazır dosya var mı? Varsa canlı API'ye hiç gidilmez: demo günü
  // Open-Meteo yavaşlasa ya da kapalı olsa bile ilk ekran açılır.
  try {
    const r = await fetch(`/hava/${enlem.toFixed(2)}_${boylam.toFixed(2)}_${egim}.json`);
    if (r.ok) return onbellekCoz(await r.json());
  } catch {
    // Dosya yok ya da bozuk: canlı çekmeye devam. Sessiz geçilir, davranış değişmez.
  }

  const p = new URLSearchParams({
    latitude: String(enlem),
    longitude: String(boylam),
    start_date: `${HAVA_YILLARI[0]}-01-01`,
    end_date: `${HAVA_YILLARI[HAVA_YILLARI.length - 1]}-12-31`,
    hourly: "global_tilted_irradiance,temperature_2m,wind_speed_10m",
    tilt: String(egim),
    azimuth: "0",
    wind_speed_unit: "ms",
    timezone: "Etc/GMT-3", // sabit UTC+3 (Türkiye Eylül 2016'dan beri; yaz saati boşluğu oluşmasın)
  });
  return ayristir(await getirTekrarla(`https://archive-api.open-meteo.com/v1/archive?${p}`));
}

async function getirTekrarla(url: string, deneme = 3): Promise<any> {
  for (let k = 0; k < deneme; k++) {
    const r = await fetch(url);
    if (r.ok) return r.json();
    if (r.status === 429 && k < deneme - 1) { // dakikalık sınır: bekle ve tekrar dene
      await new Promise((ok) => setTimeout(ok, 20000 * (k + 1)));
      continue;
    }
    throw new Error(r.status === 429
      ? "Open-Meteo kullanım sınırına ulaşıldı. Bir dakika sonra tekrar deneyin."
      : `Open-Meteo ${r.status}: ${(await r.text()).slice(0, 160)}`);
  }
}

export function ayristir(j: any): HavaSonucu {
  const h = j.hourly;
  const zaman: string[] = h.time;
  const gti: (number | null)[] = h.global_tilted_irradiance ?? [];
  const gtiVar = gti.some((v) => v != null && v > 0);
  const isinim: (number | null)[] = gtiVar ? gti : (h.shortwave_radiation ?? []);
  let eksik = 0;
  const doldur = (dizi: (number | null)[], i: number): number => {
    const v = dizi[i];
    if (v != null && Number.isFinite(v)) return v;
    eksik++;
    for (let k = 1; k < 48; k++) {
      const a = dizi[i - k], b = dizi[i + k];
      if (a != null) return a;
      if (b != null) return b;
    }
    return 0;
  };
  const yillar: HavaYili[] = HAVA_YILLARI.map((yil) => ({
    yil, poa: new Float32Array(SAAT_YIL), sicaklik: new Float32Array(SAAT_YIL), ruzgar: new Float32Array(SAAT_YIL),
  }));
  const sayac = new Map<number, number>();
  for (let i = 0; i < zaman.length; i++) {
    const z = zaman[i]; // "2015-01-01T00:00"
    const yil = +z.slice(0, 4);
    if (z.slice(5, 10) === "02-29") continue; // 8.760 saatlik plan yılına hizala
    const idx = yil - HAVA_YILLARI[0];
    const y = yillar[idx];
    if (!y) continue;
    const k = sayac.get(yil) ?? 0;
    if (k >= SAAT_YIL) continue;
    y.poa[k] = Math.max(0, doldur(isinim, i));
    y.sicaklik[k] = doldur(h.temperature_2m, i);
    y.ruzgar[k] = Math.max(0, doldur(h.wind_speed_10m, i));
    sayac.set(yil, k + 1);
  }
  // Birkaç saat eksik yıl varsa son değeri tekrarlayarak 8.760'a tamamla
  for (const y of yillar) {
    const k = sayac.get(y.yil) ?? 0;
    if (k >= SAAT_YIL - 30 && k < SAAT_YIL) {
      for (let i = k; i < SAAT_YIL; i++) { y.poa[i] = y.poa[i - 24]; y.sicaklik[i] = y.sicaklik[i - 24]; y.ruzgar[i] = y.ruzgar[i - 24]; }
      sayac.set(y.yil, SAAT_YIL);
    }
  }
  const tamYillar = yillar.filter((y) => (sayac.get(y.yil) ?? 0) === SAAT_YIL);
  if (tamYillar.length < 3) throw new Error("Open-Meteo yanıtında yeterli tam yıl yok.");
  return { yillar: tamYillar, eksikOran: eksik / (zaman.length * 3), egikKaynak: gtiVar ? "GTI" : "GHI" };
}
