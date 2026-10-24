// PVWatts tipi GES modeli — pvlib-python'daki pvwatts_dc + Faiman hücre sıcaklığı +
// basit evirici kırpmasının TypeScript karşılığı (tests/ altındaki betik pvlib ile karşılaştırır).
// Birim: 1 MWac kurulu güç başına saatlik MWh.

export const PV = {
  dcAcOrani: 1.2, // DC/AC (tipik GES)
  gamma: -0.004, // güç sıcaklık katsayısı, 1/°C
  kayip: 0.14, // PVWatts varsayılan sistem kayıpları
  eviriciVerim: 0.96,
  u0: 25.0, // Faiman, W/m²K
  u1: 6.84, // Faiman, W/m²K/(m/s)
};

export function faimanHucreSicakligi(poa: number, tHava: number, ruzgar: number): number {
  return tHava + poa / (PV.u0 + PV.u1 * ruzgar);
}

/** Tek saat: 1 MWac için üretim (MWh). poa: eğik yüzey ışınımı W/m², tHava °C, rüzgar m/s */
export function pvSaatlik(poa: number, tHava: number, ruzgar: number): number {
  if (!(poa > 0)) return 0;
  const tHucre = faimanHucreSicakligi(poa, tHava, ruzgar);
  const pdc0 = PV.dcAcOrani; // MWdc / MWac
  const dc = pdc0 * (poa / 1000) * (1 + PV.gamma * (tHucre - 25)) * (1 - PV.kayip);
  const ac = Math.max(0, dc * PV.eviriciVerim);
  return Math.min(ac, 1.0); // evirici AC sınırı = 1 MWac
}

export function pvSerisi(poa: Float32Array, t: Float32Array, ws: Float32Array): Float32Array {
  const out = new Float32Array(poa.length);
  for (let i = 0; i < poa.length; i++) out[i] = pvSaatlik(poa[i], t[i], ws[i]);
  return out;
}
