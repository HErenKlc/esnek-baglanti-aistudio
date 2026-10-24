// Mekanik kontrolü: geri test ve yük bağımsız alt sınır. Hava burada TEST AMAÇLI SENTETİK (tests/ dışında kullanılmaz);
// gerçek sonuçlar uygulamada Open-Meteo verisiyle hesaplanır. Çalıştırma: npx tsx tests/kanit_deneyi.ts <mock_hava.json>
import { readFileSync } from "node:fs";
import { ayristir } from "../src/veri/hava";
import { TRAFOLAR } from "../src/veri/trafolar";
import { altSinirSenaryolari, pvYillari, enYuksekEkMW, statikKalan, senaryolarKur } from "../src/sim/kisinti";
import { geriTestYili } from "../src/sim/geritest";

const hava = ayristir(JSON.parse(readFileSync(process.argv[2], "utf8")));
const veri = JSON.parse(readFileSync(new URL("../public/geri_test.json", import.meta.url), "utf8"));
const yk = JSON.parse(readFileSync(new URL("../public/yuk_kantilleri_2026.json", import.meta.url), "utf8"));
const hedef = 0.05;
let modelAsim = 0, naifAsim = 0, bantIci = 0, n = 0, altTop = 0, stTop = 0, monoton = 0;
const t0 = performance.now();
for (const t of TRAFOLAR) {
  const g = { maksMW: t.maksMW, tahsisMW: t.tahsisMW, yukTepeMW: t.maksMW * 0.6 };
  const st = statikKalan(g);
  const alt = Math.max(st, enYuksekEkMW(altSinirSenaryolari(pvYillari(hava.yillar), t.maksMW), g, hedef, "p90"));
  altTop += alt; stTop += st;
  // alt sınır gerçekten alt mı? (yük eklenince kapasite azalmamalı)
  const es = Math.max(st, enYuksekEkMW(senaryolarKur(hava.yillar, yk, g, 5), g, hedef, "p90"));
  if (es + 0.5 >= alt) monoton++;
  for (const yil of [2024, 2025]) {
    const r = geriTestYili(hava.yillar, veri, yil, g, hedef, "p90");
    if (!r) continue;
    n++;
    if (r.modelGercek > hedef + 1e-9) modelAsim++;
    if (r.naifGercek > hedef + 1e-9) naifAsim++;
    if (r.modelGercek >= r.modelBantP05 - 1e-9 && r.modelGercek <= r.modelBantP95 + 1e-9) bantIci++;
  }
}
console.log(`statik ${stTop.toFixed(0)} MW, yük bağımsız alt sınır ${altTop.toFixed(0)} MW; alt sınır ≤ esnek: ${monoton}/${TRAFOLAR.length}`);
console.log(`geri test (TM×yıl=${n}): model hedefi aştı ${modelAsim}, naif aştı ${naifAsim}, model bandı tuttu ${bantIci}`);
console.log(((performance.now() - t0) / 1000).toFixed(1), "sn");
