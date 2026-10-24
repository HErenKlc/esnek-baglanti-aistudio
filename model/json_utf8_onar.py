"""web/public altındaki JSON dosyalarını UTF-8'e çevirir.

Neden: Windows'ta Python'un varsayılan metin kodlaması cp1254 (Türkçe). train.py
JSON'u encoding belirtmeden yazdığında dosya cp1254 oluyor ve tarayıcı onu UTF-8
sanarak okuduğu için "eğitimde" yerine "eðitimde" gibi bozuk karakterler
çıkıyor; en kötü durumda JSON hiç ayrıştırılamıyor.

train.py artık encoding="utf-8" ile yazıyor. Bu betik, önceden bozuk yazılmış
dosyaları onarmak için. Zaten UTF-8 olanlara dokunmaz.

Çalıştırma:  python model/json_utf8_onar.py
"""
import json
import sys
from pathlib import Path

KLASOR = Path(__file__).parent.parent / "web" / "public"


def main() -> None:
    if not KLASOR.is_dir():
        sys.exit(f"{KLASOR} bulunamadı.")
    onarilan = 0
    for dosya in sorted(KLASOR.glob("*.json")):
        ham = dosya.read_bytes()
        try:
            json.loads(ham.decode("utf-8"))
            print(f"  {dosya.name}: UTF-8, dokunulmadı")
            continue
        except (UnicodeDecodeError, json.JSONDecodeError):
            pass
        for kodlama in ("cp1254", "iso-8859-9", "cp1252"):
            try:
                veri = json.loads(ham.decode(kodlama))
            except (UnicodeDecodeError, json.JSONDecodeError):
                continue
            dosya.write_text(json.dumps(veri, ensure_ascii=False,
                                        separators=(",", ":")), encoding="utf-8")
            print(f"  {dosya.name}: {kodlama} -> UTF-8 ({len(ham):,} bayt)")
            onarilan += 1
            break
        else:
            print(f"  {dosya.name}: OKUNAMADI, elle bakın")
    print(f"Onarılan dosya: {onarilan}")


if __name__ == "__main__":
    main()
