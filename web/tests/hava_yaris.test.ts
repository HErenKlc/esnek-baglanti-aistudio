// Çalıştırma: npm test
// Sayfa açılışında yenile() birkaç yerden eşzamanlı çağrılıyor. havaGetir sonucu
// değil sözü (Promise) önbelleğe almazsa, hepsi boş önbellek görür ve aynı 1,6 MB'lık
// hava dosyasını ayrı ayrı indirir — jüri linki soğuk açtığında iki katı veri demek.
// Bu test o yarışın geri gelmediğini kontrol eder.
export {}; // dosyayı modül yapar; üst düzey await bunu gerektiriyor

let sayac = 0;
const gercekFetch = globalThis.fetch;
(globalThis as any).fetch = async (u: string) => {
  if (String(u).includes("/hava/")) {
    sayac++;
    const yil = [2006, 2007, 2008];
    const bos = Array.from({ length: 8760 }, () => 0);
    return {
      ok: true,
      json: async () => ({
        surum: 1, egikKaynak: "GTI", eksikOran: 0, yillar: yil,
        poa: yil.map(() => bos),
        sicaklik: yil.map(() => bos.map(() => 150)),
        ruzgar: yil.map(() => bos.map(() => 25)),
      }),
    } as any;
  }
  throw new Error("Testte beklenmeyen istek: " + u);
};

const { havaGetir } = await import("../src/veri/hava");

const [a, b, c] = await Promise.all([
  havaGetir(37.7313, 33.5511),
  havaGetir(37.7313, 33.5511),
  havaGetir(37.7313, 33.5511),
]);
console.log(`3 eşzamanlı çağrı → ${sayac} indirme`);
if (sayac !== 1) throw new Error(`Yarış durumu geri gelmiş: ${sayac} indirme oldu, 1 bekleniyordu`);
if (!(a === b && b === c)) throw new Error("Eşzamanlı çağrılar aynı sonucu paylaşmıyor");
if (a.yillar.length !== 3) throw new Error("Önbellek dosyası çözülemedi");

await havaGetir(37.7313, 33.5511);
if (sayac !== 1) throw new Error("Sonraki çağrı önbelleği kullanmadı");
console.log(`sonraki çağrı → toplam ${sayac} indirme (önbellekten)`);

globalThis.fetch = gercekFetch;
console.log("TAMAM");
