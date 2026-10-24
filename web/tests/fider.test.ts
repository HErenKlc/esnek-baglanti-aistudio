// Çalıştırma: npm test
// Bağlantı hattı (fider) formülünün iki yönlü sınaması:
//   1) TypeScript formülü, pandapower doğrulamasını üreten Python portuyla aynı sayıyı veriyor mu?
//      (ikisi ayrı dilde yazılmış; biri değişip diğeri unutulursa bu test düşer)
//   2) pandapower yük akışına göre formül hangi yöne sapıyor? İyimser sapma kabul edilmez.
// Veri: web/public/gerilim_dogrulama.json — model/gerilim_dogrulama.py üretir.
import { readFileSync } from "node:fs";
import { ILETKENLER, fiderKapasitesi, gerilimDegisimi, type FiderGirdisi } from "../src/sim/fider";

const rapor = JSON.parse(readFileSync(new URL("../public/gerilim_dogrulama.json", import.meta.url), "utf8"));
const GERILIM_KV = 34.5, DEQ_M = 1.5, SINIR = 2;

const girdi = (ad: string, mesafeKm: number, cosPhi: number): FiderGirdisi => {
  const iletken = ILETKENLER.find((i) => i.ad === ad);
  if (!iletken) throw new Error(`İletken bulunamadı: ${ad}`);
  return { iletken, mesafeKm, gerilimKV: GERILIM_KV, cosPhi, sinirYuzde: SINIR, deqM: DEQ_M };
};

// 1) TS ↔ Python portu
let enBuyukSapma = 0;
for (const d of rapor.durumlar as any[]) {
  const ts = gerilimDegisimi(girdi(d.iletken, d.mesafe_km, d.cos_phi), d.P_MW);
  enBuyukSapma = Math.max(enBuyukSapma, Math.abs(ts - d.formul_yuzde));
}
for (const k of rapor.kapasiteler as any[]) {
  const ts = fiderKapasitesi(girdi(k.iletken, k.mesafe_km, k.cos_phi)).gerilimMW;
  enBuyukSapma = Math.max(enBuyukSapma, Math.abs(ts - k.formul_MW) / Math.max(1, k.formul_MW));
}
console.log(`TS ↔ Python portu: ${rapor.durumlar.length} ΔU + ${rapor.kapasiteler.length} kapasite durumu,` +
            ` en büyük sapma ${enBuyukSapma.toExponential(2)}`);
if (enBuyukSapma > 1e-3) throw new Error("TS formülü Python portuyla uyuşmuyor; biri güncellenmiş olabilir");

// 2) pandapower'a göre yön
const y = rapor.yon_analizi;
console.log(`pandapower: ${rapor.durum_sayisi} durum · çalışma aralığında ortalama ` +
            `${rapor.calisma_araligi.ortalama_mutlak_fark_puan} puan sapma`);
console.log(`iyimser kapasite durumu: ${y.iyimser_kapasite_durumu}/${y.toplam_kapasite_durumu};` +
            ` en iyimser ΔU sapması ${y.en_iyimser_delta_u_puan} puan`);
if (y.iyimser_kapasite_durumu > 0) throw new Error("Formül bazı durumlarda gerçek kapasiteden BÜYÜK sayı veriyor");
// Sınırın %5'inden fazla iyimser ΔU sapması kabul edilmez (2% sınırda 0,1 puan).
if (y.en_iyimser_delta_u_puan < -SINIR * 0.05) throw new Error("ΔU sapması iyimser yönde fazla büyük");

// 3) Isıl sınır tanım gereği doğru olmalı: √3·U·I·cosφ
const g = girdi("Hawk (477 MCM)", 10, 1);
const beklenen = (Math.sqrt(3) * GERILIM_KV * g.iletken.amper * 1) / 1000;
const isil = fiderKapasitesi(g).isilMW;
console.log(`ısıl sınır (Hawk, cosφ=1): ${isil.toFixed(2)} MW`);
if (Math.abs(isil - beklenen) > 1e-9) throw new Error("Isıl sınır tanımdan sapıyor");

console.log("TAMAM");
