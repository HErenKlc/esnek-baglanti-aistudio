// Çalıştırma: npm test
// 1) PVWatts TS portu pvlib-python referansıyla aynı mı?
// 2) Simülasyon uçtan uca tutarlı mı? (ağ olmadan: gök açık ışınım şekliyle sentetik hava — SADECE TEST)
import { readFileSync } from "node:fs";
import { pvSaatlik } from "../src/sim/pv";
import { senaryolarKur, dagilim, enYuksekEkMW, statikKalan } from "../src/sim/kisinti";
import { ayristir, HAVA_YILLARI } from "../src/veri/hava";

const ref = JSON.parse(readFileSync(new URL("./pvlib_ref.json", import.meta.url), "utf8"));
let maksFark = 0;
ref.poa.forEach((g: number, i: number) => {
  maksFark = Math.max(maksFark, Math.abs(pvSaatlik(g, ref.t[i], ref.ws[i]) - ref.ac[i]));
});
console.log("PVWatts vs pvlib maks mutlak fark:", maksFark.toExponential(2));
if (maksFark > 1e-5) throw new Error("PV modeli pvlib ile uyuşmuyor");

// Sentetik test havası (Open-Meteo JSON biçiminde): yarım sinüs gün, mevsimsel genlik, bulut gürültüsü
const zaman: string[] = [], gti: number[] = [], ghi: number[] = [], t2m: number[] = [], ws: number[] = [];
let tohum = 7;
const r = () => ((tohum = (tohum * 16807) % 2147483647) / 2147483647);
for (const y of HAVA_YILLARI) {
  const d0 = Date.UTC(y, 0, 1), d1 = Date.UTC(y + 1, 0, 1);
  for (let ms = d0; ms < d1; ms += 3600e3) {
    const d = new Date(ms), gun = Math.floor((ms - d0) / 864e5), s = d.getUTCHours();
    const mevsim = 0.75 + 0.25 * Math.cos((2 * Math.PI * (gun - 172)) / 365);
    const gunes = s >= 6 && s <= 18 ? Math.sin((Math.PI * (s - 6)) / 12) : 0;
    const bulut = r() < 0.15 ? 0.3 : 1;
    zaman.push(d.toISOString().slice(0, 16));
    gti.push(1050 * mevsim * gunes * bulut); ghi.push(900 * mevsim * gunes * bulut);
    t2m.push(12 + 14 * Math.cos((2 * Math.PI * (gun - 200)) / 365) + 5 * gunes); ws.push(3);
  }
}
const hava = ayristir({ hourly: { time: zaman, global_tilted_irradiance: gti, shortwave_radiation: ghi, temperature_2m: t2m, wind_speed_10m: ws } });
console.log("Hava yılları:", hava.yillar.length, "kaynak:", hava.egikKaynak);

const yk = JSON.parse(readFileSync(new URL("../public/yuk_kantilleri_2026.json", import.meta.url), "utf8"));
const trafo = { maksMW: 72, tahsisMW: 51, yukTepeMW: 40 }; // Karapınar TM, yük tepe varsayımı 40 MW
let t0 = performance.now();
const sc = senaryolarKur(hava.yillar, yk, trafo);
console.log("Senaryo:", sc.n, "E =", sc.ihracatLimitiMW.toFixed(1), "MW; en düşük gündüz yükü", sc.enDusukGunduzYukMW.toFixed(1), "MW;", (performance.now() - t0).toFixed(0), "ms");
const yillik = sc.pv[0].reduce((a, b) => a + b, 0);
console.log("1 MW yıllık üretim (sentetik hava):", yillik.toFixed(0), "MWh");

const statik = statikKalan(trafo);
const d0 = dagilim(sc, trafo, statik);
console.log(`Statik kalan ${statik} MW → kısıntı P50 ${(d0.p50 * 100).toFixed(2)}% P90 ${(d0.p90 * 100).toFixed(2)}%`);
t0 = performance.now();
const ek = enYuksekEkMW(sc, trafo, 0.05, "p90");
const d = dagilim(sc, trafo, ek);
console.log(`%5 P90 hedefiyle ek ${ek.toFixed(1)} MW → P50 ${(d.p50 * 100).toFixed(2)}% P90 ${(d.p90 * 100).toFixed(2)}%  (${(performance.now() - t0).toFixed(0)} ms)`);
console.log("Mevcut santral kısıntısı (olmalı ≈0):", d.mevcutKisilanMaks.toFixed(2), "MWh");
const bat = { gucMW: ek * 0.3, enerjiMWh: ek * 0.3 * 2, verim: 0.88 };
const ekB = enYuksekEkMW(sc, trafo, 0.05, "p90", bat);
console.log(`Batarya (${bat.gucMW.toFixed(0)} MW / ${bat.enerjiMWh.toFixed(0)} MWh) ile ek ${ekB.toFixed(1)} MW`);
if (!(ekB >= ek)) throw new Error("Batarya ek kapasiteyi azaltmamalı");
if (!(d.p90 <= 0.0501)) throw new Error("İkiye bölme hedefi tutturamadı");
console.log("TAMAM");
