/**
 * EDAŞ SCADA ölçümü okuma: 8.760 saatlik TM yükü (MW).
 *
 * Neden: Uygulamadaki tek varsayım TM'nin yük büyüklüğü. Dağıtım şirketi bir yıllık
 * saatlik çekiş verisini paylaştığında bu varsayım tamamen kalkar. Bu dosya o veriyi
 * kabul eden yoldur; pilot aşamasının teknik karşılığı.
 *
 * Kabul edilen biçimler (sütun ayracı virgül, noktalı virgül veya sekme):
 *   - Tek sütun: her satır bir saatin MW değeri.
 *   - İki sütun: tarih/saat + MW. Tarih sütunu yok sayılır, sıra korunur.
 *   - Başlık satırı varsa atlanır. Ondalık ayracı nokta da virgül de olabilir.
 *   - 8.784 satır (artık yıl) gelirse 29 Şubat atılır; 8.760'tan azsa hata verilir.
 */
export interface OlcumSonucu {
  deger: Float32Array;
  satir: number;
  tepeMW: number;
  enDusukGunduzMW: number;
  uyari?: string;
  /** Dosya kendini sentetik ilan ediyor mu? Arayüz bunu gerçek ölçüm gibi göstermemeli. */
  sentetik: boolean;
}

const SAAT_YIL = 8760;

function sayiyaCevir(h: string): number {
  const t = h.trim().replace(/"/g, "");
  if (!t) return NaN;
  // "1.234,5" (TR) ve "1234.5" (EN) biçimlerinin ikisini de kabul et.
  const tr = /,\d{1,3}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  return Number(tr);
}

export function olcumAyristir(metin: string): OlcumSonucu {
  // Demo için üretilen sentetik profiller kendilerini işaretler (model/sentetik_olcum.py).
  // Bunu burada yakalayıp yukarı taşıyoruz: arayüz sentetik veriyi "gerçek ölçüm" diye göstermemeli.
  const sentetik = /SENTET[İI]K|SENTHETIC|SYNTHETIC/i.test(metin.slice(0, 4000));
  const satirlar = metin.split(/\r?\n/).filter((x) => x.trim() !== "");
  if (satirlar.length < 100) throw new Error("Dosyada yeterli satır yok (en az bir yıllık saatlik veri bekleniyor).");

  // Virgül hem sütun ayracı hem ondalık ayracı olabilir ("20,5"). Önce ";" ve sekmeye bak;
  // yoksa satırın tamamını tek sayı olarak dene; o da olmazsa virgülle böl.
  const ayir = (satir: string): string[] => {
    if (/[;\t]/.test(satir)) return satir.split(/[;\t]/);
    if (Number.isFinite(sayiyaCevir(satir))) return [satir];
    return satir.split(",");
  };

  const degerler: number[] = [];
  for (const satir of satirlar) {
    const parca = ayir(satir);
    // Son sayısal sütunu değer kabul et: "tarih;MW" ve "MW" biçimleri birlikte çalışsın.
    let v = NaN;
    for (let i = parca.length - 1; i >= 0; i--) {
      const x = sayiyaCevir(parca[i]);
      if (Number.isFinite(x)) { v = x; break; }
    }
    if (Number.isFinite(v)) degerler.push(v);
  }
  if (degerler.length < SAAT_YIL) {
    throw new Error(`Okunabilen saat sayısı ${degerler.length}; en az ${SAAT_YIL} gerekiyor. ` +
      "Dosyada başlık ya da boş satır olabilir.");
  }

  let uyari: string | undefined;
  let dizi = degerler;
  if (degerler.length === 8784) {
    // Artık yıl: 29 Şubat (59. gün) atılır — hava verisi de 365 güne göre kuruluyor.
    dizi = [...degerler.slice(0, 59 * 24), ...degerler.slice(60 * 24)];
    uyari = "Artık yıl verisi: 29 Şubat çıkarıldı.";
  } else if (degerler.length > SAAT_YIL) {
    dizi = degerler.slice(0, SAAT_YIL);
    uyari = `${degerler.length} satır okundu; ilk ${SAAT_YIL} saat kullanıldı.`;
  }

  const deger = new Float32Array(SAAT_YIL);
  let tepe = 0, enDusukGunduz = Infinity, eksi = 0;
  for (let i = 0; i < SAAT_YIL; i++) {
    const v = dizi[i];
    if (v < 0) eksi++;
    deger[i] = Math.max(0, v);
    if (deger[i] > tepe) tepe = deger[i];
    const s = i % 24;
    if (s >= 10 && s <= 15) enDusukGunduz = Math.min(enDusukGunduz, deger[i]);
  }
  if (eksi > 0) {
    uyari = (uyari ? uyari + " " : "") +
      `${eksi} saatte negatif değer vardı (ters akış); sıfır kabul edildi.`;
  }
  if (tepe <= 0) throw new Error("Bütün değerler sıfır ya da okunamadı. Sütun doğru mu?");
  if (tepe > 2000) {
    uyari = (uyari ? uyari + " " : "") +
      `Tepe değer ${tepe.toFixed(0)}: birim kW olabilir, MW bekleniyor.`;
  }
  if (sentetik) {
    uyari = (uyari ? uyari + " " : "") +
      "Dosya kendini SENTETİK olarak işaretliyor: bu gerçek ölçüm değildir, yalnızca demo içindir.";
  }
  return { deger, satir: degerler.length, tepeMW: tepe, enDusukGunduzMW: enDusukGunduz, uyari, sentetik };
}
