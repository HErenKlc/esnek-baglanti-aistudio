r"""Eviricili GES'in arıza akımına katkısı ve korumaya etkisi.

Neden: Koruma etüdü, röle ayarları ve akım trafosu oranları olmadan yapılamaz —
bunlar şebeke güvenliği gerekçesiyle hiçbir ülkede yayımlanmaz. Ama koruma
etüdünün BAŞLADIĞI sayı hesaplanabilir: santralin arıza akımına katkısı ve bu
katkının TM'deki rölenin gördüğü akımı ne kadar düşürdüğü.

İki fiziksel gerçek:
  1. Evirici bağlı GES, senkron makineden farklı olarak arıza akımını kendi
     anma akımının ~1,1–1,2 katıyla sınırlar (IEC 60909'da akım kaynağı olarak
     modellenir). Yani katkı küçüktür; ekipman kısa devre dayanımını zorlamaz.
  2. Asıl koruma sorunu bu değil, "ara besleme" (infeed) etkisidir: arıza
     noktasına santral de akım bastığı için TM'deki röle arıza akımının
     tamamını görmez, daha azını görür. Röle ayarı buna göre yapılmadıysa
     geç açar veya hiç açmaz. Bu betiğin ölçtüğü sayı budur.

Kapsam ve dürüstlük: buradaki şebeke temsilîdir. Gerçek ayarlar, akım trafosu
oranları, röle karakteristikleri ve TM'nin kısa devre gücü EDAŞ/TEİAŞ'tadır.
Bu çalışma koruma etüdünün yerine geçmez; etüdün cevaplaması gereken soruyu
sayıyla tarif eder.

Çalıştırma:  python model/kisa_devre.py
Çıktı:       web/public/kisa_devre.json
"""
import json
import sys
from pathlib import Path

import pandapower as pp
import pandapower.shortcircuit as sc

sys.path.insert(0, str(Path(__file__).parent))

from gerilim_dogrulama import GERILIM_KV, ILETKENLER, C_NF_KM, reaktans

ILETKEN = ILETKENLER[1]          # Hawk (477 MCM)
FIDER_KM = 10.0
BARA_SAYISI = 10
TRAFO_MVA = 50.0                 # 154/34,5 kV TM trafosu
TRAFO_UK = 12.0                  # % kısa devre gerilimi
SEBEKE_MVA = 3000.0              # 154 kV barada kısa devre gücü (temsilî)
EVIRICI_K = 1.1                  # Ik''/In — evirici sınırı, IEC 60909 akım kaynağı


def ag_kur(ges_mw: float, ges_konum: float = 1.0):
    net = pp.create_empty_network(sn_mva=100)
    yuksek = pp.create_bus(net, vn_kv=154.0, name="154 kV")
    pp.create_ext_grid(net, yuksek, s_sc_max_mva=SEBEKE_MVA, rx_max=0.1, s_sc_min_mva=SEBEKE_MVA * 0.7, rx_min=0.1)
    baralar = [pp.create_bus(net, vn_kv=GERILIM_KV, name=f"b{i}") for i in range(BARA_SAYISI + 1)]
    pp.create_transformer_from_parameters(
        net, hv_bus=yuksek, lv_bus=baralar[0], sn_mva=TRAFO_MVA,
        vn_hv_kv=154.0, vn_lv_kv=GERILIM_KV, vkr_percent=0.5, vk_percent=TRAFO_UK,
        pfe_kw=30.0, i0_percent=0.1)
    bolum = FIDER_KM / BARA_SAYISI
    for i in range(BARA_SAYISI):
        pp.create_line_from_parameters(
            net, baralar[i], baralar[i + 1], length_km=bolum,
            r_ohm_per_km=ILETKEN["R"], x_ohm_per_km=reaktans(ILETKEN),
            c_nf_per_km=C_NF_KM, max_i_ka=ILETKEN["amper"] / 1000)
    if ges_mw > 0:
        hedef = baralar[max(1, min(BARA_SAYISI, round(ges_konum * BARA_SAYISI)))]
        # Evirici: IEC 60909'da akım kaynağı, k = Ik''/In
        pp.create_sgen(net, hedef, p_mw=ges_mw, q_mvar=0.0, sn_mva=ges_mw,
                       current_source=True, k=EVIRICI_K)
    return net, baralar


def ariza(ges_mw: float, ariza_bara_idx: int, ges_konum: float = 1.0):
    """Üç faz kısa devre: toplam arıza akımı ve TM kesicisinin gördüğü akım (kA).

    pandapower'ın dal (branch) sonuçları beta; bu yüzden sonuç bağımsız olarak
    sınanır: TM'nin gördüğü akım ile toplamın farkı, santralin IEC 60909'a göre
    beklenen katkısına (k·In) eşit olmalı. main() bunu her durumda kontrol eder.
    """
    net, baralar = ag_kur(ges_mw, ges_konum)
    hedef = baralar[ariza_bara_idx]
    sc.calc_sc(net, fault="3ph", case="max", branch_results=True, bus=hedef)
    toplam = float(net.res_bus_sc.ikss_ka.at[hedef])
    ilk_hat = net.line.index[0]   # TM'den çıkan ilk bölüm = rölenin gördüğü yer
    rolenin_gordugu = float(net.res_line_sc.ikss_ka.at[ilk_hat])
    return toplam, rolenin_gordugu


def main() -> None:
    satirlar, dogrulama_sapmasi = [], 0.0
    durumlar = [
        (BARA_SAYISI, 1.0, "fider sonu arızası, GES fider sonunda"),
        (BARA_SAYISI, 0.5, "fider sonu arızası, GES fider ortasında (klasik ara besleme)"),
        (BARA_SAYISI // 2, 0.5, "fider ortası arızası, GES fider ortasında"),
    ]
    for ariza_idx, ges_konum, ad in durumlar:
        temiz_toplam, temiz_role = ariza(0.0, ariza_idx, ges_konum)
        for ges_mw in (5, 10, 20, 40):
            toplam, role = ariza(ges_mw, ariza_idx, ges_konum)
            anma_akimi_ka = ges_mw / (3 ** 0.5 * GERILIM_KV)      # MVA≈MW, cosφ≈1
            beklenen_katki = anma_akimi_ka * EVIRICI_K
            # Bağımsız sınama: toplam − rölenin gördüğü = santralin katkısı olmalı
            olculen_katki = toplam - role
            dogrulama_sapmasi = max(dogrulama_sapmasi,
                                    abs(olculen_katki - beklenen_katki) / beklenen_katki)
            satirlar.append({
                "durum": ad,
                "ariza_bara": ariza_idx, "GES_konumu": ges_konum,
                "GES_MW": ges_mw,
                "GES_anma_akimi_kA": round(anma_akimi_ka, 4),
                "beklenen_katki_kA": round(beklenen_katki, 4),
                "olculen_katki_kA": round(olculen_katki, 4),
                "toplam_ariza_akimi_kA": round(toplam, 4),
                "GES_yokken_toplam_kA": round(temiz_toplam, 4),
                "rolenin_gordugu_kA": round(role, 4),
                "rolenin_gormedigi_pay_yuzde": round(100 * olculen_katki / toplam, 2),
                "toplam_akim_artisi_yuzde": round(100 * (toplam - temiz_toplam) / temiz_toplam, 2),
            })

    en_kotu = max(satirlar, key=lambda s: s["rolenin_gormedigi_pay_yuzde"])
    en_cok_artis = max(satirlar, key=lambda s: s["toplam_akim_artisi_yuzde"])
    rapor = {
        "ne": "Eviricili GES'in üç faz kısa devre akımına katkısı ve TM rölesinin gördüğü akıma etkisi",
        "arac": f"pandapower {pp.__version__} shortcircuit, IEC 60909, 3ph, case=max",
        "kurulum": (f"154 kV şebeke {SEBEKE_MVA:.0f} MVA kısa devre gücü → {TRAFO_MVA:.0f} MVA "
                    f"154/{GERILIM_KV} kV trafo (uk %{TRAFO_UK}) → {FIDER_KM:.0f} km "
                    f"{ILETKEN['ad']} fider. GES fider sonunda, evirici k={EVIRICI_K}."),
        "temsili": ("Şebeke kısa devre gücü, trafo ve fider verileri temsilîdir. Gerçek değerler, "
                    "röle karakteristikleri ve akım trafosu oranları EDAŞ/TEİAŞ'tadır. "
                    "Bu çalışma koruma etüdünün yerine geçmez."),
        "dogrulama": {
            "yontem": ("pandapower'ın dal sonuçları beta olduğu için bağımsız sınandı: "
                       "toplam arıza akımı eksi rölenin gördüğü akım, santralin IEC 60909'a "
                       "göre beklenen katkısına (k·In) eşit olmalı. Küçük bir fark beklenir: "
                       "IEC 60909 gerilim faktörü c ile çalışır, anma akımı ise nominal "
                       "gerilimde tanımlıdır."),
            "azami_bagil_sapma_yuzde": round(100 * dogrulama_sapmasi, 3),
            "esik_yuzde": 1.0,
            "sonuc": "tutarlı" if dogrulama_sapmasi < 0.01 else "SAPMA VAR, incelenmeli",
        },
        "bulgu_1_ekipman": (
            f"Eviricili GES'in arıza akımı katkısı anma akımının {EVIRICI_K} katıyla sınırlı. "
            f"Sınanan en büyük durumda toplam arıza akımı yalnızca "
            f"%{en_cok_artis['toplam_akim_artisi_yuzde']} artıyor ({en_cok_artis['GES_MW']} MW). "
            f"Senkron makinenin 5–6 katlık katkısının yanında küçüktür; mevcut kesici ve bara "
            f"kısa devre dayanımını tek başına zorlamaz. Yine de nihai karar TM'nin gerçek "
            f"kısa devre gücüyle verilir."),
        "bulgu_2_koruma": (
            f"Asıl etki ara beslemede (infeed): GES arızaya kendi payını bastığı için TM rölesi "
            f"arıza akımının tamamını görmez. Sınanan durumlarda rölenin görmediği pay en çok "
            f"%{en_kotu['rolenin_gormedigi_pay_yuzde']} ({en_kotu['GES_MW']} MW GES, "
            f"{en_kotu['durum']}). Röle ayarı toplam akıma göre yapılmışsa açma süresi uzar. "
            f"Esnek bağlantıda bu soru daha da önemlidir, çünkü bağlanan güç statik kuralın "
            f"izin verdiğinden büyüktür — yani koruma etüdü esnek bağlantının önkoşuludur, "
            f"sonradan bakılacak bir ayrıntı değildir."),
        "en_kotu_infeed": en_kotu,
        "en_cok_akim_artisi": en_cok_artis,
        "evirici_k_notu": (f"k={EVIRICI_K} tipik bir evirici sınırıdır (IEC 60909 akım kaynağı modeli). "
                           f"Üreticinin beyan ettiği değer 1,0–1,5 arasında değişir ve etüde o değer girer."),
        "hala_EDAS_tan_gerekenler": [
            "TM'nin gerçek kısa devre gücü ve trafo empedansı",
            "fiderin gerçek iletkeni, uzunluğu, kesit değişimleri",
            "aşırı akım rölelerinin karakteristiği ve mevcut ayarları",
            "akım trafosu oranları ve doyma sınırları",
            "şebeke kaybı (loss of mains) / adalanma koruması gereksinimi",
            "yön duyarlı elemanların ters güç akışındaki davranışı",
        ],
        "durumlar": satirlar,
    }
    cikti = Path(__file__).parent.parent / "web" / "public" / "kisa_devre.json"
    cikti.write_text(json.dumps(rapor, ensure_ascii=False, indent=1), encoding="utf-8")

    print(f"pandapower {pp.__version__} · IEC 60909 · {len(satirlar)} durum")
    print(f"Doğrulama: beklenen ve ölçülen katkı arasındaki azami bağıl sapma "
          f"%{rapor['dogrulama']['azami_bagil_sapma_yuzde']} (eşik %1) → {rapor['dogrulama']['sonuc']}")
    for s in satirlar:
        print(f"  GES {s['GES_MW']:>3} MW | toplam {s['toplam_ariza_akimi_kA']:.3f} kA "
              f"(GES'siz {s['GES_yokken_toplam_kA']:.3f}, +%{s['toplam_akim_artisi_yuzde']:.1f}) | "
              f"röle {s['rolenin_gordugu_kA']:.3f} kA → görmediği pay "
              f"%{s['rolenin_gormedigi_pay_yuzde']:.1f} | {s['durum']}")
    print(f"En kötü ara besleme: %{en_kotu['rolenin_gormedigi_pay_yuzde']} "
          f"({en_kotu['GES_MW']} MW, {en_kotu['durum']})")
    print(f"Yazıldı: {cikti}")


if __name__ == "__main__":
    main()
