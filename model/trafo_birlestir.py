"""İki resmî kaynağı birleştirip uygulamanın trafo veri katmanını üretir.

Sorun: TEİAŞ'ın TM bazlı PDF'i yalnızca KALAN kapasiteyi veriyor; esnek bağlantı
hesabı ÜST SINIRA dayanıyor (toplam üretim TM sınırını aşmasın kuralı). Üst sınır
yalnızca TEİAŞ'ın "Tahsis Edilen / Maksimum Kapasite" tablosunda var ve o tablo
tarihsiz, güncelliği düşük.

Çözüm, her sayıyı en güvenilir kaynağından almak:
  üst sınır  ← maks tablosu. Trafo gücü ve hat kapasitesi teknik sınırdır, yavaş değişir.
  kalan      ← TEİAŞ'ın tarihli PDF'i (resmî, güncel).
  tahsisli   ← üst sınır − kalan. Türetilmiş; iki kaynağın tutarlı olduğu yer.

Tutarsızlık: kalan > üst sınır − tahsisli ise, üst sınır eskimiştir (TM güçlendirilmiş
ya da kota artmış). O satırda üst sınır = eski tahsisli + güncel kalan alınır ve
"ust_sinir_duzeltildi" işaretlenir.

Girdi : teias_maks_tablosu.xlsx     (TM, tahsis edilen, maksimum, il)
        teias_kalan_01102026.csv    (il, tm, kalan_MWe)  ← pdf_tablo.py üretir
Çıktı : trafolar_birlesik.csv       (il, tm, tahsis_MW, maks_MW, kalan_MW, kaynak, kesin)

Çalıştırma:  python trafo_birlestir.py
"""
import csv
import re
import sys
import unicodedata
from pathlib import Path

KLASOR = Path(__file__).parent
MAKS = KLASOR / "teias_maks_tablosu.xlsx"
KALAN = KLASOR / "teias_kalan_01102026.csv"
CIKTI = KLASOR / "trafolar_birlesik.csv"


def sade(s: str) -> str:
    s = (s or "").replace("İ", "i").replace("I", "i").replace("ı", "i").lower()
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"\b(tm|trafo|merkezi)\b", " ", s)
    s = re.sub(r"\(.*?\)", " ", s)
    return " ".join(re.sub(r"[^a-z0-9]+", " ", s).split())


def sayi(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    m = re.search(r"[\d.,]+", str(v))
    return float(m.group().replace(".", "").replace(",", ".")) if m else None


def maks_oku():
    try:
        import openpyxl
    except ImportError:
        sys.exit("openpyxl gerekli:  pip install openpyxl")
    sayfa = openpyxl.load_workbook(MAKS, data_only=True).active
    tablo = {}
    for satir in list(sayfa.iter_rows(values_only=True))[2:]:  # 2 satır başlık
        ad, tahsis, ust = satir[0], sayi(satir[1]), sayi(satir[2])
        il = next((str(x).strip() for x in satir[3:]
                   if x and str(x).strip() not in ("*", "")), "")
        if not ad or ust is None:
            continue
        yildiz = "*" in "".join(str(x) for x in satir[1:4] if x)
        tablo[sade(ad)] = {"ad": str(ad).strip(), "il": il.upper(), "tahsis": tahsis or 0.0,
                           "maks": ust, "kesin": not yildiz}
    return tablo


def main():
    if not MAKS.exists() or not KALAN.exists():
        sys.exit(f"{MAKS.name} ve {KALAN.name} aynı klasörde olmalı.")
    maks = maks_oku()
    kalan = {}
    for r in csv.DictReader(KALAN.open(encoding="utf-8")):
        kalan[sade(r["tm"])] = {"il": r["il"], "ad": r["tm"], "kalan": float(r["kalan_MWe"])}

    satirlar, duzeltilen = [], 0
    for anahtar, m in sorted(maks.items()):
        k = kalan.get(anahtar)
        if k is None:
            # Güncel tabloda yok: TEİAŞ notuna göre ya talep kalmamış ya ad değişmiş.
            satirlar.append({"il": m["il"], "tm": m["ad"], "tahsis_MW": round(m["tahsis"], 2),
                             "maks_MW": round(m["maks"], 2),
                             "kalan_MW": round(max(0.0, m["maks"] - m["tahsis"]), 2),
                             "kaynak": "yalniz_maks_tablosu", "kesin": int(m["kesin"])})
            continue
        ust = m["maks"]
        kaynak = "maks+teias_01102026"
        if k["kalan"] > ust - m["tahsis"] + 0.01:  # üst sınır eskimiş
            ust = m["tahsis"] + k["kalan"]
            kaynak = "ust_sinir_duzeltildi"
            duzeltilen += 1
        satirlar.append({"il": k["il"] or m["il"], "tm": k["ad"],
                         "tahsis_MW": round(max(0.0, ust - k["kalan"]), 2),
                         "maks_MW": round(ust, 2), "kalan_MW": round(k["kalan"], 2),
                         "kaynak": kaynak, "kesin": int(m["kesin"])})

    with CIKTI.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, ["il", "tm", "tahsis_MW", "maks_MW", "kalan_MW", "kaynak", "kesin"])
        w.writeheader()
        w.writerows(satirlar)

    eslesen = sum(1 for s in satirlar if s["kaynak"] != "yalniz_maks_tablosu")
    print(f"maks tablosu TM={len(maks)} · TEİAŞ güncel TM={len(kalan)}")
    print(f"birleşen={eslesen} · yalnız maks tablosunda={len(satirlar) - eslesen}")
    print(f"üst sınırı düzeltilen={duzeltilen}")
    print(f"toplam üst sınır={sum(s['maks_MW'] for s in satirlar):.1f} MW · "
          f"güncel kalan={sum(s['kalan_MW'] for s in satirlar):.1f} MW")
    print(f"Yazıldı: {CIKTI.name}")


if __name__ == "__main__":
    main()
