r"""Uygulamadaki kısa hat gerilim formülünü pandapower yük akışıyla doğrular.

Neden: web/src/sim/fider.ts, yeni GES'in fider sonundaki gerilim yükselmesini
kapalı bir formülle hesaplıyor:

    ΔU/U ≈ L · (R·P − X·Q) / U²        (Q = P·tanφ, endüktif çalışmada)

Bu, hat empedansının üzerindeki gerilim düşümünün birinci dereceden yaklaşımı;
ikinci dereceden terimi ve hat kapasitansını ihmal ediyor. Jüri "gerilim analizi
yaptınız mı" diye sorduğunda cevabın "formül yazdık" değil "formülü tam yük
akışına karşı sınadık, sapması şu kadar" olması gerekiyor. Bu betik bunu yapıyor.

Yöntem: her durum için iki baralı bir ağ kurulur — TM barası (slack, 34,5 kV) ve
fider sonu barası; arada gerçek R/X'li hat, uçta P enjekte eden (ve cosφ < 1 ise
Q çeken) bir üretim birimi. pandapower Newton-Raphson ile çözer; formülün verdiği
ΔU ile karşılaştırılır. Ayrıca formülün "gerilim sınırına göre azami güç" sayısı,
pandapower üzerinde ikiye bölme ile bulunan gerçek değerle karşılaştırılır.

Kapsam: tek fider, tek üretim noktası, dengeli yük. Gerçek bir OG fiderinde ara
yükler, dallanma ve kademe değiştirici var — o bir EDAŞ etüdü. Burada sınanan şey
uygulamanın kendi iddiası: "bu formül bu aralıkta güvenilir mi".

Çalıştırma:  pip install pandapower
             python model/gerilim_dogrulama.py
Çıktı:       web/public/gerilim_dogrulama.json
"""
import json
import math
from pathlib import Path

import pandapower as pp

# fider.ts ile birebir aynı veriler (Southwire ACSR SPEC 80100)
ILETKENLER = [
    {"ad": "Partridge (266,8 MCM)", "R": 0.0779 * 3.28084, "GMRmm": 0.0217 * 304.8, "amper": 475},
    {"ad": "Hawk (477 MCM)", "R": 0.0436 * 3.28084, "GMRmm": 0.0289 * 304.8, "amper": 659},
    {"ad": "Drake (795 MCM)", "R": 0.0263 * 3.28084, "GMRmm": 0.0373 * 304.8, "amper": 907},
]
GERILIM_KV = 34.5
DEQ_M = 1.5          # eşdeğer faz açıklığı
SINIR_YUZDE = 2.0    # VDE-AR-N 4110 §5.3.2
C_NF_KM = 9.5        # havai hat faz-toprak kapasitansı; formülde yok, yük akışında var


def reaktans(ilt: dict, deq_m: float = DEQ_M) -> float:
    """X, Ω/km — fider.ts'teki reaktans() fonksiyonunun aynısı."""
    return 2 * math.pi * 50 * 2e-7 * math.log((deq_m * 1000) / ilt["GMRmm"]) * 1000


def formul_gerilim_degisimi(ilt: dict, mesafe_km: float, cos_phi: float, p_mw: float) -> float:
    """fider.ts → gerilimDegisimi(). Yüzde cinsinden ΔU."""
    x = reaktans(ilt)
    tan_phi = math.tan(math.acos(min(1.0, max(0.8, cos_phi))))
    return 100 * mesafe_km * (ilt["R"] * p_mw - x * p_mw * tan_phi) / GERILIM_KV ** 2


def formul_gerilim_mw(ilt: dict, mesafe_km: float, cos_phi: float) -> float:
    """fider.ts → fiderKapasitesi().gerilimMW."""
    x = reaktans(ilt)
    tan_phi = math.tan(math.acos(min(1.0, max(0.8, cos_phi))))
    etkin = ilt["R"] - x * tan_phi
    if etkin <= 1e-6:
        return math.inf
    return (SINIR_YUZDE / 100) * GERILIM_KV ** 2 / (mesafe_km * etkin)


def yuk_akisi(ilt: dict, mesafe_km: float, cos_phi: float, p_mw: float):
    """pandapower ile fider sonundaki gerçek ΔU, yüzde.

    Çözüm yakınsamazsa None döner. Yakınsamama fiziksel bir cevaptır: o güçte
    hattın kararlı bir çalışma noktası yok (gerilim çökmesi). İkiye bölme bunu
    "sınırın üstünde" sayar.
    """
    net = pp.create_empty_network(sn_mva=100)
    tm = pp.create_bus(net, vn_kv=GERILIM_KV, name="TM barasi")
    uc = pp.create_bus(net, vn_kv=GERILIM_KV, name="fider sonu")
    pp.create_ext_grid(net, tm, vm_pu=1.0)
    pp.create_line_from_parameters(
        net, tm, uc, length_km=mesafe_km,
        r_ohm_per_km=ilt["R"], x_ohm_per_km=reaktans(ilt),
        c_nf_per_km=C_NF_KM, max_i_ka=ilt["amper"] / 1000,
    )
    # cosφ < 1 endüktif: üretim reaktif güç ÇEKER → q negatif
    tan_phi = math.tan(math.acos(min(1.0, max(0.8, cos_phi))))
    pp.create_sgen(net, uc, p_mw=p_mw, q_mvar=-p_mw * tan_phi)
    try:
        pp.runpp(net, algorithm="nr", calculate_voltage_angles=True)
    except pp.LoadflowNotConverged:
        return None
    return float((net.res_bus.vm_pu.at[uc] - 1.0) * 100)


def asiyor_mu(ilt: dict, mesafe_km: float, cos_phi: float, p_mw: float) -> bool:
    """Bu güçte ΔU sınırı aşılıyor mu? Yakınsamama da aşım sayılır."""
    d = yuk_akisi(ilt, mesafe_km, cos_phi, p_mw)
    return d is None or d >= SINIR_YUZDE


def ikiye_bolme(ilt: dict, mesafe_km: float, cos_phi: float) -> float:
    """pandapower'da ΔU = SINIR_YUZDE yapan P, MW.

    Üst sınır sabit değil: aşım bulunana kadar iki katına çıkarılır. Sabit bir
    üst sınır (ör. 200 MW) 34,5 kV hatta gerilim çökmesine düşüp çözümü
    yakınsamaz hale getiriyordu.
    """
    alt, ust = 0.0, max(1.0, formul_gerilim_mw(ilt, mesafe_km, cos_phi))
    for _ in range(20):
        if asiyor_mu(ilt, mesafe_km, cos_phi, ust):
            break
        alt, ust = ust, ust * 2
    else:
        return math.inf
    for _ in range(60):
        orta = (alt + ust) / 2
        if asiyor_mu(ilt, mesafe_km, cos_phi, orta):
            ust = orta
        else:
            alt = orta
    return (alt + ust) / 2


def main() -> None:
    satirlar, kapasiteler, yakinsamayan = [], [], []
    for ilt in ILETKENLER:
        for mesafe in (2, 5, 10, 15, 20):
            for cos_phi in (1.00, 0.95):
                tavan = formul_gerilim_mw(ilt, mesafe, cos_phi)
                if not math.isfinite(tavan):
                    continue
                for pay in (0.1, 0.25, 0.5, 0.75, 1.0, 1.25):
                    p = tavan * pay
                    f = formul_gerilim_degisimi(ilt, mesafe, cos_phi, p)
                    y = yuk_akisi(ilt, mesafe, cos_phi, p)
                    if y is None:
                        yakinsamayan.append({"iletken": ilt["ad"], "mesafe_km": mesafe,
                                             "cos_phi": cos_phi, "P_MW": round(p, 3)})
                        continue
                    satirlar.append({
                        "iletken": ilt["ad"], "mesafe_km": mesafe, "cos_phi": cos_phi,
                        "P_MW": round(p, 3), "formul_yuzde": round(f, 4),
                        "yuk_akisi_yuzde": round(y, 4), "fark_puan": round(f - y, 4),
                    })
                gercek = ikiye_bolme(ilt, mesafe, cos_phi)
                kapasiteler.append({
                    "iletken": ilt["ad"], "mesafe_km": mesafe, "cos_phi": cos_phi,
                    "formul_MW": round(tavan, 3), "yuk_akisi_MW": round(gercek, 3),
                    "fark_yuzde": round(100 * (tavan - gercek) / gercek, 3),
                })

    farklar = [abs(s["fark_puan"]) for s in satirlar]
    kap_farklar = [abs(k["fark_yuzde"]) for k in kapasiteler]
    calisma = [s for s in satirlar if abs(s["formul_yuzde"]) <= SINIR_YUZDE]
    calisma_fark = [abs(s["fark_puan"]) for s in calisma]
    en_kotu = max(satirlar, key=lambda s: abs(s["fark_puan"]))
    en_kotu_kap = max(kapasiteler, key=lambda k: abs(k["fark_yuzde"]))

    # Yön analizi: asıl soru "fark ne kadar" değil, "hangi yöne". Formül gerçekten
    # BÜYÜK kapasite veriyorsa iyimser ve tehlikeli; küçük veriyorsa muhafazakâr.
    iyimser_kap = [k for k in kapasiteler if k["fark_yuzde"] > 0]
    iyimser_du = [s for s in calisma if s["fark_puan"] < 0]
    en_iyimser_du = min(calisma, key=lambda s: s["fark_puan"])

    rapor = {
        "ne": "fider.ts kısa hat gerilim formülünün pandapower yük akışına karşı doğrulaması",
        "arac": f"pandapower {pp.__version__}, Newton-Raphson",
        "kurulum": f"2 bara, {GERILIM_KV} kV, slack TM barası, uçta P enjekte eden üretim; "
                   f"hat kapasitansı {C_NF_KM} nF/km (formülde yok, yük akışında var)",
        "durum_sayisi": len(satirlar),
        "yakinsamayan_durumlar": yakinsamayan,
        "calisma_araligi": {
            "tanim": f"formülün |ΔU| ≤ %{SINIR_YUZDE} verdiği durumlar — uygulamanın fiilen kullandığı aralık",
            "durum_sayisi": len(calisma),
            "ortalama_mutlak_fark_puan": round(sum(calisma_fark) / len(calisma), 5),
            "azami_mutlak_fark_puan": round(max(calisma_fark), 5),
        },
        "tum_aralik": {
            "ortalama_mutlak_fark_puan": round(sum(farklar) / len(farklar), 5),
            "azami_mutlak_fark_puan": round(max(farklar), 5),
            "en_kotu_durum": en_kotu,
        },
        "kapasite_karsilastirmasi": {
            "tanim": f"ΔU = %{SINIR_YUZDE} sınırına denk gelen azami güç: kapalı formül vs ikiye bölme ile yük akışı",
            "ortalama_mutlak_fark_yuzde": round(sum(kap_farklar) / len(kap_farklar), 4),
            "azami_mutlak_fark_yuzde": round(max(kap_farklar), 4),
            "en_kotu_durum": en_kotu_kap,
            "yon": "formül gerçekten büyükse pozitif (iyimser), küçükse negatif (muhafazakâr)",
        },
        "yon_analizi": {
            "soru": "Formül gerçek kapasiteden BÜYÜK bir sayı veriyor mu? (iyimser = tehlikeli)",
            "iyimser_kapasite_durumu": len(iyimser_kap),
            "toplam_kapasite_durumu": len(kapasiteler),
            "iyimser_delta_u_durumu": len(iyimser_du),
            "toplam_calisma_durumu": len(calisma),
            "en_iyimser_delta_u_puan": round(en_iyimser_du["fark_puan"], 5),
            "en_iyimser_delta_u_durumu": en_iyimser_du,
            "sonuc": ("Hicbir durumda iyimser degil; formul her durumda gercek kapasiteden "
                      "kucuk, yani muhafazakar."
                      if not iyimser_kap else
                      f"{len(iyimser_kap)} durumda iyimser; incelenmeli."),
            "neden_cosphi_daha_muhafazakar": (
                "cosφ<1'de R·P ile X·Q birbirini büyük ölçüde götürüyor; birinci dereceden "
                "terim küçülünce ihmal edilen ikinci dereceden terim göreli olarak büyüyor. "
                "Sapma bu yüzden cosφ=0,95'te daha büyük — ve muhafazakâr yönde: gerçek "
                "kapasite formülün söylediğinden fazla."),
        },
        "kapsam_disi": [
            "fider üzerindeki ara yükler ve dallanma",
            "kademe değiştirici (OLTC) tepkisi",
            "dengesiz yük ve tek faz açma",
            "N-1 ve koruma koordinasyonu",
        ],
        "kapasiteler": kapasiteler,
        "durumlar": satirlar,
    }

    cikti = Path(__file__).parent.parent / "web" / "public" / "gerilim_dogrulama.json"
    cikti.write_text(json.dumps(rapor, ensure_ascii=False, indent=1), encoding="utf-8")

    c = rapor["calisma_araligi"]
    k = rapor["kapasite_karsilastirmasi"]
    print(f"pandapower {pp.__version__} · {len(satirlar)} durum çözüldü")
    print(f"Çalışma aralığı (|ΔU| ≤ %{SINIR_YUZDE}, {c['durum_sayisi']} durum): "
          f"ortalama {c['ortalama_mutlak_fark_puan']} puan, azami {c['azami_mutlak_fark_puan']} puan")
    print(f"Tüm aralık: ortalama {rapor['tum_aralik']['ortalama_mutlak_fark_puan']} puan, "
          f"azami {rapor['tum_aralik']['azami_mutlak_fark_puan']} puan")
    print(f"Kapasite: ortalama %{k['ortalama_mutlak_fark_yuzde']}, azami %{k['azami_mutlak_fark_yuzde']}")
    print(f"En kötü kapasite durumu: {en_kotu_kap}")
    y = rapor["yon_analizi"]
    print(f"Yön: {y['iyimser_kapasite_durumu']}/{y['toplam_kapasite_durumu']} kapasite durumunda iyimser; "
          f"çalışma aralığında en iyimser ΔU sapması {y['en_iyimser_delta_u_puan']} puan")
    print(f"→ {y['sonuc']}")
    print(f"Yazıldı: {cikti}")


if __name__ == "__main__":
    main()
