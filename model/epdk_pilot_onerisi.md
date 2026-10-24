# EPDK'ya Pilot Uygulama Önerisi (taslak)

**Nereye:** Enerji Piyasası Düzenleme Kurumu — Elektrik Piyasası Dairesi Başkanlığı.
EPDK mevzuat taslaklarını kamuoyu görüşüne açtığında, görüş bildirimi kanalı da kullanılabilir.
**Kimden:** Hüseyin Eren Kılıç — ODTÜ Çevre Mühendisliği
**Konu:** Tek trafo merkezinde kısıntı koşullu (esnek) bağlantı pilot uygulaması önerisi

**Bu belge ne değildir:** Hukuki görüş değildir. Kısıntı koşullu bağlantının
yürürlükteki mevzuatla hangi noktada bağdaştığı, hangi noktada düzenleme
gerektirdiği Kurum'un takdirindedir. Aşağıda bu soru açıkça Kurum'a
yöneltilmektedir; cevaplanmış gibi sunulmamaktadır.

---

## 1. Tespit: kapasite tükeniyor, altyapı değil

TEİAŞ'ın kendi yayımladığı, trafo merkezi bazlı kalan lisanssız üretim
kapasitesi tablosuna göre:

| | 16.07.2026 | 01.10.2026 | Değişim |
|---|---|---|---|
| Kalan kapasite | 833,59 MWe | **625,10 MWe** | −%25 |
| Kapasitesi tamamen dolmuş TM | 331 | **346** | +15 |
| Tabloda yer alan TM | 791 | 794 | +3 |

İki buçuk ayda ülke genelindeki kalan kapasitenin dörtte biri tükendi.
794 trafo merkezinin 346'sında (%43,6) kalan kapasite sıfır. Üç ilde
(Ardahan, Kırıkkale, Yalova) hiçbir trafo merkezinde kapasite kalmadı.

Bu TM'lere yapılan başvurular reddediliyor. Ret gerekçesi fiziksel bir sınır
değil, **kuralın biçimi**: kapasite, üretimin yıl boyunca her saat azami
değerde olacağı varsayımıyla statik olarak tahsis ediliyor.

## 2. Esnek bağlantı nedir

Yatırımcı, şebekenin kritik olduğu az sayıda saatte üretimini kısmayı
sözleşmeyle kabul eder; karşılığında statik kuralın kapasite yok dediği
trafo merkezine bağlanabilir. Mevcut santrallerin kapasitesine dokunulmaz:
kısıntı önce yeni projeye uygulanır.

Birleşik Krallık'ta dağıtım şirketleri bu bağlantı tipini "flexible connection"
adıyla yıllardır uyguluyor. Bizim çalışmamızın UKPN yönteminden farkı,
kısıntı riskinin tek bir sayı değil, dağılım olarak verilmesi.

## 3. Önerilen pilot

**Kapsam:** Konya–Karaman bölgesinde, kalan kapasitesi sıfır olan tek bir
trafo merkezi. Birinci aday Karapınar TM (72 MW azami, 72 MW tahsisli,
kalan 0 MW). Bölgede bu çalışmanın kapsadığı 23 TM için hazır analiz var.

**Süre:** 12 ay. İlk 3 ay veri ve ölçüm, 9 ay işletme gözlemi.

**Taraflar:** EPDK (düzenleyici çerçeve), TEİAŞ (kapasite verisi ve bağlantı
görüşü), ilgili EDAŞ (SCADA ölçümü ve işletme), bir yatırımcı (pilot proje).

**Ölçülecek:** Fiilen gerçekleşen kısıntı saatleri ve enerjisi; bunun
modelin P50/P90 tahminiyle karşılaştırması; mevcut santrallerin etkilenip
etkilenmediği; gerilim ve ekipman yüklenmesi.

**Başarı ölçütü baştan tanımlanır:** Gerçekleşen yıllık kısıntı oranı modelin
P90 bandının içinde kalırsa yöntem doğrulanmış sayılır. Dışına çıkarsa
nedeni raporlanır — bu da bir sonuçtur.

## 4. Kurum'a yöneltilen sorular

1. Kısıntı koşullu bağlantı, yürürlükteki bağlantı ve sistem kullanım
   mevzuatıyla, bağlantı anlaşmasına konulacak bir şartla uygulanabilir mi;
   yoksa ayrı bir düzenleme mi gerekir?
2. Kısıntı yükümlülüğünün yaptırımı nasıl kurulur? Uyulmaması hâlinde
   başvurulacak mekanizma nedir?
3. Kısıntıya uğrayan üretim için bir tazmin veya mahsup beklentisi doğar mı?
   Pilotun önerisi: doğmaz — yatırımcı bu koşulu bilerek ve gönüllü kabul eder,
   karşılığında bağlanamayacağı bir noktaya bağlanır.
4. Esnek kapasitenin dağıtımı "ilk gelen alır" mı olmalı, yoksa başka bir
   sıralama ölçütü mü? Mevcut uygulamada küçük yatırımcı ve OSB'ler geride
   kalıyor; esnek kapasite yeni bir pay açtığı için bu soru baştan sorulmalı.

## 5. Neden pilot, neden ulusal değil

Bu çalışmanın ana sayısı **yük bağımsız alt sınır**: trafo merkezinde hiç
tüketici yokmuş gibi, tek kural "toplam üretim TEİAŞ'ın yayımladığı üst sınırı
aşmasın". Yük eklendiğinde kapasite azalmıyor, artıyor. Yani sayı, TM yükü
bilinmediği için küçük tarafta kalıyor.

Gerçek TM yükü Türkiye'de yayımlanmıyor (TEİAŞ YTBS topluyor, yayımlamıyor).
Bu veriyi yalnızca EDAŞ'ın SCADA'sı verebilir. Pilotun ilk çıktısı da budur:
tek bir TM'de gerçek ölçümle, alt sınırın gerçek kapasitenin ne kadar altında
kaldığını göstermek. Ulusal bir karar ancak bundan sonra tartışılabilir.

## 6. Dayanak ve doğrulama

Model ve kod açık: **github.com/HErenKlc/esnek-baglanti** ·
canlı araç: **esnek-baglanti.vercel.app**

| Ne | Kaynak | Doğrulama |
|---|---|---|
| Kapasite ve tahsisli güç | TEİAŞ TM bazlı tablo, 01.10.2026 | Resmî yayın; toplamı tabloyla birebir tutuyor (794 TM, 81 il) |
| Güneş üretimi | PVWatts fizik modeli | pvlib-python ile birebir doğrulandı (fark 5,6·10⁻¹⁷) |
| Hava | Open-Meteo ERA5, 2006–2025 (20 yıl) | Gerçek ölçüm/yeniden analiz |
| Yük şekli ve belirsizliği | EPİAŞ Şeffaflık, 2016–2025 (87.623 saat) | 8 yıl geri test; her yıl, kendisini hiç görmemiş modelle sınandı |
| Bağlantı hattı gerilimi | Kısa hat formülü | pandapower yük akışına karşı 150 durumda sınandı; 25 kapasite durumunun hiçbirinde gerçek kapasiteden büyük sayı vermiyor |
| TM saatlik yükü | **Yok** | Ana sayı bu veriyi hiç kullanmıyor. TEİAŞ'a 4982 sayılı kanun kapsamında başvuruldu. |

Modelin bilinen zayıflığı da kayıtlıdır: 8 geri test yılının yedisinde
P5–P95 kapsaması ortalama %89,8 (hedef %90); 2020'de %62,9. Model o yılı
tahmin ederken yalnızca 2016–2018 ile eğitilmişti ve COVID kapanmalarındaki
yük çöküşünü hiçbir geçmiş veri haber vermiyordu. P90 bandı normal iklim ve
talep değişkenliğinin kötü ucunu tanımlar; yapısal bir kriz senaryosu değildir.

---

**Pilot TM'nin esnek kapasite sayısı:** Canlı araçta Karapınar TM seçilip
kısıntı hedefi belirlendiğinde üretilir. Başvuru gününde okunup bu belgeye
tarihle birlikte yazılmalıdır — sayı TEİAŞ tablosu güncellendikçe değişir.

Saygılarımla,
Hüseyin Eren Kılıç
