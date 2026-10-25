"""UKPN açık veri portalında kısıntı veri setlerini keşfeder (1. adım).

Neden: Türkiye'de ölçülmüş esnek bağlantı kısıntısı yok. UK Power Networks
esnek bağlantıların GERÇEKTE ne kadar kısıldığını yayımlıyor. Bizim yöntemimizi
onların verisine uygulayıp ölçülenle karşılaştırmak, kısıntı tahmininin
kalibre olduğunu gösteren tek dış kanıt.

Bu betik veri setlerinin alanlarını ve örnek satırlarını yazdırır; indirme yapmaz.
Çıktıyı kaydedip paylaş, ikinci adım (geri test) ona göre yazılacak.

Çalıştırma:  python ukpn_kesif.py          (çıktıyı dosyaya al: > ukpn_kesif.txt)
Gereken: internet. Hesap/anahtar GEREKMİYOR, veri açık (UKPN Open Data Portal).
Lisans: UKPN Open Data, atıfla kullanılır.
"""
import json
import sys
import urllib.parse
import urllib.request

KOK = "https://ukpowernetworks.opendatasoft.com/api/explore/v2.1"
ARANAN = ["curtailment", "flexibility", "constraint", "dispatch", "generation"]


def al(yol: str, **parametre):
    url = f"{KOK}/{yol}"
    if parametre:
        url += "?" + urllib.parse.urlencode(parametre)
    istek = urllib.request.Request(url, headers={"User-Agent": "roomforsun/1.0"})
    with urllib.request.urlopen(istek, timeout=60) as y:
        return json.loads(y.read().decode("utf-8"))


def katalog():
    bulunan = {}
    for kelime in ARANAN:
        try:
            s = al("catalog/datasets", where=f'search(*, "{kelime}")', limit=20)
        except Exception as e:
            print(f"  ! '{kelime}' aranamadı: {e}")
            continue
        for d in s.get("results", []):
            kimlik = d.get("dataset_id") or d.get("datasetid")
            meta = (d.get("metas") or {}).get("default", {})
            if kimlik:
                bulunan[kimlik] = meta.get("title", "")
    return bulunan


def alanlar(kimlik: str):
    d = al(f"catalog/datasets/{kimlik}")
    return [(f.get("name"), f.get("type"), f.get("label")) for f in d.get("fields", [])]


def ornek(kimlik: str, n: int = 3):
    return al(f"catalog/datasets/{kimlik}/records", limit=n).get("results", [])


def main():
    print("=== UKPN veri setleri (kısıntı/esneklik ile ilgili) ===")
    bulunan = katalog()
    if not bulunan:
        sys.exit("Hiç veri seti bulunamadı. İnternet bağlantısını kontrol et.")
    for kimlik, baslik in sorted(bulunan.items()):
        print(f"  {kimlik}  —  {baslik}")

    for kimlik in sorted(bulunan):
        print(f"\n=== {kimlik} ===")
        try:
            try:
                toplam = al(f"catalog/datasets/{kimlik}/records", limit=1).get("total_count")
                print(f"satır sayısı: {toplam}")
            except Exception:
                pass
            print("alanlar:")
            for ad, tur, etiket in alanlar(kimlik):
                print(f"  - {ad} ({tur}) {etiket or ''}")
            print("örnek satırlar:")
            for s in ornek(kimlik):
                print("  " + json.dumps(s, ensure_ascii=False)[:600])
        except Exception as e:
            print(f"  ! okunamadı: {e}")


if __name__ == "__main__":
    main()
