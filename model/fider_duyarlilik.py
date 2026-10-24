r"""Basit iki baralı gerilim kontrolünün gerçekçi bir OG fiderinde hâlâ geçerli olup
olmadığını sınar.

Neden: web/src/sim/fider.ts, yeni GES'i "TM'den çıkan kendi hattının ucunda, hat
üzerinde başka yük ve başka üretim yok" diye modelliyor. gerilim_dogrulama.py bu
modelin kendi içinde doğru olduğunu gösterdi (pandapower ile 150 durum, hepsi
muhafazakâr). Ama asıl soru şu: varsayımın kendisi ne kadar güvenli?

Gerçek bir orta gerilim fiderinde üç fark var:
  1. Hat üzerinde dağıtık tüketici yük var — yük, üretimin yarattığı gerilim
     yükselmesini düşürür, yani basit kontrol muhafazakâr kalır.
  2. Yeni santral hattın ucunda olmayabilir — ortada bir noktaya bağlanırsa
     gerilim yükselmesi daha az olur.
  3. Aynı fiderde BAŞKA üretim olabilir. Bu, basit kontrolün göremediği tek
     durumdur ve ters yönde çalışır: diğer santrallerin enjeksiyonu gerilimi
     yükseltir, yeni santralin tek başına hesaplanan payı yetmez.

Bu betik üçünü de ölçer. Gerilim sınırı fiderin HER barasında geçerli olduğu için
en yüksek bara gerilimi esas alınır.

Kapsam ve dürüstlük: buradaki fider yapıları temsilîdir, Karapınar'ın ya da başka
bir TM'nin gerçek fideri değildir — o veri (iletken, kesit, uzunluk, ara yük
dağılımı, kademe değiştirici ayarı) yayımlanmıyor, EDAŞ'ta. Bu çalışma bir
bağlantı etüdünün yerine geçmez; etüdün neye bakması gerektiğini daraltır.

Çalıştırma:  python model/fider_duyarlilik.py
Çıktı:       web/public/fider_duyarlilik.json
"""
import json
import math
import sys
from pathlib import Path

import pandapower as pp

# Betik hangi klasörden çalıştırılırsa çalıştırılsın kardeş modülü bulsun.
sys.path.insert(0, str(Path(__file__).parent))

from gerilim_dogrulama import (GERILIM_KV, ILETKENLER, SINIR_YUZDE, C_NF_KM,
                               formul_gerilim_mw, reaktans)

BARA_SAYISI = 10          # fider boyunca eşit aralıklı bara
ILETKEN = ILETKENLER[1]   # Hawk (477 MCM) — tipik OG ana fider


def fider_kur(uzunluk_km: float, yuk_mw: float, ek_mw: float, ek_konum: float,
              mevcut_uretim_mw: float, cos_phi: float):
    """Dağıtık yüklü OG fideri; yeni santral ek_konum oranındaki baraya bağlı.

    yuk_mw            : fiderin toplam tüketici yükü, baralara eşit dağıtılır
    mevcut_uretim_mw  : aynı fiderdeki diğer üretim, baralara eşit dağıtılır
    ek_konum          : 0..1, yeni santralin fider üzerindeki konumu
    """
    net = pp.create_empty_network(sn_mva=100)
    baralar = [pp.create_bus(net, vn_kv=GERILIM_KV, name=f"b{i}") for i in range(BARA_SAYISI + 1)]
    pp.create_ext_grid(net, baralar[0], vm_pu=1.0)
    bolum = uzunluk_km / BARA_SAYISI
    for i in range(BARA_SAYISI):
        pp.create_line_from_parameters(
            net, baralar[i], baralar[i + 1], length_km=bolum,
            r_ohm_per_km=ILETKEN["R"], x_ohm_per_km=reaktans(ILETKEN),
            c_nf_per_km=C_NF_KM, max_i_ka=ILETKEN["amper"] / 1000)

    tan_phi = math.tan(math.acos(min(1.0, max(0.8, cos_phi))))
    # Tüketici yükü: cosφ 0,95 endüktif (tipik OG karma yük)
    yuk_tan = math.tan(math.acos(0.95))
    for b in baralar[1:]:
        if yuk_mw > 0:
            pp.create_load(net, b, p_mw=yuk_mw / BARA_SAYISI, q_mvar=yuk_mw / BARA_SAYISI * yuk_tan)
        if mevcut_uretim_mw > 0:
            pp.create_sgen(net, b, p_mw=mevcut_uretim_mw / BARA_SAYISI, q_mvar=0.0)

    hedef = baralar[max(1, min(BARA_SAYISI, round(ek_konum * BARA_SAYISI)))]
    if ek_mw > 0:
        pp.create_sgen(net, hedef, p_mw=ek_mw, q_mvar=-ek_mw * tan_phi)
    return net, baralar


def en_yuksek_gerilim(**kw):
    """Fiderdeki en yüksek bara gerilimi, nominalin yüzdesi olarak (ΔU)."""
    net, _ = fider_kur(**kw)
    try:
        pp.runpp(net, algorithm="nr", calculate_voltage_angles=True)
    except pp.LoadflowNotConverged:
        return None
    return float((net.res_bus.vm_pu.max() - 1.0) * 100)


def azami_ek_mw(uzunluk_km: float, yuk_mw: float, ek_konum: float,
                mevcut_uretim_mw: float, cos_phi: float) -> float:
    """ΔU sınırını fiderin hiçbir barasında aşmayan en yüksek ek güç."""
    def asiyor(p):
        d = en_yuksek_gerilim(uzunluk_km=uzunluk_km, yuk_mw=yuk_mw, ek_mw=p,
                              ek_konum=ek_konum, mevcut_uretim_mw=mevcut_uretim_mw,
                              cos_phi=cos_phi)
        return d is None or d >= SINIR_YUZDE

    if asiyor(0.0):     # yeni santral olmadan bile sınır aşılıyorsa yer yok
        return 0.0
    alt, ust = 0.0, max(1.0, formul_gerilim_mw(ILETKEN, uzunluk_km, cos_phi))
    for _ in range(20):
        if asiyor(ust):
            break
        alt, ust = ust, ust * 2
    else:
        return math.inf
    for _ in range(50):
        orta = (alt + ust) / 2
        if asiyor(orta):
            ust = orta
        else:
            alt = orta
    return (alt + ust) / 2


def main() -> None:
    uzunluk = 10.0
    sonuclar = []
    for cos_phi in (1.00, 0.95):
        basit = formul_gerilim_mw(ILETKEN, uzunluk, cos_phi)  # uygulamanın kullandığı sayı
        for ad, yuk, konum, mevcut in [
            ("Tahsisli hat (uygulamanın varsaydığı): ara yük yok, başka üretim yok", 0.0, 1.0, 0.0),
            ("Fiderde 5 MW tüketici yükü, santral hattın ucunda", 5.0, 1.0, 0.0),
            ("Fiderde 5 MW yük, santral fiderin ortasında", 5.0, 0.5, 0.0),
            ("Yaz öğlesi: fiderde yalnızca 1 MW yük, santral uçta", 1.0, 1.0, 0.0),
            ("Aynı fiderde 5 MW mevcut GES, 1 MW yük, yeni santral uçta", 1.0, 1.0, 5.0),
            ("Aynı fiderde 10 MW mevcut GES, 1 MW yük, yeni santral uçta", 1.0, 1.0, 10.0),
            ("Aynı fiderde 20 MW mevcut GES, 1 MW yük, yeni santral uçta", 1.0, 1.0, 20.0),
        ]:
            gercek = azami_ek_mw(uzunluk, yuk, konum, mevcut, cos_phi)
            if math.isinf(gercek):
                oran = None
            else:
                oran = round(100 * (basit - gercek) / gercek, 2) if gercek > 1e-9 else None
            sonuclar.append({
                "senaryo": ad, "cos_phi": cos_phi,
                "fider_yuku_MW": yuk, "mevcut_uretim_MW": mevcut, "baglanti_konumu": konum,
                "basit_kontrol_MW": round(basit, 2),
                "fider_modeli_MW": round(gercek, 2) if math.isfinite(gercek) else None,
                "basit_kontrol_farki_yuzde": oran,
                "yon": ("muhafazakâr" if math.isfinite(gercek) and basit <= gercek + 1e-9
                        else "İYİMSER" if math.isfinite(gercek) else "sınırsız"),
            })

    iyimser = [s for s in sonuclar if s["yon"] == "İYİMSER"]
    rapor = {
        "ne": "Basit iki baralı gerilim kontrolünün gerçekçi OG fiderindeki geçerliliği",
        "arac": f"pandapower {pp.__version__}, Newton-Raphson",
        "kurulum": (f"{GERILIM_KV} kV, {uzunluk:.0f} km, {BARA_SAYISI} eşit aralıklı bara, "
                    f"{ILETKEN['ad']}; tüketici yükü cosφ 0,95 endüktif, baralara eşit dağıtılmış. "
                    f"Gerilim sınırı %{SINIR_YUZDE} fiderin HER barasında aranır."),
        "temsili": ("Bu fider yapıları temsilîdir, gerçek bir TM fiderinin kendisi değildir. "
                    "İletken, kesit, uzunluk, ara yük dağılımı ve kademe değiştirici ayarı "
                    "yayımlanmıyor; EDAŞ'ta. Bu çalışma bağlantı etüdünün yerine geçmez."),
        "bulgu": (
            "Tüketici yükü ve fiderin ortasına bağlanma, basit kontrolü muhafazakâr yapar. "
            "Basit kontrolün göremediği tek durum aynı fiderde BAŞKA ÜRETİM olmasıdır: "
            "diğer santrallerin enjeksiyonu gerilimi birlikte yükseltir ve yeni santralin "
            "tek başına hesaplanan payı yetmeyebilir."
            if iyimser else
            "Sınanan yapıların hiçbirinde basit kontrol iyimser çıkmadı."),
        "iyimser_senaryo_sayisi": len(iyimser),
        "toplam_senaryo": len(sonuclar),
        "kapsam_disi": [
            "kademe değiştirici (OLTC) tepkisi — gerçek fiderde gerilimi geri çeker",
            "fider dallanması ve farklı kesitli bölümler",
            "dengesiz yük, tek faz açma",
            "koruma koordinasyonu (ayrı betik: kisa_devre.py)",
        ],
        "senaryolar": sonuclar,
    }
    cikti = Path(__file__).parent.parent / "web" / "public" / "fider_duyarlilik.json"
    cikti.write_text(json.dumps(rapor, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"{len(sonuclar)} senaryo · iyimser çıkan: {len(iyimser)}")
    for s in sonuclar:
        f = s["fider_modeli_MW"]
        print(f"  cosφ {s['cos_phi']:.2f} | basit {s['basit_kontrol_MW']:>7.2f} MW | "
              f"fider {('%7.2f' % f) if f is not None else '      ∞'} MW | {s['yon']:<12} | {s['senaryo']}")
    print(f"Yazıldı: {cikti}")


if __name__ == "__main__":
    main()
