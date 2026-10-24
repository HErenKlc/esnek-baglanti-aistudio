r"""Demo trafo merkezlerinin hava verisini önceden çekip web/public'e yazar.

Neden: Uygulama her açılışta seçili TM için 20 yıllık saatlik hava verisini
Open-Meteo'dan canlı çekiyor. Bu, normal kullanımda doğru tasarım — ama
değerlendirme günlerinde Open-Meteo yavaşlarsa, hız sınırına takılırsa ya da
kapalıysa jüri boş ekran görür. 429 alındığında istemci 20, sonra 40 saniye
bekliyor; canlı demoda bu ölüm demektir.

Bu betik varsayılan TM'lerin verisini bir kez çekip statik dosyaya yazar.
Uygulama önce bu dosyayı dener, yoksa canlı çeker. Yani ilk ekran internetsiz
bile açılır, davranış değişmez, veri aynı veridir.

Biçim: ayrıştırılmış hâli saklanır (zaman damgası yok, yıl başına 8.760 değer).
Yer kazanmak için tam sayıya ölçeklenir: ışınım W/m², sıcaklık ve rüzgâr ×10.

Çalıştırma:  python model/hava_onbellek.py
Çıktı:       web/public/hava/<enlem>_<boylam>_<egim>.json
Lisans/atıf: Open-Meteo (CC BY 4.0), ERA5 — Copernicus Climate Change Service.
"""
import json
import sys
import time
import urllib.request
from pathlib import Path

YILLAR = list(range(2006, 2026))
SAAT_YIL = 8760
EGIM = 30

# Demoda kullanılan TM'ler. Başkası gerekirse buraya eklenir.
HEDEFLER = [
    ("Karapınar TM", 37.7313, 33.5511),
    ("Kızören TM", 38.1435, 33.1764),
    ("Alibeyhöyüğü TM", 37.5319, 32.6622),
]


def cek(enlem: float, boylam: float, egim: int = EGIM) -> dict:
    p = (f"latitude={enlem}&longitude={boylam}"
         f"&start_date={YILLAR[0]}-01-01&end_date={YILLAR[-1]}-12-31"
         "&hourly=global_tilted_irradiance,temperature_2m,wind_speed_10m"
         f"&tilt={egim}&azimuth=0&wind_speed_unit=ms&timezone=Etc%2FGMT-3")
    url = f"https://archive-api.open-meteo.com/v1/archive?{p}"
    for deneme in range(4):
        try:
            with urllib.request.urlopen(url, timeout=300) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as e:
            bekle = 30 * (deneme + 1)
            print(f"  hata: {e} — {bekle} sn sonra tekrar", file=sys.stderr)
            time.sleep(bekle)
    raise SystemExit("Open-Meteo'dan veri alınamadı. İnternet bağlantısını kontrol edin.")


def ayristir(j: dict) -> dict:
    """hava.ts'teki ayristir() ile aynı mantık: 29 Şubat atılır, eksikler komşudan doldurulur."""
    h = j["hourly"]
    zaman = h["time"]
    gti = h.get("global_tilted_irradiance") or []
    gti_var = any(v is not None and v > 0 for v in gti)
    isinim = gti if gti_var else (h.get("shortwave_radiation") or [])
    sicaklik, ruzgar = h["temperature_2m"], h["wind_speed_10m"]
    eksik = 0

    def doldur(dizi, i):
        nonlocal eksik
        v = dizi[i] if i < len(dizi) else None
        if v is not None:
            return v
        eksik += 1
        for k in range(1, 48):
            if i - k >= 0 and dizi[i - k] is not None:
                return dizi[i - k]
            if i + k < len(dizi) and dizi[i + k] is not None:
                return dizi[i + k]
        return 0.0

    kova = {y: {"poa": [], "sicaklik": [], "ruzgar": []} for y in YILLAR}
    for i, z in enumerate(zaman):
        if z[5:10] == "02-29":
            continue
        yil = int(z[:4])
        k = kova.get(yil)
        if k is None or len(k["poa"]) >= SAAT_YIL:
            continue
        k["poa"].append(max(0.0, doldur(isinim, i)))
        k["sicaklik"].append(doldur(sicaklik, i))
        k["ruzgar"].append(max(0.0, doldur(ruzgar, i)))

    tam = [y for y in YILLAR if len(kova[y]["poa"]) == SAAT_YIL]
    if len(tam) < 3:
        raise SystemExit(f"Yeterli tam yıl yok (yalnızca {len(tam)}).")
    return {
        "surum": 1,
        "egikKaynak": "GTI" if gti_var else "GHI",
        "eksikOran": eksik / max(1, len(zaman) * 3),
        "yillar": tam,
        # Yer kazanmak için tam sayıya ölçeklenir; hava.ts aynı ölçekle geri çevirir.
        "poa": [[round(v) for v in kova[y]["poa"]] for y in tam],
        "sicaklik": [[round(v * 10) for v in kova[y]["sicaklik"]] for y in tam],
        "ruzgar": [[round(v * 10) for v in kova[y]["ruzgar"]] for y in tam],
    }


def main() -> None:
    klasor = Path(__file__).parent.parent / "web" / "public" / "hava"
    klasor.mkdir(parents=True, exist_ok=True)
    for ad, enlem, boylam in HEDEFLER:
        dosya = klasor / f"{enlem:.2f}_{boylam:.2f}_{EGIM}.json"
        if dosya.exists():
            print(f"{ad}: zaten var ({dosya.name}), atlandı")
            continue
        print(f"{ad}: çekiliyor ({enlem}, {boylam}) — 20 yıl, biraz sürebilir")
        veri = ayristir(cek(enlem, boylam))
        dosya.write_text(json.dumps(veri, separators=(",", ":")), encoding="utf-8")
        mb = dosya.stat().st_size / 1_048_576
        print(f"  yazıldı: {dosya.name} · {len(veri['yillar'])} tam yıl · "
              f"{mb:.1f} MB · kaynak {veri['egikKaynak']}")
        time.sleep(5)   # Open-Meteo dakikalık sınırına takılmamak için
    print("Bitti. Uygulama bu dosyaları otomatik bulur; yoksa canlı çeker.")


if __name__ == "__main__":
    main()
