r"""Konya–Karaman'da kurulu güneş ve rüzgâr santrallerini OpenStreetMap'ten sayar.

Neden: Arayüzün dürüstlük tablosunda "tahsisli gücün tamamı GES kabul edilir"
satırı var ve gerekçesi olarak "bölge rüzgâr sınıfı düşük" deniyor. Bu cümlenin
şu an hiçbir kaynağı yok. Dürüstlük tablosunda kaynaksız bir iddia bulunması
tablonun kendi amacını zedeliyor; bu betik o cümleyi ölçülmüş bir sayıya
bağlamak için yazıldı.

NE YAPAR: Konya ve Karaman sınırları içindeki elektrik üretim tesislerini
OpenStreetMap'ten çeker (power=plant ve power=generator), kaynak türüne göre
ayırır, kurulu gücü etiketliyse toplar ve her tesisi en yakın trafo merkezine
atar.

NE YAPMAZ — ve bunu iddia etmez:
  - TEİAŞ'ın "tahsisli güç" sütununu birebir karşılamaz. O sütun kurulmuş VE
    tahsis edilip henüz kurulmamış gücü birlikte sayıyor; OSM yalnızca sahada
    var olanı görür.
  - Küçük çatı GES'lerini büyük ölçüde kaçırır; OSM'de haritalanmamışlardır.
  - "En yakın TM" ataması bir yaklaşımdır: gerçek bağlantı noktası fider
    şemasında, dağıtım şirketindedir.

Yani çıktısı tek bir soruyu güvenilir biçimde cevaplar: **bölgede rüzgâr var mı,
güneşe kıyasla ne ölçekte?** Bu, tahsisli gücü GES saymanın savunulabilir olup
olmadığını gösterir. Tam kırılım için EDAŞ fider verisi gerekir.

Çalıştırma:  python model/kaynak_kirilimi.py
Çıktı:       web/public/kaynak_kirilimi.json  +  ekrana özet
Atıf: OpenStreetMap katkıcıları, ODbL.
"""
import json
import math
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

OVERPASS = "https://overpass-api.de/api/interpreter"
ILLER = ("Konya", "Karaman")
# OSM'de üretim tesisi iki biçimde durur: bütün santral (power=plant) ve tekil
# birim (power=generator). İkisi de sorulur, sonra yinelenenler ayıklanır.
SORGU = """
[out:json][timeout:240];
(
  area["name"="Konya"]["admin_level"="4"];
  area["name"="Karaman"]["admin_level"="4"];
)->.bolge;
(
  node["power"="plant"](area.bolge);
  way["power"="plant"](area.bolge);
  relation["power"="plant"](area.bolge);
  node["power"="generator"](area.bolge);
  way["power"="generator"](area.bolge);
);
out center tags;
"""


def mesafe_km(a_lat: float, a_lon: float, b_lat: float, b_lon: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp, dl = math.radians(b_lat - a_lat), math.radians(b_lon - a_lon)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def guc_mw(etiket: dict):
    """OSM güç etiketini MW'a çevirir. '50 MW', '1200 kW', '0.5 MW' biçimleri."""
    for alan in ("plant:output:electricity", "generator:output:electricity"):
        ham = etiket.get(alan)
        if not ham:
            continue
        t = ham.strip().lower().replace(",", ".")
        try:
            if t.endswith("mw"):
                return float(t[:-2].strip())
            if t.endswith("kw"):
                return float(t[:-2].strip()) / 1000
            if t.endswith("gw"):
                return float(t[:-2].strip()) * 1000
            return float(t)          # birimsiz: MW varsayılır (OSM yaygın kullanımı)
        except ValueError:
            continue
    return None


def kaynak(etiket: dict) -> str:
    for alan in ("plant:source", "generator:source"):
        v = (etiket.get(alan) or "").lower()
        if "solar" in v or "photovoltaic" in v:
            return "gunes"
        if "wind" in v:
            return "ruzgar"
        if v:
            return v
    yontem = (etiket.get("generator:method") or "").lower()
    if "photovoltaic" in yontem:
        return "gunes"
    return "bilinmiyor"


# Alan sorgusunun gerçekten tuttuğunu sınayan ön sorgu. Bu olmadan, ad eşleşmesi
# tutmazsa Overpass HATA VERMEZ — sıfır sonuç döner ve betik bunu "bölgede hiç
# tesis yok" diye raporlar. Aradığımız cevap zaten "rüzgâr az" olduğu için böyle
# bir sahte sıfır fark edilmeden kanıt diye kullanılabilirdi. Bir kanıt üretmek
# için yazılmış betiğin yapabileceği en kötü hata bu; o yüzden önce alanı doğruluyoruz.
ALAN_SORGUSU = """
[out:json][timeout:60];
(
  area["name"="Konya"]["admin_level"="4"];
  area["name"="Karaman"]["admin_level"="4"];
);
out ids;
"""


def sor(sorgu: str, ne: str) -> list:
    veri = urllib.parse.urlencode({"data": sorgu}).encode()
    istek = urllib.request.Request(OVERPASS, data=veri,
                                   headers={"User-Agent": "esnek-baglanti/1.0 (akademik calisma)"})
    for deneme in range(3):
        try:
            with urllib.request.urlopen(istek, timeout=300) as r:
                return json.loads(r.read().decode("utf-8"))["elements"]
        except Exception as e:
            bekle = 30 * (deneme + 1)
            print(f"  Overpass hatası ({ne}): {e} — {bekle} sn sonra tekrar", file=sys.stderr)
            time.sleep(bekle)
    raise SystemExit(f"Overpass'tan veri alınamadı ({ne}).")


def cek() -> list:
    alanlar = sor(ALAN_SORGUSU, "il sınırları")
    if len(alanlar) < len(ILLER):
        raise SystemExit(
            f"İl sınırı bulunamadı: {len(alanlar)} alan döndü, {len(ILLER)} bekleniyordu.\n"
            "Sorgu başarısız olmuş olabilir; bu durumda sonuç 'bölgede tesis yok' gibi\n"
            "görünür ve YANLIŞ olur. OSM'de il adları değişmiş olabilir — kontrol edin:\n"
            "  https://overpass-turbo.eu  →  area[\"name\"=\"Konya\"][\"admin_level\"=\"4\"]; out ids;")
    print(f"  il sınırları doğrulandı ({len(alanlar)} alan)")
    time.sleep(2)   # Overpass'a nazik davran
    return sor(SORGU, "üretim tesisleri")


def main() -> None:
    klasor = Path(__file__).parent
    bolge = [t for t in json.loads((klasor / "trafo_konum.json").read_text(encoding="utf-8"))
             if t.get("il") in ("KONYA", "KARAMAN")]
    # Koordinatı bulunamamış TM'ler var (osm_konum.py bazılarını eşleştiremedi).
    # Bunlar "en yakın TM" hedefi olamaz; sessizce atlamak yerine sayıyı raporluyoruz.
    trafolar = [t for t in bolge if t.get("enlem") is not None and t.get("boylam") is not None]
    konumsuz = [t["tm"] for t in bolge if t not in trafolar]
    if not trafolar:
        raise SystemExit("trafo_konum.json içinde koordinatlı Konya/Karaman TM'si yok.")
    if konumsuz:
        print(f"  not: {len(konumsuz)} TM'nin koordinatı yok, atama dışı: {', '.join(konumsuz)}")

    print(f"OpenStreetMap'ten {' ve '.join(ILLER)} üretim tesisleri çekiliyor…")
    ogeler = cek()

    tesisler, gorulen = [], set()
    for o in ogeler:
        e = o.get("tags") or {}
        lat = o.get("lat") or (o.get("center") or {}).get("lat")
        lon = o.get("lon") or (o.get("center") or {}).get("lon")
        if lat is None or lon is None:
            continue
        # Aynı santral hem plant hem generator olarak dönebilir: konumla tekilleştir
        anahtar = (round(lat, 4), round(lon, 4), kaynak(e))
        if anahtar in gorulen:
            continue
        gorulen.add(anahtar)
        en_yakin = min(trafolar, key=lambda t: mesafe_km(lat, lon, t["enlem"], t["boylam"]))
        tesisler.append({
            "ad": e.get("name"), "kaynak": kaynak(e), "guc_MW": guc_mw(e),
            "enlem": round(lat, 5), "boylam": round(lon, 5),
            "en_yakin_TM": en_yakin["tm"],
            "TM_uzakligi_km": round(mesafe_km(lat, lon, en_yakin["enlem"], en_yakin["boylam"]), 1),
            "osm": f"{o['type']}/{o['id']}",
        })

    def topla(tur):
        alt = [t for t in tesisler if t["kaynak"] == tur]
        guclu = [t for t in alt if t["guc_MW"]]
        return {
            "tesis_sayisi": len(alt),
            "gucu_etiketli_tesis": len(guclu),
            "etiketli_toplam_MW": round(sum(t["guc_MW"] for t in guclu), 1),
        }

    gunes, ruzgar = topla("gunes"), topla("ruzgar")
    diger = sorted({t["kaynak"] for t in tesisler} - {"gunes", "ruzgar"})

    # Güneşi sıfır çıkan bir sorgu, Konya için fiziksel olarak inandırıcı değil:
    # bölgede Karapınar YEKA dahil büyük sahalar var. Böyle bir sonuç bulgu değil,
    # sorgunun bozulduğunun işaretidir. Rüzgârın sıfır çıkması ise gerçek olabilir.
    supheli = gunes["tesis_sayisi"] == 0
    if supheli:
        print("\nUYARI: Hiç güneş santrali bulunamadı. Konya'da büyük GES sahaları olduğu için",
              file=sys.stderr)
        print("bu sonuç bir bulgu değil, sorgunun çalışmadığının işareti olabilir.", file=sys.stderr)
        print("Sonucu dürüstlük tablosuna İŞLEMEYİN; önce overpass-turbo.eu'da sınayın.",
              file=sys.stderr)

    rapor = {
        "ne": "Konya–Karaman'da OpenStreetMap'te haritalanmış elektrik üretim tesisleri",
        "kaynak": "OpenStreetMap katkıcıları (ODbL), Overpass API",
        "iller": list(ILLER),
        "tarih_notu": "OSM sürekli güncellenir; bu sayım betiğin çalıştırıldığı ana aittir.",
        "gunes": gunes,
        "ruzgar": ruzgar,
        "diger_kaynaklar": diger,
        "toplam_tesis": len(tesisler),
        "supheli_sonuc": supheli,
        "atama_yapilan_TM": len(trafolar),
        "koordinati_olmayan_TM": konumsuz,
        "ne_kanitlar": (
            "Bölgede rüzgâr santralinin güneşe kıyasla hangi ölçekte olduğunu gösterir. "
            "Tahsisli gücün GES kabul edilmesinin savunulabilir olup olmadığı sorusuna "
            "kaynaklı bir cevap verir."),
        "ne_kanitlamaz": [
            "TEİAŞ'ın tahsisli güç sütununu birebir karşılamaz (kurulmamış tahsisler dahil değil)",
            "küçük çatı GES'leri OSM'de büyük ölçüde haritalanmamıştır",
            "'en yakın TM' bir yaklaşımdır; gerçek bağlantı noktası fider şemasındadır",
        ],
        "tesisler": sorted(tesisler, key=lambda t: -(t["guc_MW"] or 0)),
    }
    cikti = klasor.parent / "web" / "public" / "kaynak_kirilimi.json"
    cikti.write_text(json.dumps(rapor, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"\nToplam haritalanmış tesis: {len(tesisler)}")
    print(f"  Güneş : {gunes['tesis_sayisi']:>4} tesis · gücü etiketli {gunes['gucu_etiketli_tesis']:>3} "
          f"· toplam {gunes['etiketli_toplam_MW']} MW")
    print(f"  Rüzgâr: {ruzgar['tesis_sayisi']:>4} tesis · gücü etiketli {ruzgar['gucu_etiketli_tesis']:>3} "
          f"· toplam {ruzgar['etiketli_toplam_MW']} MW")
    if diger:
        print(f"  Diğer kaynak etiketleri: {', '.join(diger)}")
    print(f"\nYazıldı: {cikti}")
    print("\nBu çıktıyı Özlem'e gönder: dürüstlük tablosundaki kaynaksız cümle")
    print("bu sayılarla değiştirilecek (ya da sayılar desteklemiyorsa yumuşatılacak).")


if __name__ == "__main__":
    main()
