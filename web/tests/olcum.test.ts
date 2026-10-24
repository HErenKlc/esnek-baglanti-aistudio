import { readFileSync } from "node:fs";
import { olcumAyristir } from "../src/veri/olcum";
// Gerçekçi bir TM yük profili üret: gece 12 MW, gündüz 30 MW, yazın daha yüksek.
const satir: string[] = ["tarih;MW"];
for (let g = 0; g < 365; g++) {
  for (let s = 0; s < 24; s++) {
    const mevsim = 1 + 0.25 * Math.cos((2 * Math.PI * (g - 200)) / 365);
    const gunluk = s >= 8 && s <= 19 ? 1.6 : 0.8;
    satir.push(`2025-01-01T${String(s).padStart(2, "0")}:00;${(15 * mevsim * gunluk).toFixed(2)}`);
  }
}
const r = olcumAyristir(satir.join("\n"));
console.log(`satır: ${r.satir} | tepe: ${r.tepeMW.toFixed(2)} MW` +
            ` | en düşük gündüz: ${r.enDusukGunduzMW.toFixed(2)} MW | uyarı: ${r.uyari ?? "yok"}`);
console.log("dizi uzunluğu:", r.deger.length, r.deger.length === 8760 ? "(doğru)" : "(HATA)");

// Virgüllü ondalık + tek sütun biçimi de çalışmalı
const tek = Array.from({ length: 8760 }, (_, i) => (20 + (i % 24)).toFixed(1).replace(".", ",")).join("\n");
const r2 = olcumAyristir(tek);
console.log("tek sütun + virgüllü ondalık → tepe:", r2.tepeMW.toFixed(1), "MW");

// Artık yıl: 8784 satır → 29 Şubat atılmalı
const artik = Array.from({ length: 8784 }, () => "25").join("\n");
console.log("artık yıl →", olcumAyristir(artik).deger.length, "saat;", olcumAyristir(artik).uyari);

// Eksik veri hata vermeli
try { olcumAyristir(Array.from({ length: 500 }, () => "20").join("\n")); console.log("HATA: kısa dosya kabul edildi"); }
catch (e) { console.log("kısa dosya reddedildi:", (e as Error).message.slice(0, 60)); }

// Uçtan uca: ölçüm yüklenince senaryo sayısı hava yılı kadar olur (yük çekilişi yok).
import { olcumSenaryolari } from "../src/sim/kisinti";
import { pvSaatlik } from "../src/sim/pv";
const SAAT = 8760;
const hava = [2023, 2024, 2025].map((yil) => {
  const isinim = new Float32Array(SAAT), sic = new Float32Array(SAAT), ruz = new Float32Array(SAAT);
  for (let i = 0; i < SAAT; i++) {
    const s = i % 24;
    isinim[i] = s >= 6 && s <= 18 ? 900 * Math.sin((Math.PI * (s - 6)) / 12) : 0;
    sic[i] = 18; ruz[i] = 2;
  }
  return { yil, poa: isinim, sicaklik: sic, ruzgar: ruz };
});
const sc = olcumSenaryolari(hava, r.deger, 72);
console.log("ölçümle senaryo sayısı:", sc.n, sc.n === hava.length ? "(hava yılı başına bir tane — doğru)" : "(HATA)");
console.log(`ters akış sınırı: ${sc.ihracatLimitiMW.toFixed(1)} MW ` +
            `(72 − en düşük gündüz yükü ${sc.enDusukGunduzYukMW.toFixed(1)})`);
console.log("yük dizisi ölçümün kendisi mi:", sc.yuk[0] === r.deger ? "evet" : "HAYIR");
void pvSaatlik;
// Sentetik dosya kendini ele vermeli: arayüz bunu "gerçek ölçüm" diye göstermemeli.
const sentetikMetin = readFileSync(new URL("../../model/ornek_olcum_SENTETIK_konya.csv", import.meta.url), "utf8");
const rs = olcumAyristir(sentetikMetin);
console.log(`sentetik dosya: ${rs.satir} saat, tepe ${rs.tepeMW.toFixed(1)} MW, sentetik bayrağı: ${rs.sentetik}`);
if (!rs.sentetik) throw new Error("Sentetik dosya işaretlenmedi — arayüz onu gerçek ölçüm sanar");
if (rs.satir !== 8760) throw new Error("Sentetik dosya 8.760 saat olmalı");
// Gerçek biçimli (işaretsiz) dosya sentetik sayılmamalı
if (r.sentetik) throw new Error("İşaretsiz dosya yanlışlıkla sentetik sayıldı");

console.log("TAMAM");
