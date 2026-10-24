# Bağlantı etüdü notu: ne yapıldı, ne yapılamaz, sınır nerede

README şunu söylüyordu: *"Gerçek bağlantı kararı için EDAŞ yük ölçümü, gerilim ve
koruma etütleri gerekir."* Bu not o üç başlığın her birinde nerede durduğumuzu
yazıyor. Amaç etüdün yerine geçmek değil — etüdün neye bakması gerektiğini
daraltmak ve hangi sorunun hâlâ açık olduğunu dürüstçe göstermek.

Üretenler: `gerilim_dogrulama.py`, `fider_duyarlilik.py`, `kisa_devre.py`
Çıktılar: `web/public/gerilim_dogrulama.json`, `fider_duyarlilik.json`, `kisa_devre.json`

---

## 1. EDAŞ yük ölçümü — yapılamaz, üretilemez

TM bazında saatlik yük Türkiye'de yayımlanmıyor. TEİAŞ YTBS topluyor ama
yayımlamıyor; veri yalnızca dağıtım şirketinin SCADA'sında.

**Sentetik veri üretip "ölçüm" demek seçenek değil.** Projenin bütün iddiası
varsayımsız olmak üzerine kurulu; uydurma bir ölçüm bu iddiayı bitirir.

Bunun yerine yapılan: ana sayı bu veriyi hiç kullanmayacak şekilde kurgulandı
(yük bağımsız alt sınır), ölçüm geldiği gün tek dosyayla devreye girecek okuyucu
yazıldı ve test edildi (`web/src/veri/olcum.ts`, biçim örneği
`ornek_olcum_BICIM.csv`), ve veri iki kanaldan istendi:
TEİAŞ'a bilgi edinme başvurusu (gönderildi), MEDAŞ'a iş birliği talebi
(`edas_veri_talebi.md`, **henüz gönderilmedi**).

**Durum: tek gerçek kilit bu. Bekleyen tek şey dosyanın kendisi.**

## 2. Gerilim — iki aşamada yapıldı, bir sınırı bulundu

**Aşama 1 — formül doğru mu?** `gerilim_dogrulama.py`, uygulamanın kısa hat
formülünü pandapower Newton-Raphson yük akışına karşı 150 durumda sınadı
(3 iletken × 5 mesafe × 2 cosφ × 6 güç seviyesi). 25 kapasite durumunun
hiçbirinde formül gerçek kapasiteden büyük sayı vermedi; en iyimser gerilim
sapması 0,02 puan. **Formül kendi varsayımı içinde muhafazakâr.**

**Aşama 2 — varsayımın kendisi güvenli mi?** `fider_duyarlilik.py`, aynı
hesabı gerçekçi bir OG fiderinde tekrarladı: 34,5 kV, 10 km, 10 eşit aralıklı
bara, dağıtık tüketici yükü, gerilim sınırı her barada aranıyor.

| Senaryo (cosφ = 1,0) | Basit kontrol | Fider modeli | Yön |
|---|---|---|---|
| Tahsisli hat (uygulamanın varsaydığı) | 16,64 MW | 17,89 MW | muhafazakâr |
| Fiderde 5 MW yük, santral uçta | 16,64 MW | 23,15 MW | muhafazakâr |
| Fiderde 5 MW yük, santral ortada | 16,64 MW | 43,31 MW | muhafazakâr |
| Yaz öğlesi, 1 MW yük, santral uçta | 16,64 MW | 18,94 MW | muhafazakâr |
| **Fiderde 5 MW mevcut GES** | 16,64 MW | 16,07 MW | **iyimser** |
| **Fiderde 10 MW mevcut GES** | 16,64 MW | 13,22 MW | **iyimser** |
| **Fiderde 20 MW mevcut GES** | 16,64 MW | 7,58 MW | **iyimser** |

**Bulunan açık:** Tüketici yükü ve fiderin ortasına bağlanma kontrolü daha da
muhafazakâr yapıyor. Ama **aynı fiderde başka üretim varsa kontrol iyimser hale
geliyor** — diğer santrallerin enjeksiyonu gerilimi birlikte yükseltiyor ve
yeni santralin tek başına hesaplanan payı yetmiyor. 20 MW mevcut GES'li fiderde
basit kontrol 16,6 MW diyor, gerçek sınır 7,6 MW: iki kattan fazla fark.

cosφ 0,95'te santral reaktif güç çektiği için gerilimi aşağı bastırıyor ve
bütün senaryolarda muhafazakâr kalıyor — paylaşılan fiderde cosφ ayarı
yalnızca bir kolaylık değil, gerçek bir çözüm.

Bu bulgu arayüzün dürüstlük tablosuna yazıldı. Paylaşılan fiderde gerilim
sayısına güvenilmemeli; bağlantı etüdü fiderin tamamına bakmalıdır.

## 3. Koruma — etüt yapılamaz, ama ilk sayı hesaplandı

Koruma etüdü röle karakteristikleri, mevcut ayarlar ve akım trafosu oranları
olmadan yapılamaz; bunlar şebeke güvenliği gerekçesiyle yayımlanmaz.
`kisa_devre.py` etüdün **başladığı** iki sayıyı hesaplıyor (IEC 60909, 3 faz):

**Ekipman dayanımı — sorun değil.** Eviricili GES arıza akımını anma akımının
1,1 katıyla sınırlar (senkron makine 5–6 kat). 40 MW'lık bir santral toplam
arıza akımını 3,30 kA'dan 4,04 kA'ya, yani %22 çıkarıyor. Kesici ve bara
dayanımını tek başına zorlamaz. (Nihai karar TM'nin gerçek kısa devre gücüyle.)

**Ara besleme (infeed) — asıl soru bu.** Santral arızaya kendi payını bastığı
için TM rölesi arıza akımının tamamını görmez:

| GES | Toplam arıza akımı | Rölenin gördüğü | Rölenin görmediği pay |
|---|---|---|---|
| 5 MW | 3,37 kA | 3,28 kA | %2,7 |
| 10 MW | 3,44 kA | 3,25 kA | %5,3 |
| 20 MW | 3,57 kA | 3,21 kA | %10,3 |
| 40 MW | 3,85 kA | 3,11 kA | %19,1 |

(Fider sonu arızası, GES fider ortasında — klasik ara besleme düzeni.)

Röle ayarı toplam akıma göre yapılmışsa açma süresi uzar. **Esnek bağlantıda
bu soru normalden daha önemlidir**, çünkü bağlanan güç statik kuralın izin
verdiğinden büyüktür. Yani koruma etüdü esnek bağlantının önkoşuludur,
sonradan bakılacak bir ayrıntı değil.

pandapower'ın dal sonuçları beta olduğu için sonuç bağımsız sınandı: toplam
akım eksi rölenin gördüğü akım, santralin beklenen katkısına (k·In) %0,24
sapmayla eşit çıktı. (Küçük fark beklenen: IEC 60909 gerilim faktörü c ile
çalışır, anma akımı nominal gerilimde tanımlıdır.)

## 4. Hâlâ EDAŞ/TEİAŞ'tan gereken veriler

Bu üç çalışma temsilî şebeke verisiyle yapıldı. Gerçek etüt için gerekenler:

- TM'nin gerçek kısa devre gücü ve trafo empedansı
- Fiderin gerçek iletkeni, uzunluğu, kesit değişimleri, dallanma yapısı
- Fider üzerindeki mevcut üretimin gücü ve konumu — **gerilim bulgusu bunu
  kritik hale getirdi**
- Aşırı akım rölelerinin karakteristiği ve mevcut ayarları
- Akım trafosu oranları ve doyma sınırları
- Kademe değiştirici (OLTC) ayarları ve tepkisi
- Şebeke kaybı / adalanma koruması gereksinimi
- Yön duyarlı elemanların ters güç akışındaki davranışı
- TM bazında saatlik yük (madde 1)

## 5. Özet

| Başlık | Durum |
|---|---|
| EDAŞ yük ölçümü | **Yapılamaz.** Okuyucu hazır ve test edildi, veri iki kanaldan istendi. |
| Gerilim | **Yapıldı** ve bir açık bulundu: paylaşılan fiderde basit kontrol iyimser. Arayüzde yazılı. |
| Koruma | **Etüt yapılamaz**, ilk iki sayı hesaplandı. Ekipman sorun değil, ara besleme bakılmalı. |
| N-1 | Bilerek kapsam dışı. Konfigürasyon verisi yayımlanmıyor. |

Bu araç bağlantı etüdünün yerine geçmez ve geçtiğini iddia etmez. Yaptığı şey,
etüde girmeden önce sorunun **sorulmaya değer** olup olmadığını gösteren sayıyı
üretmek — ve etüdün hangi soruya öncelik vermesi gerektiğini söylemek.
