r"""EPİAŞ Şeffaflık Platformu'ndan 2016'dan bugüne saatlik gerçek zamanlı tüketimi çeker.

Neden: Yük modeli şu an 2022-2025 (4 yıl) ile çalışıyor. 2016-2025 (10 yıl) ile
  - bayramların yılın farklı mevsimlerine denk geldiği yıllar öğrenilir (Ramazan bayramı her yıl ~11 gün öne kayar;
    öğle saatinde düşük yük ve yüksek güneş en çok bahar bayramlarında çakışır),
  - geri test 2 yıldan 8 yıla çıkar (her yıl, kendisini görmemiş modelle sınanır).

Gerekenler (bir kez):
  1. Ücretsiz EPİAŞ Şeffaflık hesabı: https://kayit.epias.com.tr/epias-transparency-platform-registration-form
  2. pip install "eptr2[allextras]"
  3. .env dosyası (model/ içinde ya da proje kökünde; betik ikisine de bakar):
        EPTR_USERNAME=sifreyle-giris-yaptiginiz-kullanici-adi
        EPTR_PASSWORD=sifre
     Windows'ta Notepad dosyayı ".env.txt" diye kaydedebilir; betik onu da kabul eder.
     Sorunsuz yol, PowerShell'de:
        "EPTR_USERNAME=kullanici`nEPTR_PASSWORD=sifre" | Set-Content model\.env -Encoding utf8
Çalıştırma:  python epias_cek.py            (2016-01-01'den geçen yılın sonuna kadar)
             python epias_cek.py 2018 2025  (yıl aralığı)
Sonra:       python train.py                (yeni dosyayı otomatik bulur ve kullanır)

Lisans/atıf: EPİAŞ Şeffaflık Platformu verisi, atıfla kullanılır (seffaflik.epias.com.tr/about/about).
"""
import sys
import time
from datetime import date
from pathlib import Path

import pandas as pd


def kimlik_yukle() -> str:
    """.env'i betiğin klasöründe ve proje kökünde arar; Notepad'in ".env.txt"ini de kabul eder.

    eptr2'nin use_dotenv'i yalnızca çalışma dizinine bakıyor, bu yüzden dosyayı kendimiz
    okuyup ortam değişkenlerine yazıyoruz — betik hangi klasörden çalıştırılırsa çalıştırılsın.
    """
    import os
    klasor = Path(__file__).parent
    adaylar = [klasor / ".env", klasor / ".env.txt", klasor.parent / ".env", klasor.parent / ".env.txt"]
    for dosya in adaylar:
        if not dosya.exists():
            continue
        for satir in dosya.read_text(encoding="utf-8-sig").splitlines():
            satir = satir.strip()
            if not satir or satir.startswith("#") or "=" not in satir:
                continue
            ad, _, deger = satir.partition("=")
            os.environ.setdefault(ad.strip(), deger.strip().strip('"').strip("'"))
        if os.environ.get("EPTR_USERNAME") and os.environ.get("EPTR_PASSWORD"):
            return str(dosya)
    aranan = "\n  ".join(str(d) for d in adaylar)
    raise SystemExit(
        "EPTR_USERNAME ve EPTR_PASSWORD bulunamadı. Şu yollara bakıldı:\n  " + aranan +
        "\n\nPowerShell'de oluşturmak için (proje kökünde):\n"
        '  "EPTR_USERNAME=kullanici`nEPTR_PASSWORD=sifre" | Set-Content model\\.env -Encoding utf8'
    )


def aylik_parcalar(bas_yil: int, son_yil: int):
    for y in range(bas_yil, son_yil + 1):
        for a in range(1, 13):
            bas = pd.Timestamp(year=y, month=a, day=1)
            son = (bas + pd.offsets.MonthEnd(0))
            yield bas.strftime("%Y-%m-%d"), son.strftime("%Y-%m-%d")


def sutunlari_bul(df: pd.DataFrame):
    zaman = next((c for c in df.columns if c.lower() in ("date", "tarih", "datetime")), df.columns[0])
    deger = next((c for c in df.columns if "consumption" in c.lower() or "tuketim" in c.lower()), None)
    if deger is None:
        deger = df.select_dtypes("number").columns[0]
    return zaman, deger


def main():
    from eptr2 import EPTR2  # pip install "eptr2[allextras]"

    bas_yil = int(sys.argv[1]) if len(sys.argv) > 1 else 2016
    son_yil = int(sys.argv[2]) if len(sys.argv) > 2 else date.today().year - 1
    kaynak = kimlik_yukle()
    print(f"Kimlik okundu: {kaynak}")
    eptr = EPTR2(use_dotenv=False, recycle_tgt=True)

    parcalar = []
    for bas, son in aylik_parcalar(bas_yil, son_yil):
        for deneme in range(3):
            try:
                df = eptr.call("rt-cons", start_date=bas, end_date=son)
                break
            except Exception as e:  # ağ / oturum hatası: bekle, tekrar dene
                print(f"{bas}: {e}; tekrar deneniyor")
                time.sleep(5 * (deneme + 1))
        else:
            raise SystemExit(f"{bas} ayı çekilemedi")
        z, d = sutunlari_bul(df)
        parcalar.append(pd.DataFrame({"date": df[z], "consumption": pd.to_numeric(df[d], errors="coerce")}))
        print(f"{bas[:7]}: {len(df)} saat")
        time.sleep(1)

    tum = pd.concat(parcalar, ignore_index=True)
    tum["date"] = pd.to_datetime(tum["date"], utc=True).dt.tz_convert("Europe/Istanbul")
    tum = tum.dropna().drop_duplicates("date").sort_values("date")
    cikti = Path(__file__).with_name(f"epias_tuketim_{bas_yil}-{son_yil}.csv")
    tum.to_csv(cikti, index=False)
    eksik = (pd.date_range(tum.date.min(), tum.date.max(), freq="h").size - len(tum))
    print(f"Yazıldı: {cikti.name} · {len(tum)} saat · eksik saat: {eksik}")


if __name__ == "__main__":
    main()
