r"""Demo için sentetik TM yük profili üretir. GERÇEK ÖLÇÜM DEĞİLDİR.

Neden var: Kanıt merdiveninin üçüncü basamağı — "EDAŞ ölçümü yüklenince ne
oluyor" — gerçek veri gelmeden gösterilemiyor. Bu dosya o basamağı demoda
canlandırmak için. Manşet sayıya DOKUNMAZ: uygulamanın ana sonucu yük bağımsız
alt sınırdır ve bu dosya oraya hiç girmez.

Yağmur Hanım'ın kuralı (15 Ekim Build & Show): trafo saatlik yükü açık veri
olmadığı için sentetik üretmek mantıklı, AMA sentetik veriyle doğruluk iddia
edilmez — "boru hattı doğrulaması" denir. Bu dosya tam olarak o amaçla var.
Her satırında SENTETIK yazıyor, başlığında büyük harfle uyarı var.

Profil neye göre kuruldu (hepsi varsayım, hiçbiri ölçüm değil):
  - Konya ovası sulama ağırlıklı bir TM düşünüldü. Haziran–Eylül arası tarımsal
    sulama pompaları gündüz yoğun çalışır; bu yüzden YAZ ÖĞLE YÜKÜ YÜKSEKTİR.
  - Kışın yük daha düşük ve tepe akşam saatlerinde (aydınlatma, ısıtma).
  - En düşük öğle yükü ilkbahar ve sonbaharda görülür: sulama bitmiş, ısıtma
    başlamamıştır. Ters akış riski de en çok oradadır — profilin öğrettiği şey
    budur ve gerçek ölçümün neden önemli olduğunu gösterir.
  - Hafta sonu etkisi küçük tutuldu: tarımsal yük takvime pek bakmaz.
  - Yılda birkaç gün bakım (yük düşük), ±%3 ölçüm gürültüsü.

Çıktı biçimi, web/src/veri/olcum.ts'in beklediği gibi: noktalı virgülle ayrılmış,
son sayısal sütun MW. "sentetik" sütunu METİN yazılır — sayı yazılsaydı okuyucu
onu yük sanardı.

Çalıştırma:  python model/sentetik_olcum.py
Çıktı:       model/ornek_olcum_SENTETIK_konya.csv  (8.760 satır)
"""
import math
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np

TOHUM = 42
YIL = 2025
TEPE_HEDEF_MW = 32.0     # yaz sulama tepesi
TABAN_MW = 6.0           # ilkbahar gecesi en düşük


def sulama_mevsimi(gun: int) -> float:
    """Haziran–Eylül arası yükselen sulama etkeni, 0..1."""
    # 152. gün ≈ 1 Haziran, 273. gün ≈ 30 Eylül
    if gun < 135 or gun > 288:
        return 0.0
    return math.sin(math.pi * (gun - 135) / (288 - 135)) ** 1.5


def isitma_mevsimi(gun: int) -> float:
    """Kış ısıtma/aydınlatma etkeni, 0..1 — yaz ortasında sıfır."""
    return max(0.0, math.cos(2 * math.pi * (gun - 15) / 365)) ** 1.2


def gunluk_sekil(saat: int, sulama: float, isitma: float) -> float:
    """Saatlik çarpan. Yazın gündüz bloğu, kışın akşam tepesi."""
    # Sulama: 07–19 arası geniş gündüz bloğu, öğlen hafif tepe
    s_blok = 1.0 if 7 <= saat <= 19 else 0.25
    s_blok *= 1.0 + 0.15 * math.sin(math.pi * max(0.0, min(1.0, (saat - 7) / 12)))
    # Isıtma/aydınlatma: 17–22 akşam tepesi, gece düşük
    i_blok = 0.45
    if 17 <= saat <= 22:
        i_blok = 1.0
    elif 6 <= saat <= 9:
        i_blok = 0.75
    elif 10 <= saat <= 16:
        i_blok = 0.60
    return sulama * s_blok + isitma * i_blok


def main() -> None:
    rng = np.random.default_rng(TOHUM)
    baslangic = datetime(YIL, 1, 1)
    # Bakım günleri: yük yarıya iner
    bakim_gunleri = set(rng.choice(np.arange(1, 366), size=3, replace=False).tolist())

    satirlar = ["# SENTETIK VERI - GERCEK OLCUM DEGILDIR - demo amaclidir",
                "# Konya ovasi sulama agirlikli temsili TM yuku; model/sentetik_olcum.py uretir",
                "tarih;yuk_MW;kaynak"]
    degerler = []
    for g in range(365):
        gun = g + 1
        sulama = sulama_mevsimi(gun)
        isitma = isitma_mevsimi(gun)
        hafta_sonu = (baslangic + timedelta(days=g)).weekday() >= 5
        gun_carpani = 0.97 if hafta_sonu else 1.0
        if gun in bakim_gunleri:
            gun_carpani *= 0.5
        for s in range(24):
            ham = gunluk_sekil(s, sulama, isitma)
            mw = TABAN_MW + (TEPE_HEDEF_MW - TABAN_MW) * ham
            mw *= gun_carpani * (1.0 + rng.normal(0, 0.03))
            mw = max(2.0, mw)
            zaman = baslangic + timedelta(days=g, hours=s)
            satirlar.append(f"{zaman:%Y-%m-%dT%H:%M};{mw:.2f};SENTETIK")
            degerler.append(mw)

    cikti = Path(__file__).with_name("ornek_olcum_SENTETIK_konya.csv")
    cikti.write_text("\n".join(satirlar) + "\n", encoding="utf-8")

    a = np.array(degerler).reshape(365, 24)
    ogle = a[:, 10:16]
    en_dusuk_gun = int(ogle.min(axis=1).argmin()) + 1
    tarih_en_dusuk = (baslangic + timedelta(days=en_dusuk_gun - 1)).strftime("%d %B")
    print(f"Yazıldı: {cikti.name} · {len(degerler)} saat")
    print(f"  tepe {a.max():.1f} MW · yıllık ortalama {a.mean():.1f} MW")
    print(f"  en düşük öğle yükü {ogle.min():.1f} MW ({en_dusuk_gun}. gün, {tarih_en_dusuk})")
    print(f"  temmuz öğle ortalaması {a[181:212, 10:16].mean():.1f} MW · "
          f"nisan öğle ortalaması {a[90:120, 10:16].mean():.1f} MW")
    print("  Her satırda SENTETIK yazıyor; ilk iki satır # ile uyarı.")


if __name__ == "__main__":
    main()
