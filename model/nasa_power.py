"""NASA POWER veri çekici (Climathon 2026 · Esnek Bağlantı Motoru).

Yağmur'un Build & Show demosundaki akışın kod hali: NASA POWER'dan
ışınım + sıcaklık verisini çek, -999 eksik değerlerini NaN yap, CSV'ye yaz.

Lisans: NASA POWER verisi CC BY 4.0 -> atıf zorunlu (bkz. ATIF sabiti).
Not: Bu dosya Gemini'nin "araç" (function calling) olarak çağıracağı
fonksiyonu da içerir; docstring'ler Gemini'ye fonksiyonu tarif eder.
"""
from __future__ import annotations

import json
import urllib.parse
import urllib.request
from datetime import date

import numpy as np
import pandas as pd

TABAN_URL = "https://power.larc.nasa.gov/api/temporal/{cozunurluk}/point"
DOLGU_DEGERI = -999  # POWER'ın eksik veri işareti (demo ekranında da görünüyordu)
ATIF = ("Veri: NASA Langley Research Center (LaRC) POWER Project, "
        "NASA Earth Science/Applied Science Program. Lisans: CC BY 4.0.")

# Esnek bağlantı analizi için yeterli temel parametreler
VARSAYILAN_PARAMETRELER = ["ALLSKY_SFC_SW_DWN", "CLRSKY_SFC_SW_DWN", "T2M"]

# Demo için birkaç Türkiye noktası (GES yoğun bölgeler)
NOKTALAR = {
    "Konya": (37.87, 32.49),
    "Sivas": (39.75, 37.02),
    "Karaman": (37.18, 33.22),
    "Ankara": (39.93, 32.86),
}


def _url_kur(enlem: float, boylam: float, baslangic: str, bitis: str,
             parametreler: list[str], cozunurluk: str) -> str:
    sorgu = {
        "parameters": ",".join(parametreler),
        "community": "RE",          # Renewable Energy topluluğu
        "longitude": boylam,
        "latitude": enlem,
        "start": baslangic,         # YYYYMMDD
        "end": bitis,               # YYYYMMDD
        "format": "JSON",
    }
    return TABAN_URL.format(cozunurluk=cozunurluk) + "?" + urllib.parse.urlencode(sorgu)


def json_to_dataframe(ham: dict) -> pd.DataFrame:
    """POWER JSON yanıtını (properties.parameter.{AD}.{tarih}: değer) tabloya çevirir."""
    param_blok = ham["properties"]["parameter"]
    df = pd.DataFrame(param_blok)
    df.index.name = "zaman"
    # Günlük anahtar: YYYYMMDD, saatlik anahtar: YYYYMMDDHH
    fmt = "%Y%m%d%H" if len(str(df.index[0])) == 10 else "%Y%m%d"
    df.index = pd.to_datetime(df.index.astype(str), format=fmt)
    df = df.replace(DOLGU_DEGERI, np.nan).astype(float)
    birimler = {k: v.get("units", "") for k, v in ham.get("parameters", {}).items()}
    df.attrs["birimler"] = birimler
    df.attrs["atif"] = ATIF
    return df


def nasa_power_cek(enlem: float, boylam: float, baslangic: str, bitis: str,
                   parametreler: list[str] | None = None,
                   cozunurluk: str = "daily", zaman_asimi: int = 60) -> pd.DataFrame:
    """NASA POWER API'den nokta verisi çeker ve DataFrame döndürür.

    cozunurluk: "daily" (doğrulanmış) veya "hourly" (aynı desen; ilk kullanımda
    https://power.larc.nasa.gov/api/temporal/hourly/openapi.json ile doğrula).
    """
    parametreler = parametreler or VARSAYILAN_PARAMETRELER
    url = _url_kur(enlem, boylam, baslangic, bitis, parametreler, cozunurluk)
    with urllib.request.urlopen(url, timeout=zaman_asimi) as yanit:
        ham = json.load(yanit)
    if "properties" not in ham:
        raise RuntimeError(f"POWER hata döndürdü: {ham.get('messages') or ham}")
    return json_to_dataframe(ham)


def eksik_veri_raporu(df: pd.DataFrame) -> dict:
    """Yağmur'un 'açık verinin sınırları' slaytı: eksik değerleri görünür kıl."""
    return {
        "satir": int(len(df)),
        "eksik_oran_%": {c: round(float(df[c].isna().mean() * 100), 2) for c in df.columns},
        "aralik": [str(df.index.min().date()), str(df.index.max().date())],
    }


# ---------- Gemini'ye araç olarak verilecek fonksiyon ----------
def gunes_verisi_getir(sehir: str, yil: int, aylar: list[int] | None = None) -> dict:
    """Bir Türkiye noktası için NASA POWER günlük güneş ışınımı ve sıcaklık verisini getirir.

    Args:
        sehir: Konya, Sivas, Karaman veya Ankara.
        yil: Veri yılı, örn. 2025.
        aylar: İsteğe bağlı ay listesi (1-12), örn. [6, 7, 8]. Boşsa tüm yıl.

    Returns:
        Özet sözlük: ortalama günlük ışınım (kWh/m2/gün), ortalama sıcaklık (C),
        eksik veri oranı, CSV dosya yolu ve atıf metni.
    """
    if sehir not in NOKTALAR:
        return {"hata": f"Bilinmeyen şehir. Seçenekler: {list(NOKTALAR)}"}
    enlem, boylam = NOKTALAR[sehir]
    df = nasa_power_cek(enlem, boylam, f"{yil}0101", f"{yil}1231")
    if aylar:
        df = df[df.index.month.isin(aylar)]
    yol = f"nasa_power_{sehir.lower()}_{yil}.csv"
    df.to_csv(yol)
    return {
        "sehir": sehir,
        "gun_sayisi": int(len(df)),
        "ort_isinim_kwh_m2_gun": round(float(df["ALLSKY_SFC_SW_DWN"].mean()), 2),
        "ort_acik_gok_isinim": round(float(df["CLRSKY_SFC_SW_DWN"].mean()), 2),
        "ort_sicaklik_c": round(float(df["T2M"].mean()), 1),
        "eksik_veri": eksik_veri_raporu(df)["eksik_oran_%"],
        "csv": yol,
        "atif": ATIF,
    }


if __name__ == "__main__":
    # Yağmur'un demosundaki istek: Sivas, son 5 yıl, Haziran–Ağustos ışınımı -> CSV
    son = date.today().year - 1
    parcalar = []
    for y in range(son - 4, son + 1):
        d = nasa_power_cek(*NOKTALAR["Sivas"], f"{y}0601", f"{y}0831")
        parcalar.append(d)
    tum = pd.concat(parcalar)
    tum["yil"], tum["ay"] = tum.index.year, tum.index.month
    tum.to_csv("sivas_haziran_agustos.csv")
    print(eksik_veri_raporu(tum))
    print(ATIF)
