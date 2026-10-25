"""RoomForSun — Esnek Bağlantı Motoru · Yük kantil modeli (gerçek EPİAŞ verisi).

Veri: EPİAŞ Şeffaflık Platformu saatlik gerçek zamanlı tüketim. Bu klasördeki bütün epias_*.csv dosyaları
birleştirilir: varsayılan 2022-2025; epias_cek.py ile 2016-2025'e genişler (kod değişmeden).
Bölünme (kronolojik): son tam yıl test, bir önceki yıl kalibrasyon, daha öncekiler eğitim.
Geri test: ilk iki yıldan sonraki HER yıl, kendisini görmemiş bir modelle sınanır.
COVID kapanma dönemi (16 Mart - 30 Haziran 2020) eğitimden çıkarılır; yakın yıllar daha ağır tartılır.
Hedef: tüketim / o yılın ortalaması (yıllık büyümeyi ayırır; şekil öğrenilir).

Yağmur'un basamakları: 1) baseline (geçen yılın aynı saati), 2) ay×saat×gün tipi
empirik kantilleri, 3) LightGBM kantil regresyonu. Gelişme yoksa karmaşık model kullanılmaz.

Çıktı: ../web/public/yuk_kantilleri_2026.json  (8760 saat × 7 kantil, normalize)
       ../web/public/model_raporu.json         (test metrikleri, jüri için)
Çalıştırma: python train.py
"""
import json
from pathlib import Path

import holidays
import lightgbm as lgb
import numpy as np
import pandas as pd

KANTILLER = [0.05, 0.10, 0.25, 0.50, 0.75, 0.90, 0.95]
PLAN_YILI = 2026
CIKTI = Path(__file__).resolve().parent.parent / "web" / "public"


def tatil_bilgisi(yillar):
    tr = holidays.Turkey(years=yillar)
    tatil = set(tr.keys())
    ramazan_bayram_ilk = sorted(d for d, ad in tr.items() if "Ramazan" in ad)
    ilk_gunler = [d for d in ramazan_bayram_ilk if (d - pd.Timedelta(days=1)) not in tatil]
    ramazan = set()
    for d in ilk_gunler:  # bayramdan önceki 30 gün (yaklaşık)
        for k in range(1, 31):
            ramazan.add(d - pd.Timedelta(days=k))
    arife = {d - pd.Timedelta(days=1) for d in tatil if (d - pd.Timedelta(days=1)) not in tatil}
    return tatil, ramazan, arife


def ozellikler(index: pd.DatetimeIndex) -> pd.DataFrame:
    yillar = sorted(set(index.year) | {index.year.min() - 1, index.year.max() + 1})
    tatil, ramazan, arife = tatil_bilgisi(yillar)
    gun = pd.Series(index.date, index=index)
    doy = index.dayofyear.values
    X = pd.DataFrame({
        "saat": index.hour,
        "haftagunu": index.dayofweek,
        "ay": index.month,
        "doy_sin": np.sin(2 * np.pi * doy / 365.25),
        "doy_cos": np.cos(2 * np.pi * doy / 365.25),
        "tatil": gun.isin(tatil).astype(int).values,
        "arife": gun.isin(arife).astype(int).values,
        "ramazan": gun.isin(ramazan).astype(int).values,
    }, index=index)
    X["gun_tipi"] = np.where(X.tatil == 1, 2, np.where(X.haftagunu == 6, 2, np.where(X.haftagunu == 5, 1, 0)))
    return X


def pinball(y, q, a):
    d = y - q
    return np.mean(np.maximum(a * d, (a - 1) * d))


def oku():
    parcalar = []
    for f in sorted(Path(__file__).parent.glob("epias_*.csv")):
        d = pd.read_csv(f)
        t = pd.to_datetime(d["date"], utc=True).dt.tz_convert("Europe/Istanbul").dt.tz_localize(None)
        parcalar.append(pd.Series(pd.to_numeric(d["consumption"], errors="coerce").values, index=t))
    s = pd.concat(parcalar).dropna().sort_index()
    s = s[~s.index.duplicated(keep="last")]
    sayim = s.groupby(s.index.year).size()
    tam = [int(y) for y, n in sayim.items() if n >= 8700]  # tam yıllar
    s = s[s.index.year.isin(tam)]
    norm = s / s.groupby(s.index.year).transform("mean")
    return s, norm


COVID = (pd.Timestamp("2020-03-16"), pd.Timestamp("2020-06-30 23:00"))


def egitim_maskesi(index, yillar):
    m = index.year.isin(yillar)
    return m & ~((index >= COVID[0]) & (index <= COVID[1]))


def agirlik(index, son_yil, yari_omur=3.0):
    """Yakın yıllar daha ağır: davranış değişiyor (çatı GES, elektrifikasyon)."""
    return np.asarray(0.5 ** ((son_yil - index.year) / yari_omur), dtype=float)


def empirik_kantiller(y_egitim, X_egitim, X_hedef):
    anahtar = ["ay", "saat", "gun_tipi"]
    df = X_egitim[anahtar].copy()
    df["y"] = y_egitim.values
    tablo = df.groupby(anahtar)["y"].quantile(KANTILLER).unstack()
    hedef = X_hedef[anahtar].merge(tablo, left_on=anahtar, right_index=True, how="left")
    return hedef[KANTILLER].values


def lgb_kantiller(y_egitim, X_egitim, X_hedef, X_dogrulama=None, y_dogrulama=None):
    w = agirlik(X_egitim.index, X_egitim.index.year.max())
    tahmin = np.zeros((len(X_hedef), len(KANTILLER)))
    kolon = ["saat", "haftagunu", "ay", "doy_sin", "doy_cos", "tatil", "arife", "ramazan"]
    for i, a in enumerate(KANTILLER):
        m = lgb.LGBMRegressor(objective="quantile", alpha=a, n_estimators=600, learning_rate=0.03,
                              num_leaves=31, min_child_samples=40, subsample=0.8, subsample_freq=1,
                              colsample_bytree=0.9, verbose=-1, random_state=42)
        m.fit(X_egitim[kolon], y_egitim, sample_weight=w)
        tahmin[:, i] = m.predict(X_hedef[kolon])
    tahmin.sort(axis=1)  # kantil çaprazlamasını düzelt
    return tahmin


def degerlendir(y, Q, ad):
    pin = float(np.mean([pinball(y, Q[:, i], a) for i, a in enumerate(KANTILLER)]))
    kapsama = float(np.mean((y >= Q[:, 0]) & (y <= Q[:, -1])))
    mape50 = float(np.mean(np.abs(y - Q[:, 3]) / y) * 100)
    return {"yontem": ad, "ortalama_pinball": round(pin, 5), "P5_P95_kapsama": round(kapsama, 3),
            "P50_MAPE_yuzde": round(mape50, 2)}


def conformal_genislet(Q_dog, y_dog, Q_hedef):
    """P5/P95 bandını doğrulama yılında %90 kapsayacak şekilde genişletir (CQR)."""
    skor = np.maximum(Q_dog[:, 0] - y_dog, y_dog - Q_dog[:, -1])
    n = len(skor)
    k = np.quantile(skor, min(1, np.ceil((n + 1) * 0.90) / n))
    Q = Q_hedef.copy()
    Q[:, 0] -= k
    Q[:, -1] += k
    Q[:, 1] -= k / 2
    Q[:, -2] += k / 2
    Q.sort(axis=1)
    return Q, float(k)


def main():
    ham, y = oku()
    X = ozellikler(y.index)
    yillar = sorted(set(y.index.year))
    SON, KAL = yillar[-1], yillar[-2]
    print(f"Veri: {yillar[0]}-{SON}, {len(y)} saat, {len(yillar)} yıl")
    egit = egitim_maskesi(y.index, [a for a in yillar if a < KAL])
    dog = y.index.year == KAL
    test = y.index.year == SON

    sonuc = []
    # 1) Naif baseline: geçen yılın aynı saati (364 gün önce, haftagünü hizalı)
    onceki = y.shift(364 * 24)
    naif = onceki[test].values
    naif_mape = float(np.nanmean(np.abs(y[test].values - naif) / y[test].values) * 100)
    sonuc.append({"yontem": "Naif: geçen yılın aynı saati (nokta tahmin)", "P50_MAPE_yuzde": round(naif_mape, 2)})

    # 2) Empirik kantiller (testten önceki tüm yıllarla)
    egit_dog = egit | dog
    Q_emp = empirik_kantiller(y[egit_dog], X[egit_dog], X[test])
    sonuc.append(degerlendir(y[test].values, Q_emp, "Ay × saat × gün tipi empirik kantil"))

    # 3) LightGBM kantil: önceki yıllar eğitim, KAL yılı conformal kalibrasyon, SON yılı test
    Q_dog = lgb_kantiller(y[egit], X[egit], X[dog])
    Q_lgb_ham = lgb_kantiller(y[egit], X[egit], X[test])
    Q_lgb, k = conformal_genislet(Q_dog, y[dog].values, Q_lgb_ham)
    sonuc.append(degerlendir(y[test].values, Q_lgb_ham, "LightGBM kantil (kalibrasyonsuz)"))
    sonuc.append(degerlendir(y[test].values, Q_lgb, "LightGBM kantil + conformal (seçilen aday)"))

    secilen = min((r for r in sonuc if "ortalama_pinball" in r), key=lambda r: r["ortalama_pinball"])
    for r in sonuc:
        print(r)
    print("Seçilen:", secilen["yontem"])

    # Planlama yılı: model SON yılı hariç tüm yıllarla eğitilir, SON yılıyla kalibre edilir
    plan_idx = pd.date_range(f"{PLAN_YILI}-01-01", f"{PLAN_YILI}-12-31 23:00", freq="h")
    Xp = ozellikler(plan_idx)
    if "LightGBM" in secilen["yontem"]:
        Q_tst = lgb_kantiller(y[egit_dog], X[egit_dog], X[test])
        Q_plan_ham = lgb_kantiller(y[egit_dog], X[egit_dog], Xp)
        Q_plan, _ = conformal_genislet(Q_tst, y[test].values, Q_plan_ham)
    else:
        tum = y.index.year.isin(yillar)
        Q_plan = empirik_kantiller(y[tum], X[tum], Xp)

    olcek = Q_plan[:, 3].max()  # P50 yıllık tepe = 1.0
    Q_norm = np.round(Q_plan / olcek, 4)

    CIKTI.mkdir(parents=True, exist_ok=True)
    (CIKTI / "yuk_kantilleri_2026.json").write_text(json.dumps({
        "yil": PLAN_YILI, "kantiller": KANTILLER, "birim": "P50 yıllık tepeye göre normalize",
        "yontem": secilen["yontem"],
        "veri_kaynagi": "EPİAŞ Şeffaflık Platformu, saatlik gerçek zamanlı tüketim 2022-2025",
        "saatler": Q_norm.tolist(),
    }, separators=(",", ":")), encoding="utf-8")

    # Geri test dosyası: her test yılı için model o yılı GÖRMEDEN kantil üretir
    #   2024: 2022 eğitim, 2023 conformal kalibrasyon
    #   2025: 2022-2023 eğitim, 2024 conformal kalibrasyon
    # Ayrıca "naif planlamacı" için bir önceki yılın gerçek yükü (geçen yıl ne olduysa bu yıl da o olur).
    # Hepsi aynı ölçekle (o yılın tahmini P50 tepesi = 1) normalize; 29 Şubat atılır (8.760 saat).
    def ss29(seri):
        return seri[~((seri.index.month == 2) & (seri.index.day == 29))]

    geri = {}
    for i in range(2, len(yillar)):
        yil, kal_yil, egit_yillar = yillar[i], yillar[i - 1], yillar[: i - 1]
        e = egitim_maskesi(y.index, egit_yillar)
        kmask = y.index.year == kal_yil
        tmask = y.index.year == yil
        Q_k = lgb_kantiller(y[e], X[e], X[kmask])
        Q_t_ham = lgb_kantiller(y[e], X[e], X[tmask])
        Q_t, _ = conformal_genislet(Q_k, y[kmask].values, Q_t_ham)
        idx = y.index[tmask]
        tut = ~((idx.month == 2) & (idx.day == 29))
        Q_t = Q_t[tut]
        gercek = ss29(y[tmask]).values
        onceki = ss29(y[y.index.year == yil - 1]).values
        olc = Q_t[:, 3].max()
        kapsama = float(np.mean((gercek >= Q_t[:, 0]) & (gercek <= Q_t[:, -1])))
        geri[str(yil)] = {
            "egitim": [int(a) for a in egit_yillar], "kalibrasyon": int(kal_yil), "saat_kapsama_P5_P95": round(kapsama, 3),
            "saatler": np.round(Q_t / olc, 4).tolist(),
            "gercek": np.round(gercek / olc, 4).tolist(),
            "onceki_yil_gercek": np.round(onceki[:8760] / olc, 4).tolist(),
        }
        print(f"Geri test {yil}: saatlik P5-P95 kapsama {kapsama:.3f}")
    (CIKTI / "geri_test.json").write_text(json.dumps({
        "kantiller": KANTILLER,
        "aciklama": "Her yıl için model o yılı görmedi. gercek ve onceki_yil_gercek: EPİAŞ saatlik tüketim. Aynı ölçek.",
        "yillar": geri,
    }, separators=(",", ":")), encoding="utf-8")
    eski = CIKTI / "yuk_2025_test.json"
    if eski.exists():
        eski.unlink()

    # Test yılından örnek hafta (grafik için): gerçek vs P5/P50/P95
    Q_goster = Q_lgb if "LightGBM" in secilen["yontem"] else Q_emp
    yt = y[test]
    # Testin ikinci tam haftası Temmuz ortası: yaz klima tepesi + güneş
    pzt = pd.Timestamp(f"{SON}-07-14")
    pzt = pzt - pd.Timedelta(days=pzt.dayofweek)
    hafta = (yt.index >= pzt) & (yt.index < pzt + pd.Timedelta(days=7))
    (CIKTI / "model_raporu.json").write_text(json.dumps({
        "veri": f"{yillar[0]}-{SON}", "egitim": f"{yillar[0]}-{KAL - 1}", "kalibrasyon": str(KAL),
        "test": f"{SON} (8.760 saat, eğitimde hiç görülmedi)", "geri_test_yillari": [int(a) for a in yillar[2:]],
        "sonuclar": sonuc, "secilen": secilen["yontem"], "conformal_genisletme": round(k, 4),
        "ornek_hafta": {
            "baslangic": str(pzt.date()),
            "gercek": np.round(yt[hafta].values, 4).tolist(),
            "p05": np.round(Q_goster[hafta, 0], 4).tolist(),
            "p50": np.round(Q_goster[hafta, 3], 4).tolist(),
            "p95": np.round(Q_goster[hafta, -1], 4).tolist(),
        },
        "yillik_ortalama_MW": {int(k_): round(float(v), 0) for k_, v in ham.groupby(ham.index.year).mean().items()},
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print("Yazıldı:", CIKTI)


if __name__ == "__main__":
    main()
