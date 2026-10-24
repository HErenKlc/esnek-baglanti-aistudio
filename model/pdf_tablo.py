"""TEİAŞ'ın TM bazlı kalan kapasite PDF'ini tabloya çevirir.

Kaynak: TEİAŞ Duyurular → "… Transformatör Merkezi Bazlı Tahsis Edilen Güneş ve
Rüzgar Kaynaklı Kalan Lisanssız Üretim Kapasiteleri (TARİH)". Her ayın başında
yenilenir; iki farklı tarihli dosya tükenme hızını da verir.

Doğrulama: üretilen toplam, TEİAŞ'ın duyurduğu toplamla eşleşmeli
(16.07.2026 → 833,59 MWe · 01.10.2026 → 625,10 MWe).

Gereken: poppler-utils (pdftotext).  Ubuntu: sudo apt install poppler-utils
         Windows: https://github.com/oschwartz10612/poppler-windows → PATH'e ekle
Çalıştırma:  python pdf_tablo.py dosya.pdf [cikti.csv]
             python pdf_tablo.py eski.pdf yeni.pdf --karsilastir
"""
import csv
import re
import subprocess
import sys
from collections import OrderedDict
from pathlib import Path

IL81 = set("""ADANA ADIYAMAN AFYONKARAHİSAR AĞRI AMASYA ANKARA ANTALYA ARTVİN AYDIN
BALIKESİR BİLECİK BİNGÖL BİTLİS BOLU BURDUR BURSA ÇANAKKALE ÇANKIRI ÇORUM DENİZLİ
DİYARBAKIR EDİRNE ELAZIĞ ERZİNCAN ERZURUM ESKİŞEHİR GAZİANTEP GİRESUN GÜMÜŞHANE
HAKKARİ HATAY ISPARTA MERSİN İSTANBUL İZMİR KARS KASTAMONU KAYSERİ KIRKLARELİ
KIRŞEHİR KOCAELİ KONYA KÜTAHYA MALATYA MANİSA KAHRAMANMARAŞ MARDİN MUĞLA MUŞ
NEVŞEHİR NİĞDE ORDU RİZE SAKARYA SAMSUN SİİRT SİNOP SİVAS TEKİRDAĞ TOKAT TRABZON
TUNCELİ ŞANLIURFA UŞAK VAN YOZGAT ZONGULDAK AKSARAY BAYBURT KARAMAN KIRIKKALE
BATMAN ŞIRNAK BARTIN ARDAHAN IĞDIR YALOVA KARABÜK KİLİS OSMANİYE DÜZCE""".split())

KAPASITE = re.compile(r"^(.*?)\s{2,}([\d.]+,\d+)\s*$")


def metin(pdf: Path) -> str:
    txt = pdf.with_suffix(".txt")
    try:
        subprocess.run(["pdftotext", "-layout", str(pdf), str(txt)], check=True,
                       capture_output=True)
    except FileNotFoundError:
        sys.exit("pdftotext bulunamadı. poppler-utils kur (dosya başındaki nota bak).")
    return txt.read_text(encoding="utf-8")


def tabloya(ham: str) -> "OrderedDict[tuple, float]":
    """Bir TM birden çok satıra yayılabilir ve adı bloğun ORTASINDA olabilir:

        ADANA                      Toroslar EDAŞ   0,00
                     KOZAN TM  Tek                        <- ad burada, kapasitesiz
        ADANA                      Kozan OSB       0,00

    Bu yüzden adsız kapasite satırları bekletilir. Yalnızca ad taşıyan satır
    gelince bekleyenler O ada yazılır (ad bloğun ortasındaydı); ad + kapasite
    taşıyan satır gelince bekleyenler bir ÖNCEKİ ada, satırın kendi kapasitesi
    yeni ada yazılır.
    """
    tm = OrderedDict()
    ili = {}
    il = aktif = None
    bekleyen = []

    def yaz(ad, deger):
        if ad is None:
            return
        anahtar = (ili.get(ad) or "", ad)
        tm[anahtar] = tm.get(anahtar, 0.0) + deger

    for satir in ham.split("\n"):
        duz = satir.rstrip()
        if not duz.strip():
            continue
        m = KAPASITE.match(duz)
        parcalar = re.split(r"\s{2,}", (m.group(1) if m else duz).strip())
        if parcalar and parcalar[0].strip() in IL81:
            il = parcalar[0].strip()
        ad = next((p.strip() for p in parcalar if p.strip().endswith("TM")), None)
        deger = float(m.group(2).replace(".", "").replace(",", ".")) if m else None

        if ad:
            ili.setdefault(ad, il)
            if deger is None:
                aktif = ad
                for d in bekleyen:
                    yaz(aktif, d)
            else:
                for d in bekleyen:
                    yaz(aktif, d)
                aktif = ad
                yaz(aktif, deger)
            bekleyen = []
        elif deger is not None:
            bekleyen.append(deger)

    for d in bekleyen:
        yaz(aktif, d)
    return tm


def ozet(tm):
    dolu = sum(1 for v in tm.values() if v < 0.005)
    return (f"TM={len(tm)} il={len({i for i, _ in tm})} "
            f"toplam={sum(tm.values()):.2f} MWe dolu={dolu} (%{100 * dolu / len(tm):.0f})")


def main():
    arg = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not arg:
        sys.exit(__doc__)
    if "--karsilastir" in sys.argv and len(arg) == 2:
        eski, yeni = (tabloya(metin(Path(a))) for a in arg)
        print(f"{Path(arg[0]).name}: {ozet(eski)}")
        print(f"{Path(arg[1]).name}: {ozet(yeni)}")
        ortak = set(eski) & set(yeni)
        print(f"ortak TM={len(ortak)} · yeni={len(set(yeni) - set(eski))} "
              f"· çıkan={len(set(eski) - set(yeni))}")
        print(f"kapasitesi azalan={sum(1 for k in ortak if yeni[k] < eski[k] - 0.005)} "
              f"· artan={sum(1 for k in ortak if yeni[k] > eski[k] + 0.005)}")
        print(f"toplam değişim={sum(yeni.values()) - sum(eski.values()):+.2f} MWe")
        return

    pdf = Path(arg[0])
    tm = tabloya(metin(pdf))
    if not tm:
        sys.exit("Tablo okunamadı. PDF metin katmanı taranmış olabilir.")
    cikti = Path(arg[1]) if len(arg) > 1 else pdf.with_suffix(".csv")
    with cikti.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["il", "tm", "kalan_MWe"])
        for (il, ad), v in tm.items():
            w.writerow([il, ad, round(v, 3)])
    print(ozet(tm))
    print(f"Yazıldı: {cikti.name}")
    print("Toplamı TEİAŞ duyurusundaki rakamla karşılaştır; tutmuyorsa okuma hatalıdır.")


if __name__ == "__main__":
    main()
