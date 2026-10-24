// Esnek bağlantı simülasyonu: senaryolar (gerçek hava yılları × yük kantil çekilişleri),
// kısıntı dağılımı, en yüksek ek MW (ikiye bölme) ve batarya.

import { SAAT_YIL, type HavaYili } from "../veri/hava";
import { pvSerisi } from "./pv";

export interface YukKantilleri {
  kantiller: number[];
  saatler: number[][]; // 8760 × 7, P50 tepesi = 1
}

export interface TrafoGirdisi {
  maksMW: number; // yayımlanan TM üst sınırı (statik kural)
  tahsisMW: number; // mevcut / tahsisli üretim
  yukTepeMW: number; // TM yük tepe değeri (varsayım)
  fiderMW?: number; // yeni projenin bağlandığı fider / gerilim kaynaklı enjeksiyon sınırı (yoksa sınırsız)
}

export interface Senaryolar {
  n: number;
  pv: Float32Array[]; // her senaryo: 1 MWac başına saatlik üretim
  yuk: Float32Array[]; // her senaryo: MW
  ihracatLimitiMW: number; // E = maks − planlama en düşük gündüz yükü
  enDusukGunduzYukMW: number;
  havaYili: number[];
}

// Hava yılı başına GES üretimi bir kez hesaplanır (bölge hesabında 23 TM aynı havayı paylaşır)
const pvOnbellek = new WeakMap<HavaYili, Float32Array>();
export function pvYillari(hava: HavaYili[]): { pv: Float32Array; yil: number }[] {
  return hava.map((h) => {
    let pv = pvOnbellek.get(h);
    if (!pv) { pv = pvSerisi(h.poa, h.sicaklik, h.ruzgar); pvOnbellek.set(h, pv); }
    return { pv, yil: h.yil };
  });
}

// --- tekrarlanabilir rastgelelik (sabit seed)
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function normal(r: () => number) {
  const u = Math.max(1e-12, r()), v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function phi(z: number) {
  // standart normal BDF (Abramowitz-Stegun)
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

/** Kantil tablosundan u ∈ (0,1) için doğrusal ara değer; kuyruklar en dıştaki aralıkla uzatılır. */
export function kantilDegeri(q: number[], k: number[], u: number): number {
  const n = k.length;
  if (u <= k[0]) return q[0] - ((k[0] - u) / (k[1] - k[0])) * (q[1] - q[0]);
  if (u >= k[n - 1]) return q[n - 1] + ((u - k[n - 1]) / (k[n - 1] - k[n - 2])) * (q[n - 1] - q[n - 2]);
  for (let i = 1; i < n; i++) {
    if (u <= k[i]) return q[i - 1] + ((u - k[i - 1]) / (k[i] - k[i - 1])) * (q[i] - q[i - 1]);
  }
  return q[n - 1];
}

/**
 * Ölçülmüş TM yükü (EDAŞ SCADA'sından 8.760 saatlik MW dizisi) varsa belirsizlik çekilişi
 * yapılmaz: her hava yılı tek senaryo üretir ve yük varsayımı tamamen devreden çıkar.
 * Kanıt merdiveninin üçüncü basamağı budur; pilotta bu yol kullanılır.
 */
export function olcumSenaryolari(hava: HavaYili[], olcumMW: Float32Array, maksMW: number): Senaryolar {
  const pvYil = pvYillari(hava).map((h) => h.pv);
  const pv: Float32Array[] = [], yuk: Float32Array[] = [], havaYili: number[] = [];
  for (let w = 0; w < hava.length; w++) {
    pv.push(pvYil[w]); yuk.push(olcumMW); havaYili.push(hava[w].yil);
  }
  let enDusuk = Infinity;
  for (let i = 0; i < SAAT_YIL; i++) {
    const s = i % 24;
    if (s >= 10 && s <= 15) enDusuk = Math.min(enDusuk, olcumMW[i]);
  }
  return { n: pv.length, pv, yuk, ihracatLimitiMW: maksMW - enDusuk, enDusukGunduzYukMW: enDusuk, havaYili };
}

export function senaryolarKur(
  hava: HavaYili[], yk: YukKantilleri, t: TrafoGirdisi, cekilis = 5, seed = 42,
): Senaryolar {
  const r = mulberry32(seed);
  const pvYil = pvYillari(hava).map((h) => h.pv);
  const pv: Float32Array[] = [], yuk: Float32Array[] = [], havaYili: number[] = [];
  const rho = 0.8; // günler arası yük anomalisi kalıcılığı (AR(1))
  for (let w = 0; w < hava.length; w++) {
    for (let d = 0; d < cekilis; d++) {
      const L = new Float32Array(SAAT_YIL);
      let z = normal(r);
      for (let gun = 0; gun < 365; gun++) {
        if (gun > 0) z = rho * z + Math.sqrt(1 - rho * rho) * normal(r);
        const u = Math.min(0.995, Math.max(0.005, phi(z)));
        for (let s = 0; s < 24; s++) {
          const i = gun * 24 + s;
          L[i] = Math.max(0, kantilDegeri(yk.saatler[i], yk.kantiller, u)) * t.yukTepeMW;
        }
      }
      pv.push(pvYil[w]); yuk.push(L); havaYili.push(hava[w].yil);
    }
  }
  // Statik kuralın varsaydığı en kötü an: tam üretim + en düşük gündüz yükü (P5, 10:00–15:00)
  let enDusuk = Infinity;
  for (let i = 0; i < SAAT_YIL; i++) {
    const s = i % 24;
    if (s >= 10 && s <= 15) enDusuk = Math.min(enDusuk, yk.saatler[i][0]);
  }
  const enDusukMW = enDusuk * t.yukTepeMW;
  return { n: pv.length, pv, yuk, ihracatLimitiMW: t.maksMW - enDusukMW, enDusukGunduzYukMW: enDusukMW, havaYili };
}

export interface BataryaGirdisi { gucMW: number; enerjiMWh: number; verim: number }

export interface SenaryoSonucu {
  kisintiOrani: number; // yeni projenin potansiyel üretimine oranı
  potansiyelMWh: number;
  kisilanMWh: number;
  mevcutKisilanMWh: number; // mevcut santrallerin korunduğunu kontrol için
}

/** Tek senaryo. Yeni proje önce kısılır (mevcut hakları korunur). Batarya kısıntıyı depolar, boş kapasitede verir. */
export function senaryoKisinti(
  pv: Float32Array, yuk: Float32Array, E: number, tahsis: number, ekMW: number,
  bat?: BataryaGirdisi, aylikSaatlik?: Float64Array, fiderMW = Infinity,
): SenaryoSonucu {
  let pot = 0, kis = 0, mevKis = 0, soc = 0;
  const etaS = bat ? Math.sqrt(bat.verim) : 1;
  for (let i = 0; i < SAAT_YIL; i++) {
    const p = pv[i];
    const yeni = ekMW * p;
    pot += yeni;
    const trafoFazla = (tahsis + ekMW) * p - yuk[i] - E; // trafo ters akış sınırı aşımı
    const fazla = Math.max(trafoFazla, yeni - fiderMW); // fider/gerilim sınırı yalnızca yeni projeyi bağlar
    if (fazla > 0) {
      let k = Math.min(yeni, fazla);
      mevKis += Math.max(0, trafoFazla - yeni);
      if (bat && bat.gucMW > 0) {
        const sarj = Math.min(k, bat.gucMW, (bat.enerjiMWh - soc) / etaS);
        soc += sarj * etaS;
        k -= sarj * etaS; // şarj kaybı kısıntı sayılır
      }
      kis += k;
      if (aylikSaatlik && k > 0) aylikSaatlik[ayIndeksi(i) * 24 + (i % 24)] += k;
    } else if (bat && soc > 0) {
      const bosluk = -fazla; // hem trafo hem fider tarafındaki boşluk
      const desarj = Math.min(bosluk, bat.gucMW, soc * etaS);
      soc -= desarj / etaS;
      kis += desarj / etaS - desarj; // deşarj kaybı
    }
  }
  kis += soc; // yıl sonunda bataryada kalan enerji teslim edilmemiş sayılır
  return { kisintiOrani: pot > 0 ? kis / pot : 0, potansiyelMWh: pot, kisilanMWh: kis, mevcutKisilanMWh: mevKis };
}

const AY_SINIR = [31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365];
function ayIndeksi(saat: number) {
  const gun = Math.floor(saat / 24);
  for (let m = 0; m < 12; m++) if (gun < AY_SINIR[m]) return m;
  return 11;
}

export interface Dagilim {
  p05: number; p50: number; p90: number; p95: number; ortalama: number;
  teslimP50MWh: number; kisilanP50MWh: number; potansiyelMWh: number;
  mevcutKisilanMaks: number;
}

export function yuzdelik(a: number[], q: number) {
  const s = [...a].sort((x, y) => x - y);
  const pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export function dagilim(sc: Senaryolar, t: TrafoGirdisi, ekMW: number, bat?: BataryaGirdisi, isi?: Float64Array): Dagilim {
  const oran: number[] = [], teslim: number[] = [], kis: number[] = [];
  let pot = 0, mevMaks = 0;
  for (let s = 0; s < sc.n; s++) {
    const r = senaryoKisinti(sc.pv[s], sc.yuk[s], sc.ihracatLimitiMW, t.tahsisMW, ekMW, bat, isi, t.fiderMW ?? Infinity);
    oran.push(r.kisintiOrani); teslim.push(r.potansiyelMWh - r.kisilanMWh); kis.push(r.kisilanMWh);
    pot += r.potansiyelMWh / sc.n; mevMaks = Math.max(mevMaks, r.mevcutKisilanMWh);
  }
  if (isi) for (let i = 0; i < isi.length; i++) isi[i] /= sc.n;
  return {
    p05: yuzdelik(oran, 0.05), p50: yuzdelik(oran, 0.5), p90: yuzdelik(oran, 0.9), p95: yuzdelik(oran, 0.95), ortalama: oran.reduce((a, b) => a + b, 0) / oran.length,
    teslimP50MWh: yuzdelik(teslim, 0.5), kisilanP50MWh: yuzdelik(kis, 0.5), potansiyelMWh: pot,
    mevcutKisilanMaks: mevMaks,
  };
}

/** Statik kural: kalan = maks − tahsis. */
export function statikKalan(t: TrafoGirdisi) { return Math.max(0, t.maksMW - t.tahsisMW); }

/** Kısıntı (seçilen istatistik) hedefi aşmadan eklenebilecek en yüksek MW. */
export function enYuksekEkMW(sc: Senaryolar, t: TrafoGirdisi, hedef: number, istatistik: "p50" | "p90", bat?: BataryaGirdisi, ust = 400) {
  const f = (mw: number) => dagilim(sc, t, mw, bat)[istatistik];
  if (f(0.5) > hedef) return 0;
  let lo = 0.5, hi = ust;
  if (f(hi) <= hedef) return hi;
  for (let k = 0; k < 18; k++) {
    const m = (lo + hi) / 2;
    if (f(m) <= hedef) lo = m; else hi = m;
  }
  return lo;
}

export function egri(sc: Senaryolar, t: TrafoGirdisi, ustMW: number, adim = 28) {
  const noktalar: { mw: number; p50: number; p90: number }[] = [];
  for (let k = 0; k <= adim; k++) {
    const mw = (ustMW * k) / adim;
    const d = dagilim(sc, t, Math.max(mw, 0.01));
    noktalar.push({ mw, p50: d.p50, p90: d.p90 });
  }
  return noktalar;
}

/**
 * Yük bilgisi gerektirmeyen ALT SINIR. TEİAŞ bir TM için "maks MW" yayımladığında, o kadar kurulu gücün
 * her saatte tam üretim yapabileceğini kabul etmiş olur. Burada tek kural: toplam üretim ≤ maks.
 * Yük her an en düşük seviyesinde kabul edilir (fazladan yük payı yok) ve TEİAŞ'ın hesap formülü bilinmese de geçerlidir.
 * Kazanç yalnızca gerçek hava verisinden gelir: GES nadiren tam güçte ve aynı anda üretir.
 */
export function altSinirSenaryolari(hava: { pv: Float32Array; yil: number }[], maksMW: number): Senaryolar {
  const sifir = new Float32Array(SAAT_YIL);
  return {
    n: hava.length, pv: hava.map((h) => h.pv), yuk: hava.map(() => sifir),
    ihracatLimitiMW: maksMW, enDusukGunduzYukMW: 0, havaYili: hava.map((h) => h.yil),
  };
}

/**
 * Naif planlamacı: belirsizlik yok, "geçen yıl ne olduysa bu yıl da o olur".
 * Tek senaryo = bir önceki yılın gerçek havası + gerçek yükü. E, TM'nin fiziksel sınırı olduğu için modelle aynı.
 */
export function tekSenaryo(pvYil: Float32Array, yukNorm: number[], yukTepeMW: number, E: number, yil: number): Senaryolar {
  const L = new Float32Array(SAAT_YIL);
  for (let i = 0; i < SAAT_YIL; i++) L[i] = yukNorm[i] * yukTepeMW;
  return { n: 1, pv: [pvYil], yuk: [L], ihracatLimitiMW: E, enDusukGunduzYukMW: 0, havaYili: [yil] };
}

/** Geri test: belirli bir yılın gerçek saatlik hava + gerçek yük şekliyle hesaplanan kısıntı. */
export function gerceklesenKisinti(pvYil: Float32Array, yukNorm: number[], t: TrafoGirdisi, E: number, ekMW: number): number {
  const L = new Float32Array(SAAT_YIL);
  for (let i = 0; i < SAAT_YIL; i++) L[i] = yukNorm[i] * t.yukTepeMW;
  return senaryoKisinti(pvYil, L, E, t.tahsisMW, ekMW, undefined, undefined, t.fiderMW ?? Infinity).kisintiOrani;
}
