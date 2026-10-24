"""İki tarihli TEİAŞ tablosundan ulusal özeti üretir (web/public/ulusal.json).

Bu dosya HESAP içermez; doğrudan resmî tablonun fotoğrafıdır. Uygulamadaki
"Türkiye tablosu" bölümü bunu okur. Esnek bağlantı hesabı ayrı katman.

Çalıştırma:  python ulusal_ozet.py
Girdi: teias_kalan_16072026.csv, teias_kalan_01102026.csv  (pdf_tablo.py üretir)
"""
import csv
import json
from collections import Counter, defaultdict
from pathlib import Path

KLASOR = Path(__file__).parent
ESKI = KLASOR / "teias_kalan_16072026.csv"
YENI = KLASOR / "teias_kalan_01102026.csv"
CIKTI = KLASOR.parent / "web" / "public" / "ulusal.json"
DOLU_ESIK = 0.005  # MWe; TEİAŞ tabloları 2 ondalık basamak veriyor


def oku(yol):
    return {(r["il"], r["tm"]): float(r["kalan_MWe"])
            for r in csv.DictReader(yol.open(encoding="utf-8"))}


def main():
    eski, yeni = oku(ESKI), oku(YENI)
    iller = defaultdict(lambda: {"tm": 0, "dolu": 0, "kalan": 0.0})
    for (il, _), v in yeni.items():
        d = iller[il]
        d["tm"] += 1
        d["kalan"] += v
        if v < DOLU_ESIK:
            d["dolu"] += 1

    il_listesi = sorted(
        ({"il": il, **{k: (round(v, 2) if isinstance(v, float) else v) for k, v in d.items()},
          "doluOran": round(d["dolu"] / d["tm"], 3)} for il, d in iller.items()),
        key=lambda x: (-x["doluOran"], -x["tm"]))

    ortak = set(eski) & set(yeni)
    ozet = {
        "tarih": "2026-10-01",
        "oncekiTarih": "2026-07-16",
        "kaynak": ("TEİAŞ, \"2026 Yılı İçin Dağıtım Seviyesinden Transformatör Merkezi Bazlı "
                   "Tahsis Edilen Güneş ve Rüzgar Kaynaklı Kalan Lisanssız Üretim Kapasiteleri\", "
                   "teias.gov.tr/duyurular"),
        "tmSayisi": len(yeni),
        "ilSayisi": len(iller),
        "toplamKalanMWe": round(sum(yeni.values()), 2),
        "doluTM": sum(1 for v in yeni.values() if v < DOLU_ESIK),
        "oncekiToplamMWe": round(sum(eski.values()), 2),
        "oncekiDoluTM": sum(1 for v in eski.values() if v < DOLU_ESIK),
        "oncekiTMSayisi": len(eski),
        "azalanTM": sum(1 for k in ortak if yeni[k] < eski[k] - DOLU_ESIK),
        "artanTM": sum(1 for k in ortak if yeni[k] > eski[k] + DOLU_ESIK),
        "tamamenDoluIl": [x["il"] for x in il_listesi if x["dolu"] == x["tm"]],
        "iller": il_listesi,
    }
    ozet["degisimMWe"] = round(ozet["toplamKalanMWe"] - ozet["oncekiToplamMWe"], 2)
    ozet["degisimYuzde"] = round(100 * ozet["degisimMWe"] / ozet["oncekiToplamMWe"], 1)

    CIKTI.parent.mkdir(parents=True, exist_ok=True)
    CIKTI.write_text(json.dumps(ozet, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{ozet['tmSayisi']} TM · {ozet['ilSayisi']} il · {ozet['toplamKalanMWe']} MWe "
          f"({ozet['degisimYuzde']:+}% / {ozet['oncekiTarih']})")
    print(f"tamamen dolu: {ozet['doluTM']} TM, {len(ozet['tamamenDoluIl'])} il")
    print(f"Yazıldı: {CIKTI}")


if __name__ == "__main__":
    main()
