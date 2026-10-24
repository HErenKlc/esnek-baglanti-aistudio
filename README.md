# Esnek Bağlantı Motoru

> **Bu repo, projenin Google AI Studio sürümüdür.** Ana proje ve canlı araç: [github.com/HErenKlc/esnek-baglanti](https://github.com/HErenKlc/esnek-baglanti) · [esnek-baglanti.vercel.app](https://esnek-baglanti.vercel.app). AI Studio'da açmak için: [ai.studio/apps/2c1a9d31-ffa0-4cac-823a-fa5b36918101](https://ai.studio/apps/2c1a9d31-ffa0-4cac-823a-fa5b36918101)
> Fark: `web/` altındaki uygulama kodu aynıdır; AI Studio'da çalışması için kökte `server.ts` (planlama notu uç noktası) ve `vite.config.ts` eklendi.

**"Kapasite yok" denen trafo merkezine, kısıntı riskini bilerek ne kadar temiz enerji bağlanabilir?**

Climathon 2026 (Siemens × YGA × UP School) · Hüseyin Eren Kılıç

Canlı araç: **[esnek-baglanti.vercel.app](https://esnek-baglanti.vercel.app)**

Türkiye'de 2024–2025'te 11,6 GW lisanssız GES/RES başvurusunun %65'i kapasite yok denerek reddedildi ([Ember](https://ember-energy.org/latest-insights/turkiye-can-bypass-grid-constraints-with-hybrid-solar-power-plants/grid-connection-capacity-challenges-in-turkiye-and/)). Kapasite, en kötü iki anın (tam üretim + en düşük yük) aynı anda olacağını varsayan statik bir kuralla hesaplanıyor. Bu araç, bir trafo merkezi için gerçek hava ve yük belirsizliğini saat saat simüle ederek esnek (kısılabilir) bağlantıyla kaç MW daha bağlanabileceğini ve bunun yıllık kısıntı bedelini (P50/P90) hesaplar.

TEİAŞ'ın 01.10.2026 tarihli tablosunda 794 trafo merkezinin **346'sında (%43,6) kalan kapasite sıfır**; ülke genelindeki kalan kapasite 2,5 ayda 833,59 MWe'den 625,10 MWe'ye, yani %25 düştü.

## Tek bakışta: Karapınar TM

Statik kurala göre dolu (72 / 72 MW). Trafodaki yük hakkında hiçbir varsayım yapmadan, %5 kısıntı kabulüyle:

| Risk ölçüsü | Eklenebilen güç | Statik kural | Yatırımcıya yıllık satış | Kısıntı bedeli |
| --- | --- | --- | --- | --- |
| P50, tipik yıl | **11,5 MW** | 0 MW | ≈ 57,8 milyon TL | ≈ 3,0 milyon TL |
| P90, kötü yıl (bankanın istediği) | **10,4 MW** | 0 MW | ≈ 52,4 milyon TL | ≈ 2,8 milyon TL |

Para karşılığı = şebekeye verilen ek enerji × elektrik fiyatı. Varsayılan fiyat 2025 yıllık ortalama piyasa takas fiyatı (PTF, EPİAŞ Gün Öncesi Piyasası) 2.618 TL/MWh; arayüzde değiştirilebilir ve MW hesabına girmez. Muhafazakâr bir seçim: Aralık 2025 aylık ortalaması 2.973 TL/MWh (ETKB Aylık Enerji Bülteni, Ocak 2026). Statik kuralda bu gelir sıfırdır, çünkü başvuru reddedilir; esnek bağlantı yeni trafo merkezi gerektirmez. P50 seçiliyken net önlenen emisyon ≈ 11,7 bin tCO₂/yıl (P90 seçiliyken ≈ 10,7 bin). P90 sütunundaki para karşılığı, ortalama üretime kötü yılın kısıntı oranı uygulanarak bulunur.

Arayüz tek link, üç görünüm: **Karar** (EDAŞ planlama mühendisi ve yatırımcı: TM seç, P50/P90 yan yana, para karşılığı, planlama notu), **Bölge ve Türkiye** (23 TM'lik bölge hesabı ve 794 TM'lik ulusal tablo), **Kanıt** (kanıt merdiveni, kısıntı eğrisi, geri test, yük modeli, dürüstlük tablosu). Görünüm linke yazılır (`&s=kanit`).

## COP31 ve Siemens ile nerede durur

COP31'in hedeflerinden biri elektrifikasyonu 2035'e kadar %35'e çıkarmak; artışın büyük kısmının yenilenebilirden gelmesi bekleniyor. Türkiye'de bunun darboğazı panel fiyatı ya da arazi değil, şebeke bağlantısı: yatırım hazır, bağlantı izni yok. Bu araç, yeni trafo merkezi kurmadan (3–5 yıl ve yüksek maliyet) mevcut bakırla ne kadar yer açılabileceğini sayıya döker.

Siemens'in Gridscale X ürün ailesi dağıtım şirketlerine şebekeyi işletirken esnekliği yönetme araçları sunuyor. Esnek Bağlantı Motoru bunun bir adım öncesinde duruyor: **planlama aşamasında**, bir bağlantı başvurusuna "hayır" yerine "şu kadar MW, şu kısıntı riskiyle" cevabını üretiyor. Yani işletme araçlarının ihtiyaç duyduğu bağlantı kararını veriye dayandırıyor. Çerçeve "veri var ama karar yok" boşluğu: TEİAŞ tablosu, hava ve tüketim verisi açık; bunları bağlantı kararına çeviren araç yok.

## Benzerleriyle kıyas

| Örnek | Ne yapıyor | Bu araçtan farkı |
| --- | --- | --- |
| UK Power Networks (İngiltere) esnek bağlantıları | Kısılabilir bağlantı; esnek bağlantılarda ortalama kısıntı ≈ %2 | Kamuya açık bağlantı bazında bir P50/P90 risk aralığı bulamadık |
| Hollanda "non-firm" bağlantı sözleşmeleri | Mevzuatla tanımlı kısılabilir bağlantı | Mevzuat çerçevesi; bağlantı başına risk hesabı aracı değil |
| Siemens Gridscale X | İşletme aşamasında esneklik yönetimi | İşletme tarafı; bu araç planlama tarafında, başvuru anında |
| Türkiye'de bugün | Statik kural: "tam üretim + en düşük yük her saat" | Evet/hayır cevabı; kısıntı riski hiç hesaplanmıyor |

**Bu aracın farkı:** TM yükü bilinmeden bile geçerli, güvenli tarafta kalan bir alt sınır; bankanın istediği P90 kötü yıl; 8 yıllık geri test; ve her katmanın gerçek mi varsayım mı olduğunu yazan bir dürüstlük tablosu.

## Kanıt merdiveni

Ana sayı varsayıma dayanmaz. Üç basamak var, hangisinde olduğunuz arayüzde yazılı:

1. **Yük bağımsız alt sınır (varsayılan).** Trafoda hiç tüketici yokmuş gibi; tek kural "toplam üretim TEİAŞ'ın yayımladığı üst sınırı aşmasın". Yük eklenince kapasite azalmıyor, artıyor — yani bu sayı güvenli tarafta.
2. **Yük şekliyle aralık.** Ulusal saatlik tüketim şekli TM tepesine ölçeklenir; sonuç tek sayı değil, %30–90 tepe aralığı.
3. **EDAŞ SCADA ölçümüyle tek sayı.** 8.760 satırlık saatlik ölçüm dosyası yüklenince varsayım tamamen kalkar (`web/src/veri/olcum.ts`, biçim örneği `model/ornek_olcum_BICIM.csv`).

Üçüncü basamak gerçek veri gelmeden gösterilemediği için, demoda kullanılmak üzere sentetik bir profil var: `model/ornek_olcum_SENTETIK_konya.csv` (üreteci `model/sentetik_olcum.py`). Dosya her satırında kendini işaretler; okuyucu bunu yakalar ve arayüz onu **gerçek ölçüm diye göstermez** — "SENTETİK, iddia değil" etiketiyle gösterir. Manşet sayı bu dosyadan etkilenmez. Yağmur Hanım'ın Build & Show kuralı: sentetik veri boru hattını doğrular, doğruluk iddiası taşımaz.

## Mimari

```
Veri        Open-Meteo hava (canlı)   EPİAŞ saatlik tüketim     TEİAŞ TM kapasite tablosu
               │                          │                           │
Model       GES modeli (PVWatts)      Yük modeli (YZ):            Ters akış sınırı
                                      LightGBM kantil+conformal
               └──────────────┬───────────┴───────────────────────────┘
Simülasyon          110 senaryo × 8.760 saat, esnek kısıntı kuralı, batarya
                              │
Karar               Kabul edilen kısıntıyı aşmayan en yüksek ek MW (ikiye bölme)
                              │
Anlatım       Pano (risk cümlesi, eğri, ısı haritası)  ·  YZ planlama notu
```

| Klasör | İçerik |
| --- | --- |
| `model/train.py` | EPİAŞ verisiyle yük kantil modeli, baseline kıyası, 2026 kantil çıktısı |
| `model/epias_cek.py` | EPİAŞ Şeffaflık'tan 2016–2025 saatlik tüketim |
| `model/pdf_tablo.py`, `trafo_birlestir.py` | TEİAŞ kapasite PDF'lerinin ayrıştırılması ve birleştirilmesi |
| `model/osm_konum.py` | TM'lerin OpenStreetMap'teki gerçek saha konumlarıyla eşleştirilmesi |
| `model/gerilim_dogrulama.py` | Kısa hat gerilim formülünün pandapower yük akışıyla doğrulanması |
| `model/fider_duyarlilik.py` | Basit gerilim kontrolünün gerçekçi OG fiderinde hâlâ geçerli olup olmadığı |
| `model/kisa_devre.py` | Eviricili GES'in arıza akımına katkısı ve rölenin gördüğü akıma etkisi (IEC 60909) |
| `model/baglanti_etut_notu.md` | Yük ölçümü, gerilim ve koruma: ne yapıldı, ne yapılamaz, sınır nerede |
| `model/edas_veri_talebi.md`, `bilgi_edinme_basvurusu.md`, `epdk_pilot_onerisi.md` | Veri talepleri ve pilot önerisi |
| `model/sentetik_olcum.py` | Demo için sentetik TM yük profili — **gerçek ölçüm değildir**, manşet sayıya girmez |
| `model/hava_onbellek.py` | Demo TM'lerinin 20 yıllık hava verisini önceden çeker; uygulama canlı API'ye bağımlı kalmaz |
| `model/kaynak_kirilimi.py` | Bölgedeki kurulu güneş/rüzgâr tesislerini OSM'den sayar — ölçüldü: 1.192 güneş / 84 rüzgâr |
| `web/src/veri` | Open-Meteo istemcisi, TEİAŞ TM tablosu, EDAŞ ölçüm okuyucusu |
| `web/src/sim` | PVWatts GES modeli, senaryo kurma, kısıntı, batarya, fider gerilimi |
| `web/api/ozet.ts` | Vercel fonksiyonu: planlama notu (Gemini, Claude yedekli; anahtar sunucuda) |
| `web/tests` | pvlib karşılaştırması, simülasyon, ölçüm okuyucusu ve fider testleri |

## Çalıştırma

```bash
# Model (isteğe bağlı; çıktıları web/public'te hazır)
cd model
pip install pandas numpy lightgbm holidays scikit-learn
python epias_cek.py        # EPİAŞ hesabı gerekir, .env ile
python train.py

python hava_onbellek.py     # demo TM'lerinin havasını statik dosyaya yazar

pip install pandapower
python gerilim_dogrulama.py
python fider_duyarlilik.py
python kisa_devre.py

# Web
cd web && npm install
npm test          # pvlib karşılaştırması, simülasyon, ölçüm okuyucusu, fider doğrulaması
npm run dev       # http://localhost:5173
```

**Vercel:** Add New → Project → bu depo → Root Directory `web` → Deploy. İsteğe bağlı ortam değişkenleri: `GEMINI_API_KEY`, `GEMINI_MODEL` (varsayılan `gemini-3.8-flash`), `ANTHROPIC_API_KEY`, `SAGLAYICI=claude`. Anahtar yoksa planlama notu şablon metinle üretilir.

## Hangi kısım gerçek

| Katman | Kaynak | Durum |
| --- | --- | --- |
| Hava (eğik yüzey ışınımı, sıcaklık, rüzgâr) | Open-Meteo Historical API, ERA5, 2006–2025 (20 yıl) | Gerçek; demo TM'leri için önceden çekilmiş, diğerleri canlı |
| Yük şekli ve belirsizliği | EPİAŞ Şeffaflık Platformu, ulusal saatlik tüketim 2016–2025 (87.623 saat) | Gerçek |
| TM üst sınırı, tahsisli güç | TEİAŞ TM bazlı kalan kapasite tablosu, 01.10.2026 (794 TM, 81 il) | Resmî |
| TM konumu | OpenStreetMap `power=substation` (≥66 kV); 794 TM'nin 667'si gerçek saha konumundan | Açık veri, il sınırıyla denetlendi |
| Emisyon faktörü | ETKB 2023 şebeke emisyon faktörü; GES yaşam döngüsü IPCC AR5 | Resmî, alt/üst senaryolu |
| Bağlantı hattı gerilimi | Kısa hat formülü, pandapower ile doğrulandı | Tahsisli hatta muhafazakâr; paylaşılan fiderde iyimser olabilir |
| Koruma ve kısa devre | IEC 60909, pandapower | İlk sayı hesaplandı; etüt EDAŞ'ta |
| TM saatlik yükü | Yayımlanmıyor; ölçüm yüklenebilir | Ana sayı bu veriyi kullanmaz |
| N-1 güvenlik kriteri | — | Bilerek kapsam dışı |

## Yük modeli: 2025 test yılı (eğitimde görülmedi)

Bölünme kronolojik: 2016–2023 eğitim, 2024 kalibrasyon, 2025 test (8.760 saat).

| Yöntem | Pinball kaybı | P5–P95 kapsama | P50 MAPE |
| --- | --- | --- | --- |
| Naif: geçen yılın aynı saati | – | – | %5,28 |
| Ay × saat × gün tipi kantil tablosu | 0,01264 | %87,4 | %4,44 |
| LightGBM kantil | 0,00965 | %83,7 | %3,23 |
| **LightGBM kantil + conformal** | **0,00962** | **%93,3** | **%3,23** |

Geri test 8 yıl: her yıl, kendisini hiç görmemiş bir modelle sınandı. Yedi yılda P5–P95 kapsaması ortalama %89,8 (hedef %90). Tek istisna **2020: %62,9** — model o yılı tahmin ederken yalnızca 2016–2018 ile eğitilmişti ve COVID kapanmalarındaki yük çöküşünü hiçbir geçmiş veri haber vermiyordu. P90 bandı normal iklim ve talep değişkenliğinin kötü ucunu tanımlar, yapısal bir kriz senaryosunu değil.

## Gerilim formülünün doğrulanması

`web/src/sim/fider.ts` içindeki kısa hat formülü (ΔU ≈ L·(R·P − X·Q)/U²), pandapower Newton-Raphson yük akışına karşı 150 durumda sınandı (3 iletken × 5 mesafe × 2 cosφ × 6 güç seviyesi). Sonuç: **25 kapasite durumunun hiçbirinde formül gerçek kapasiteden büyük bir sayı vermiyor**; çalışma aralığında en iyimser gerilim sapması 0,02 puan. cosφ<1'de sapma büyüyor, çünkü R·P ile X·Q birbirini götürünce ihmal edilen ikinci dereceden terim göreli olarak büyüyor — yönü yine muhafazakâr. Üretici: `model/gerilim_dogrulama.py` → `web/public/gerilim_dogrulama.json`.

**Ama varsayımın kendisi her zaman güvenli değil.** `model/fider_duyarlilik.py`, aynı hesabı gerçekçi bir OG fiderinde tekrarlıyor (10 bara, dağıtık yük, gerilim sınırı her barada aranıyor). Tüketici yükü ve fiderin ortasına bağlanma kontrolü daha da muhafazakâr yapıyor; ama **aynı fiderde başka üretim varsa kontrol iyimser hale geliyor** — fiderde 20 MW mevcut GES varken basit kontrol 16,64 MW diyor, gerçek sınır 7,58 MW. Paylaşılan fiderde bu sayıya güvenilmemeli. Bulgu arayüzün dürüstlük tablosunda yazılı.

## Koruma: etüt değil, etüdün ilk sayısı

Koruma etüdü röle ayarları ve akım trafosu oranları olmadan yapılamaz; bunlar yayımlanmaz. `model/kisa_devre.py` etüdün başladığı iki sayıyı hesaplıyor (IEC 60909, 3 faz, pandapower):

- **Ekipman dayanımı sorun değil.** Eviricili GES arıza akımını anma akımının 1,1 katıyla sınırlar; 40 MW'lık santral toplam arıza akımını %22 artırıyor (3,30 → 4,04 kA). Senkron makinenin 5–6 katlık katkısının yanında küçük.
- **Ara besleme (infeed) asıl soru.** Santral arızaya kendi payını bastığı için TM rölesi arıza akımının tamamını görmez: 40 MW'ta görmediği pay %19,1. Röle ayarı buna göre gözden geçirilmezse açma süresi uzar. Esnek bağlantıda bağlanan güç statik kuraldan büyük olduğu için bu etüt önkoşuldur.

Ayrıntı ve hâlâ EDAŞ'tan gereken veri listesi: `model/baglanti_etut_notu.md`.

## Tahsisli gücün GES sayılması — ölçüldü

TEİAŞ'ın tablosu GES ve RES'i tek sütunda veriyor; uygulama tahsisli gücün tamamını GES kabul ediyor. Bu kabulün bölgede savunulabilir olup olmadığı 18 Ekim'de ölçüldü (`model/kaynak_kirilimi.py`, OpenStreetMap / ODbL):

| | Güneş | Rüzgâr |
|---|---|---|
| Haritalanmış tesis | **1.192** | **84** |
| Güç etiketi taşıyan | 22 (%1,8) | 10 (%11,9) |
| Etiketli toplam güç | 1.882,5 MW | 256,4 MW |

Sayıca 14 kat, etiketli güçte 7 kat fark. İkinci sayı tek başına dayanak değil — etiketleme oranları çok farklı olduğu için iki toplamı doğrudan karşılaştırmak yanıltıcı olur. Değerli olan, farklı yanlılıkları olan iki ölçünün aynı yöne işaret etmesi. **Rüzgâr sıfır değil**, ama güneşin yanında küçük kalıyor; tahsisli gücü GES saymak bu bölgede savunulabilir.

Bu ölçüm TEİAŞ'ın tahsisli güç sütununu *karşılamaz*: o sütun kurulmamış tahsisleri de sayıyor, OSM ise yalnızca sahada olanı görüyor ve küçük çatı GES'lerini kaçırıyor. Tam ayrıştırma için EDAŞ fider verisi gerekiyor.

## Yöntemin geçerlilik sınırı

Simülasyon 25 trafo merkezinde (Konya–Karaman) çalışıyor; ulusal tablo 794 merkezi gösteriyor ama orada simülasyon yok. Bunun iki sebebi var ve ikisi de aracın sınırını tarif ediyor:

1. **Veri.** Ters akış sınırı için TM'nin *azami* kapasitesi gerekir; TEİAŞ yalnızca *kalan* kapasiteyi yayımlar. Azami güç ikinci bir tabloyla birleştirilerek 183 TM / 45 il için çıkarıldı, kalan 611 merkez için çıkarılamadı.
2. **Kaynak karışımı bölgesel.** Tahsisli gücün tamamını GES saymak Konya'da savunulabilir çünkü bölgede rüzgâr marjinal. Aynı varsayım rüzgârın güçlü olduğu bir ilde yanlış olurdu — rüzgâr gece de ürettiği için ters akış tablosu değişir. **Yöntem ulusal ölçeğe taşınabilir, sayılar taşınamaz:** her bölge için kaynak karışımı yeniden ölçülmelidir (`model/kaynak_kirilimi.py`).

Ulusal tablo bu yüzden bir kapasite iddiası değil, problemin büyüklüğünün fotoğrafıdır.

## Etkinin karşı-olgusal tabanı

Emisyon hesabı "esnek bağlantı olmasaydı bu MW hiç bağlanmazdı" der. Bu bir varsayım olarak bırakılmadı; TEİAŞ'ın kendi tablosuyla sınırlandı.

2024–2025'te reddedilen lisanssız güç ≈ **7.540 MW** (Ember: 11,6 GW'ın %65'i). TEİAŞ'ın 01.10.2026 tablosunda ülke genelinde kalan kapasite **625,10 MWe**. Kalan kapasitenin *tamamı* reddedilen projelere verilse bile en fazla **%8,3**'ü başka bir trafo merkezine taşınabilir; **%91,7**'sinin gidecek yeri yoktur. Uygulamadaki emisyon sayısından bu taşınma payı düşülür.

Üstelik %8,3 cömert bir üst sınır: kalan kapasite 81 ile dağılmış durumda ve reddedilen projenin bulunduğu bölgede olmayabilir. Üç ilde (Ardahan, Kırıkkale, Yalova) hiçbir TM'de kapasite kalmamıştır.

## Yapay zekâ nerede, nasıl kullanıldı

**Çözümün içinde.** Kullanıcının gördüğü P50/P90 sayısını yük modeli üretiyor: EPİAŞ'ın 10 yıllık saatlik tüketiminden eğitilen LightGBM kantil regresyonu + conformal kalibrasyon. Model olmadan o sayı yok. Gemini ise yalnızca simülasyonun JSON çıktısını EDAŞ planlama mühendisinin okuyacağı kısa bir nota çeviriyor; sistem talimatında "JSON'da olmayan hiçbir sayıyı yazma" kuralı var.

**Geliştirirken.** Kod ve doküman taslaklarında Claude'u (Anthropic) yardımcı olarak kullandım; problem seçimi, yöntem kararları ve sayıların doğrulanması bana ait. Yapay zekânın yazdığı her hesap bağımsız bir referansla sınandı: GES modeli pvlib-python ile, gerilim formülü pandapower yük akışıyla, yük modeli eğitimde görmediği 2025 yılıyla ve 8 yıllık geri testle. pvlib ve pandapower karşılaştırmaları `npm test` içinde kilitli; yük modelinin 2025 testi `model/train.py` çıktısında (`web/public/model_raporu.json`), 8 yıllık geri test arayüzün Kanıt sekmesinde her açılışta yeniden hesaplanıyor.

**Canlıya alma.** GitHub → Vercel (Root Directory `web`). Ağır hesap tarayıcıda; sunucuda yalnızca planlama notu fonksiyonu çalışıyor, API anahtarı istemciye gitmiyor.

**Limitlere takılınca.** Gemini erişilemezse not Claude'a, o da yoksa sabit şablona düşüyor; demo hiçbir durumda boş kalmıyor. Open-Meteo'nun hız sınırı demo sırasında boş ekran riski yarattığı için demo trafolarının 20 yıllık hava verisi önceden çekilip statik dosyaya konuldu (`model/hava_onbellek.py`). Google AI Studio Build modu çekirdek hesabı (tarayıcıda 100+ senaryo × 8.760 saat Monte Carlo ve Python'da eğitilen model) karşılamadığı için uygulama Vite + TypeScript ile yazıldı.

**Yapay zekânın kendi ayak izi.** Yük modeli GPU'suz, sıradan bir bilgisayarda dakikalar içinde eğitiliyor; uygulamadaki hesap kullanıcının tarayıcısında saniyeler sürüyor. Bunun enerji tüketimi, tek bir trafo merkezinde önlenen yıllık ≈ 11.700 tCO₂'nin yanında ihmal edilebilir mertebede.

## Atıf ve lisans

- Hava: [Open-Meteo](https://open-meteo.com) (CC BY 4.0), ERA5 — Copernicus Climate Change Service bilgisi kullanılmıştır.
- Yük: [EPİAŞ Şeffaflık Platformu](https://seffaflik.epias.com.tr), [eptr2](https://pypi.org/project/eptr2/) ile çekildi.
- TM kapasiteleri: TEİAŞ, "2026 Yılı İçin Dağıtım Seviyesinden Transformatör Merkezi Bazlı Tahsis Edilen Güneş ve Rüzgar Kaynaklı Kalan Lisanssız Üretim Kapasiteleri", [teias.gov.tr/duyurular](https://www.teias.gov.tr/duyurular).
- TM konumları: [OpenStreetMap](https://www.openstreetmap.org) katkıcıları (ODbL), Overpass API.
- GES modeli: [pvlib-python](https://github.com/pvlib/pvlib-python) PVWatts ve Faiman modellerinin TypeScript uyarlaması.
- Yük akışı: [pandapower](https://pandapower.org).
- Elektrik fiyatı: EPİAŞ Gün Öncesi Piyasası PTF, 2025 yıllık ortalama ([derleme](https://myenerji.com/2012-2024-ptf-yekdem-fiyatlari/)); karşılaştırma için [ETKB Aylık Enerji Bülteni, Ocak 2026](https://enerji.gov.tr/Media/Dizin/SGB/tr/AYLIK_ENERJI_BULTENI/2026/OCAK/e-BULTEN_Ocak_2026.pdf).

Bu bir prototiptir ve bağlantı etüdünün yerine geçmez. Gerçek bağlantı kararı için EDAŞ'ın SCADA yük ölçümü, fiderin tamamını kapsayan gerilim etüdü ve röle ayarlarıyla yapılan koruma etüdü gerekir. Bu üç başlıkta nerede durulduğu — ne yapıldı, ne yapılamaz, hangi veri hâlâ eksik — `model/baglanti_etut_notu.md` içinde yazılı.
