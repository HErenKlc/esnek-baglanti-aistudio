// Veri iki resmî kaynağın birleşimi (model/trafo_birlestir.py üretir):
//   üst sınır (maksMW) ← TEİAŞ "Tahsis Edilen / Maksimum Kapasite" tablosu. Trafo gücü
//     teknik sınırdır, yavaş değişir.
//   kalan kapasite     ← TEİAŞ "TM Bazlı Kalan Lisanssız Üretim Kapasiteleri", 01.10.2026
//     tarihli resmî duyuru (teias.gov.tr/duyurular). 794 TM, 81 il, toplam 625,10 MWe.
//   tahsisli (tahsisMW) ← üst sınır − kalan. Türetilmiş.
// "*" işaretli satırlar TEİAŞ'a göre kesinleşmemiş (kesin: false).
// Ayrancı (geçici) TM 01.10.2026 listesinde yok; TEİAŞ notuna göre ek talep gelmemiş.

export interface Trafo {
  ad: string;
  il: "KONYA" | "KARAMAN";
  tahsisMW: number;
  maksMW: number;
  kesin: boolean;
  enlem: number;
  boylam: number;
}

// Koordinatlar OpenStreetMap'teki gerçek trafo sahasından (model/osm_konum.py; power=substation,
// >=66 kV). Eşleşme il merkezine 200 km sınırıyla doğrulandı; eşleşmeyen TM için ilçe merkezi.
export const TRAFOLAR: Trafo[] = [
  { ad: "Akşehir TM", il: "KONYA", tahsisMW: 12, maksMW: 12.95, kesin: true, enlem: 38.3359, boylam: 31.4327 },
  { ad: "Alibeyhöyüğü TM", il: "KONYA", tahsisMW: 44, maksMW: 44, kesin: true, enlem: 37.5319, boylam: 32.6622 },
  { ad: "Altınekin TM", il: "KONYA", tahsisMW: 25, maksMW: 25, kesin: true, enlem: 38.3181, boylam: 32.8811 },
  { ad: "Beyşehir TM", il: "KONYA", tahsisMW: 26, maksMW: 26, kesin: true, enlem: 37.7445, boylam: 31.696 },
  { ad: "Cihanbeyli TM", il: "KONYA", tahsisMW: 22, maksMW: 22.94, kesin: true, enlem: 38.6671, boylam: 32.9164 },
  { ad: "Çumra TM", il: "KONYA", tahsisMW: 25.67, maksMW: 26, kesin: true, enlem: 37.5751, boylam: 32.751 },
  { ad: "Ereğli TM", il: "KONYA", tahsisMW: 27.5, maksMW: 28, kesin: true, enlem: 37.5405, boylam: 34.0878 },
  { ad: "Güneysınır TM", il: "KONYA", tahsisMW: 35, maksMW: 35, kesin: true, enlem: 37.3076, boylam: 32.7241 },
  { ad: "Ilgın TM", il: "KONYA", tahsisMW: 20, maksMW: 20, kesin: true, enlem: 38.2571, boylam: 31.8885 },
  { ad: "Karapınar TM", il: "KONYA", tahsisMW: 72, maksMW: 72, kesin: true, enlem: 37.7313, boylam: 33.5511 },
  { ad: "Kızören TM", il: "KONYA", tahsisMW: 46.01, maksMW: 46.22, kesin: true, enlem: 38.1435, boylam: 33.1764 },
  { ad: "Kolukısa TM", il: "KONYA", tahsisMW: 25, maksMW: 25, kesin: true, enlem: 38.5308, boylam: 32.2957 },
  { ad: "Konya-1 TM", il: "KONYA", tahsisMW: 19.06, maksMW: 20, kesin: false, enlem: 37.8612, boylam: 32.4682 },
  { ad: "Konya-2 TM", il: "KONYA", tahsisMW: 24.59, maksMW: 30, kesin: false, enlem: 37.9528, boylam: 32.5116 },
  { ad: "Konya-3 TM", il: "KONYA", tahsisMW: 50, maksMW: 50, kesin: false, enlem: 37.96, boylam: 32.6125 },
  { ad: "Konya-4 TM", il: "KONYA", tahsisMW: 27.68, maksMW: 30, kesin: false, enlem: 38.0172, boylam: 32.6285 },
  { ad: "Kulu TM", il: "KONYA", tahsisMW: 17, maksMW: 17, kesin: true, enlem: 39.156, boylam: 33.1151 },
  { ad: "Ladik TM", il: "KONYA", tahsisMW: 13.05, maksMW: 14, kesin: true, enlem: 40.9345, boylam: 35.9026 },
  { ad: "Seydişehir TM", il: "KONYA", tahsisMW: 25, maksMW: 25, kesin: true, enlem: 37.4594, boylam: 31.8625 },
  { ad: "Yunak TM", il: "KONYA", tahsisMW: 16, maksMW: 16, kesin: true, enlem: 38.8123, boylam: 31.749 },
  { ad: "Karaman OSB TM", il: "KARAMAN", tahsisMW: 22, maksMW: 51, kesin: true, enlem: 37.1867, boylam: 33.1943 },
  { ad: "Karaman TM", il: "KARAMAN", tahsisMW: 32, maksMW: 32, kesin: true, enlem: 37.1867, boylam: 33.1943 },
  { ad: "Ayrancı (geçici) TM", il: "KARAMAN", tahsisMW: 8, maksMW: 8, kesin: true, enlem: 37.36, boylam: 33.83 },
];

/** Koordinat kaynağı dağılımı (model/osm_konum.py çıktısından). Dürüstlük tablosunda gösterilir. */
export const KONUM_KAYNAK = { osm: 21, ilce: 1, toplam: 23, ulusalOsm: 667, ulusalToplam: 794 };

export const TRAFO_KAYNAK =
  "Kalan kapasite: TEİAŞ, \"2026 Yılı İçin Dağıtım Seviyesinden Transformatör Merkezi Bazlı … Kalan " +
  "Lisanssız Üretim Kapasiteleri\", 01.10.2026 resmî duyurusu (794 TM, 81 il, toplam 625,10 MWe). " +
  "Üst sınır: TEİAŞ Tahsis Edilen/Maksimum Kapasite tablosu. Tahsisli güç ikisinin farkı.";
/** Ulusal tablo tarihi — arayüzde ve dokümanda tek yerden okunur. */
export const TEIAS_TABLO_TARIHI = "01.10.2026";
