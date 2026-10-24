// Bağlantı hattı (fider) kontrolü: 34,5 kV havai hatta gerilim yükselmesi ve ısıl sınır.
// Gerilim değişimi (kısa hat yaklaşımı):  ΔU/U ≈ L·(R·P − X·Q) / U²   [P MW, Q Mvar, U kV, R,X Ω/km]
// Üretim cosφ < 1 ile ENDÜKTİF çalışırsa (reaktif güç çeker) Q = P·tanφ gerilimi düşürür: ikinci esneklik kaldıracı.
//
// İletken verisi: Southwire ACSR katalog tablosu (SPEC 80100): AC direnç @25°C ve izin verilen akım
// (75°C iletken, 25°C ortam, 0,61 m/s rüzgâr, güneşli). GMR: ACSR tablosu (ft → mm).
// Reaktans: X = 2π·50·2·10⁻⁷·ln(Deq/GMR) Ω/m; Deq = faz arası eşdeğer açıklık (varsayım, 34,5 kV için ~1,5 m).
// Gerilim sınırı varsayılanı %2: VDE-AR-N 4110 (Almanya OG bağlantı kuralı) §5.3.2 uygulaması. EDAŞ'ın kendi kriteri girilebilir.

export interface Iletken { ad: string; R: number; GMRmm: number; amper: number }

export const ILETKENLER: Iletken[] = [
  { ad: "Partridge (266,8 MCM)", R: 0.0779 * 3.28084, GMRmm: 0.0217 * 304.8, amper: 475 },
  { ad: "Hawk (477 MCM)", R: 0.0436 * 3.28084, GMRmm: 0.0289 * 304.8, amper: 659 },
  { ad: "Drake (795 MCM)", R: 0.0263 * 3.28084, GMRmm: 0.0373 * 304.8, amper: 907 },
];

export interface FiderGirdisi {
  iletken: Iletken;
  mesafeKm: number;
  gerilimKV: number; // 34,5
  cosPhi: number; // 1,0 veya 0,95 (endüktif)
  sinirYuzde: number; // izin verilen gerilim değişimi, %
  deqM: number; // eşdeğer faz açıklığı, m
}

export interface FiderSonucu {
  X: number; // Ω/km
  gerilimMW: number; // gerilim sınırına göre en yüksek aktif güç
  isilMW: number; // ısıl sınıra göre en yüksek aktif güç
  sinirMW: number; // ikisinin küçüğü
  baglayici: "gerilim" | "ısıl";
}

export function reaktans(i: Iletken, deqM: number) {
  return 2 * Math.PI * 50 * 2e-7 * Math.log((deqM * 1000) / i.GMRmm) * 1000;
}

export function fiderKapasitesi(g: FiderGirdisi): FiderSonucu {
  const X = reaktans(g.iletken, g.deqM);
  const tanPhi = Math.tan(Math.acos(Math.min(1, Math.max(0.8, g.cosPhi))));
  const etkin = g.iletken.R - X * tanPhi; // Ω/km, MW başına gerilim etkisi
  const gerilimMW = etkin > 1e-6 ? (g.sinirYuzde / 100) * g.gerilimKV ** 2 / (g.mesafeKm * etkin) : Infinity;
  const isilMW = (Math.sqrt(3) * g.gerilimKV * g.iletken.amper * g.cosPhi) / 1000;
  const sinirMW = Math.min(gerilimMW, isilMW);
  return { X, gerilimMW, isilMW, sinirMW, baglayici: gerilimMW < isilMW ? "gerilim" : "ısıl" };
}

/** Verilen güç için gerilim değişimi, %. */
export function gerilimDegisimi(g: FiderGirdisi, pMW: number) {
  const X = reaktans(g.iletken, g.deqM);
  const tanPhi = Math.tan(Math.acos(Math.min(1, Math.max(0.8, g.cosPhi))));
  return (100 * g.mesafeKm * (g.iletken.R * pMW - X * pMW * tanPhi)) / g.gerilimKV ** 2;
}
