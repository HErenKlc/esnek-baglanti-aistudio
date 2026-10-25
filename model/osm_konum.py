"""Trafo merkezlerine GERÇEK koordinat atar (OpenStreetMap + Open-Meteo geocoding).

Neden: Uygulamada şu an koordinatlar ilçe merkezinin yaklaşık yeri. Hava verisi
santralin kurulacağı noktadan gelmeli. OSM'de Türkiye iletim şebekesi
power=substation etiketiyle haritalı ve açık veri.

Yöntem:
  1. Overpass'tan Türkiye'deki yüksek gerilim trafo sahalarını çek (>=66 kV).
  2. TM adını normalize edip OSM adlarıyla eşleştir (il kontrolü ile).
  3. Eşleşmeyen TM için Open-Meteo geocoding'den ilçe merkezi al (eski davranış).
  4. Her satıra kaynak yaz: "osm" veya "ilce". Dürüstlük tablosu bunu gösterecek.

Girdi:  teias_kalan_01102026.csv  (il,tm,kalan_MWe)  — pdf_tablo.py üretir
Çıktı:  trafo_konum.json          (il, tm, enlem, boylam, kaynak, osm_ad, mesafe_km)

Çalıştırma:  python osm_konum.py
Gereken: internet. Hesap GEREKMİYOR. Overpass'a nazik davranılır (tek sorgu + bekleme).
Lisans: OpenStreetMap katkıcıları, ODbL. Open-Meteo geocoding, CC BY 4.0.
"""
import csv
import json
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from difflib import SequenceMatcher
from math import asin, cos, radians, sin, sqrt
from pathlib import Path

# İl merkezlerinin yaklaşık koordinatı. Eşleşen OSM sahası bu noktadan çok uzaksa
# (başka ilde) eşleşme reddedilir — isim benzerliği tek başına yanıltıyor:
# "Ceyhan 2 TM" (Adana) ile Kocaeli'ndeki "Trafo-2", "Kalkan TM" (Antalya) ile
# Rize'deki "Kalkandere TM" gibi.
IL_MERKEZ = {
    "ADANA": (37.00, 35.32), "ADIYAMAN": (37.76, 38.28), "AFYONKARAHİSAR": (38.76, 30.54),
    "AĞRI": (39.72, 43.05), "AMASYA": (40.65, 35.83), "ANKARA": (39.93, 32.86),
    "ANTALYA": (36.90, 30.70), "ARTVİN": (41.18, 41.82), "AYDIN": (37.85, 27.84),
    "BALIKESİR": (39.65, 27.89), "BİLECİK": (40.14, 29.98), "BİNGÖL": (38.88, 40.50),
    "BİTLİS": (38.40, 42.11), "BOLU": (40.74, 31.61), "BURDUR": (37.72, 30.29),
    "BURSA": (40.19, 29.06), "ÇANAKKALE": (40.15, 26.41), "ÇANKIRI": (40.60, 33.62),
    "ÇORUM": (40.55, 34.95), "DENİZLİ": (37.78, 29.09), "DİYARBAKIR": (37.91, 40.24),
    "EDİRNE": (41.68, 26.56), "ELAZIĞ": (38.68, 39.22), "ERZİNCAN": (39.75, 39.49),
    "ERZURUM": (39.90, 41.27), "ESKİŞEHİR": (39.78, 30.52), "GAZİANTEP": (37.07, 37.38),
    "GİRESUN": (40.91, 38.39), "GÜMÜŞHANE": (40.46, 39.48), "HAKKARİ": (37.57, 43.74),
    "HATAY": (36.20, 36.16), "ISPARTA": (37.76, 30.55), "MERSİN": (36.80, 34.63),
    "İSTANBUL": (41.01, 28.98), "İZMİR": (38.42, 27.14), "KARS": (40.60, 43.09),
    "KASTAMONU": (41.38, 33.78), "KAYSERİ": (38.73, 35.49), "KIRKLARELİ": (41.74, 27.22),
    "KIRŞEHİR": (39.15, 34.16), "KOCAELİ": (40.77, 29.95), "KONYA": (37.87, 32.48),
    "KÜTAHYA": (39.42, 29.98), "MALATYA": (38.35, 38.31), "MANİSA": (38.61, 27.43),
    "KAHRAMANMARAŞ": (37.58, 36.93), "MARDİN": (37.31, 40.74), "MUĞLA": (37.22, 28.36),
    "MUŞ": (38.73, 41.49), "NEVŞEHİR": (38.62, 34.71), "NİĞDE": (37.97, 34.68),
    "ORDU": (40.98, 37.88), "RİZE": (41.02, 40.52), "SAKARYA": (40.78, 30.40),
    "SAMSUN": (41.29, 36.33), "SİİRT": (37.93, 41.94), "SİNOP": (42.03, 35.15),
    "SİVAS": (39.75, 37.02), "TEKİRDAĞ": (40.98, 27.51), "TOKAT": (40.31, 36.55),
    "TRABZON": (41.00, 39.72), "TUNCELİ": (39.11, 39.55), "ŞANLIURFA": (37.17, 38.79),
    "UŞAK": (38.68, 29.41), "VAN": (38.49, 43.38), "YOZGAT": (39.82, 34.81),
    "ZONGULDAK": (41.46, 31.79), "AKSARAY": (38.37, 34.03), "BAYBURT": (40.26, 40.23),
    "KARAMAN": (37.18, 33.22), "KIRIKKALE": (39.85, 33.52), "BATMAN": (37.88, 41.13),
    "ŞIRNAK": (37.52, 42.46), "BARTIN": (41.64, 32.34), "ARDAHAN": (41.11, 42.70),
    "IĞDIR": (39.92, 44.04), "YALOVA": (40.65, 29.27), "KARABÜK": (41.20, 32.63),
    "KİLİS": (36.72, 37.12), "OSMANİYE": (37.07, 36.25), "DÜZCE": (40.84, 31.16),
}
# İl merkezine azami uzaklık (km). Türkiye'nin en geniş ili bile bu yarıçapa sığar.
IL_YARICAP_KM = 200
# İsim benzerliği eşiği. Düşük tutmak "2", "OSB" gibi ortak parçalarla yanlış eşleşme üretiyor.
ESIK = 0.93

OVERPASS = "https://overpass-api.de/api/interpreter"
GEOCODE = "https://geocoding-api.open-meteo.com/v1/search"
GIRDI = Path(__file__).with_name("teias_kalan_01102026.csv")
CIKTI = Path(__file__).with_name("trafo_konum.json")

SORGU = """
[out:json][timeout:180];
area["ISO3166-1"="TR"][admin_level=2]->.tr;
(
  node["power"="substation"](area.tr);
  way["power"="substation"](area.tr);
  relation["power"="substation"](area.tr);
);
out center tags;
"""


def sade(s: str) -> str:
    """Karşılaştırma için: Türkçe harfleri sadeleştir, TM/trafo eklerini at."""
    s = s.replace("İ", "i").replace("I", "i").replace("ı", "i").lower()
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"\b(tm|trafo|merkezi|merkez|substation|elektrik|ges|res|osb|havza)\b", " ", s)
    s = re.sub(r"\(.*?\)", " ", s)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return " ".join(s.split())


def mesafe(a1, b1, a2, b2) -> float:
    r = 6371.0
    da, db = radians(a2 - a1), radians(b2 - b1)
    h = sin(da / 2) ** 2 + cos(radians(a1)) * cos(radians(a2)) * sin(db / 2) ** 2
    return 2 * r * asin(sqrt(h))


def getir(url, veri=None, deneme=3):
    for i in range(deneme):
        try:
            istek = urllib.request.Request(
                url, data=veri.encode() if veri else None,
                headers={"User-Agent": "roomforsun/1.0 (Climathon 2026; akademik)"})
            with urllib.request.urlopen(istek, timeout=240) as y:
                return json.loads(y.read().decode("utf-8"))
        except Exception as e:
            if i == deneme - 1:
                raise
            print(f"  tekrar deneniyor ({e})")
            time.sleep(10 * (i + 1))


def osm_cek():
    print("Overpass'tan Türkiye trafo sahaları çekiliyor (1-3 dakika sürebilir)…")
    c = getir(OVERPASS, "data=" + urllib.parse.quote(SORGU))
    kayit = []
    for e in c.get("elements", []):
        t = e.get("tags", {})
        ad = t.get("name") or t.get("name:tr") or t.get("operator:ref") or ""
        if not ad:
            continue
        gerilim = t.get("voltage", "")
        try:  # ";" ile ayrılmış olabilir: "154000;34500"
            en_yuksek = max(int(v) for v in re.findall(r"\d+", gerilim)) if gerilim else 0
        except ValueError:
            en_yuksek = 0
        if en_yuksek and en_yuksek < 66000:
            continue  # dağıtım seviyesi; bizim TM'ler 154/400 kV
        m = e.get("center") or e
        if m.get("lat") is None:
            continue
        kayit.append({"ad": ad, "sade": sade(ad), "enlem": m["lat"], "boylam": m["lon"],
                      "gerilim": en_yuksek})
    print(f"  {len(kayit)} trafo sahası (adı olan, >=66 kV)")
    return kayit


def ilce_konum(ad: str, il: str, onbellek: dict):
    """Open-Meteo geocoding: TM adından ilçe/yer araması (yedek yöntem)."""
    anahtar = f"{ad}|{il}"
    if anahtar in onbellek:
        return onbellek[anahtar]
    sorgu = re.sub(r"\b(TM|OSB|HAVZA|HES)\b", " ", ad, flags=re.I).strip() or il
    try:
        s = getir(f"{GEOCODE}?" + urllib.parse.urlencode(
            {"name": sorgu, "count": 10, "language": "tr", "countryCode": "TR"}))
        for r in s.get("results", []):
            if sade(r.get("admin1", "")) == sade(il) or sade(r.get("name", "")) == sade(il):
                onbellek[anahtar] = (r["latitude"], r["longitude"], r.get("name", ""))
                break
        else:
            r = (s.get("results") or [None])[0]
            onbellek[anahtar] = (r["latitude"], r["longitude"], r.get("name", "")) if r else None
    except Exception as e:
        print(f"  ! {ad}: geocoding hatası {e}")
        onbellek[anahtar] = None
    time.sleep(0.3)  # Open-Meteo'ya nazik ol
    return onbellek[anahtar]


def main():
    if not GIRDI.exists():
        sys.exit(f"{GIRDI.name} yok. Önce pdf_tablo.py çalıştır.")
    trafolar = list(csv.DictReader(GIRDI.open(encoding="utf-8")))
    print(f"{len(trafolar)} trafo merkezi okundu")

    osm = osm_cek()
    onbellek, sonuc, sayac = {}, [], {"osm": 0, "ilce": 0, "yok": 0}

    uzak = 0
    for t in trafolar:
        hedef = sade(t["tm"])
        merkez = IL_MERKEZ.get(t["il"])
        en_iyi, en_puan = None, 0.0
        for o in osm:
            # İl kontrolü ÖNCE: başka ildeki bir saha hiç yarışmaya girmesin.
            if merkez and mesafe(merkez[0], merkez[1], o["enlem"], o["boylam"]) > IL_YARICAP_KM:
                continue
            p = SequenceMatcher(None, hedef, o["sade"]).ratio()
            # Alt dize kuralı yalnızca ayırt edici uzunlukta adlar için.
            if len(hedef) >= 5 and len(o["sade"]) >= 5 and (hedef in o["sade"] or o["sade"] in hedef):
                p = max(p, 0.95)
            if p > en_puan:
                en_iyi, en_puan = o, p
        kayit = {"il": t["il"], "tm": t["tm"], "kalan_MWe": float(t["kalan_MWe"])}
        if en_iyi and en_puan >= ESIK:
            kayit.update(enlem=round(en_iyi["enlem"], 5), boylam=round(en_iyi["boylam"], 5),
                         kaynak="osm", osm_ad=en_iyi["ad"], osm_gerilim=en_iyi["gerilim"],
                         benzerlik=round(en_puan, 3),
                         il_merkezine_km=round(mesafe(merkez[0], merkez[1], en_iyi["enlem"],
                                                      en_iyi["boylam"]), 1) if merkez else None)
            sayac["osm"] += 1
        else:
            k = ilce_konum(t["tm"], t["il"], onbellek)
            if k and merkez and mesafe(merkez[0], merkez[1], k[0], k[1]) > IL_YARICAP_KM:
                k = None  # geocoding de başka ile düştü
                uzak += 1
            if k:
                kayit.update(enlem=round(k[0], 5), boylam=round(k[1], 5), kaynak="ilce",
                             yer=k[2], benzerlik=round(en_puan, 3),
                             il_merkezine_km=round(mesafe(merkez[0], merkez[1], k[0], k[1]), 1)
                             if merkez else None)
                sayac["ilce"] += 1
            else:
                kayit.update(kaynak="yok")
                sayac["yok"] += 1
        sonuc.append(kayit)
        if len(sonuc) % 50 == 0:
            print(f"  {len(sonuc)}/{len(trafolar)} … osm={sayac['osm']} ilce={sayac['ilce']}")

    CIKTI.write_text(json.dumps(sonuc, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nYazıldı: {CIKTI.name}")
    print(f"  OSM'den gerçek konum : {sayac['osm']}")
    print(f"  ilçe merkezi yaklaşık: {sayac['ilce']}")
    print(f"  konum bulunamadı     : {sayac['yok']}")
    print(f"  (il dışına düştüğü için elenen geocoding sonucu: {uzak})")
    print(f"  kural: benzerlik ≥ {ESIK}, il merkezine ≤ {IL_YARICAP_KM} km")


if __name__ == "__main__":
    main()
