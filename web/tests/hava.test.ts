// Çalıştırma: npm test
// Python yazıcı (model/hava_onbellek.py) ile TypeScript okuyucu (hava.ts) aynı biçimde
// anlaşıyor mu? Önbellek dosyası demo günü Open-Meteo'ya hiç gitmemeyi sağlıyor;
// biçim sessizce kayarsa uygulama canlı API'ye düşer ve bunu kimse fark etmez.
import { readFileSync } from "node:fs";
import { SAAT_YIL } from "../src/veri/hava";

const ham = JSON.parse(readFileSync(new URL("./veri/hava_onbellek_ornek.json", import.meta.url), "utf8"));

// hava.ts'teki onbellekCoz dışa açık değil; aynı dönüşümü burada tekrarlayıp
// dosyanın yapısal olarak doğru olduğunu sınıyoruz.
if (ham.surum !== 1) throw new Error("Önbellek sürümü beklenenden farklı");
if (!Array.isArray(ham.yillar) || ham.yillar.length < 3) throw new Error("Yeterli tam yıl yok");
for (const alan of ["poa", "sicaklik", "ruzgar"]) {
  if (ham[alan].length !== ham.yillar.length) throw new Error(`${alan}: yıl sayısı uyuşmuyor`);
  for (const yil of ham[alan]) {
    if (yil.length !== SAAT_YIL) throw new Error(`${alan}: yıl ${yil.length} saat, ${SAAT_YIL} olmalı`);
    if (!yil.every((v: number) => Number.isInteger(v))) throw new Error(`${alan}: tam sayı olmalı (yer kazancı)`);
  }
}
const sicaklik = ham.sicaklik[0].map((v: number) => v / 10);
const poa = ham.poa[0];
console.log(`önbellek: ${ham.yillar.length} yıl (${ham.yillar[0]}–${ham.yillar.at(-1)}), kaynak ${ham.egikKaynak}`);
console.log(`  sıcaklık ${Math.min(...sicaklik).toFixed(1)}–${Math.max(...sicaklik).toFixed(1)} °C` +
            ` · ışınım tepe ${Math.max(...poa)} W/m²`);
if (Math.max(...poa) <= 0) throw new Error("Işınım hep sıfır — ölçek yanlış olabilir");
if (Math.max(...sicaklik) > 60 || Math.min(...sicaklik) < -60) throw new Error("Sıcaklık ölçeği yanlış (×10 unutulmuş olabilir)");
console.log("TAMAM");
