# EDAŞ (MEDAŞ) veri ve görüşme talebi — pilot aşamasının anahtarı

**Neden ayrı bir belge:** TEİAŞ'a giden Bilgi Edinme başvurusu iletim tarafını kapsıyor.
Trafo merkezinin saatlik yükü ise dağıtım şirketinin SCADA'sında. Konya-Karaman bölgesinin
dağıtım şirketi **MEDAŞ (Meram Elektrik Dağıtım A.Ş.)**.

**Hukuki fark:** MEDAŞ özel bir şirket, 4982 sayılı kanun kapsamında değil. Yani Bilgi Edinme
zorunluluğu yok; bu bir **işbirliği talebi**. O yüzden dili farklı: talep değil, teklif.
Karşılığında onlara ne verdiğimizi yazmak başarı şansını belirgin artırır.

**Kime:** MEDAŞ Şebeke Planlama / AR-GE birimi. Genel iletişim: medas.com.tr
**Nasıl:** Önce e-posta, cevap gelmezse ODTÜ Çevre Mühendisliği bölümünden resmî üst yazı.
**Ne zaman:** Hemen. Cevap finale yetişmese bile "başvurduk" demek kanıttır.

---

## E-posta taslağı

**Konu:** Akademik çalışma — trafo merkezi yük verisi ve 20 dakikalık görüşme talebi

Sayın Yetkili,

Orta Doğu Teknik Üniversitesi Çevre Mühendisliği bölümü öğrencisiyim. Siemens, YGA ve
UP School iş birliğiyle yürütülen Climathon 2026 kapsamında, lisanssız güneş başvurularının
"kapasite yetersizliği" gerekçesiyle reddedildiği trafo merkezlerine kısıntı koşullu (esnek)
bağlantıyla ne kadar ek kapasite verilebileceğini modelleyen açık kaynaklı bir araç geliştirdim.

Araç şu an TEİAŞ'ın yayımladığı kapasite tablosunu, Open-Meteo'nun 20 yıllık ışınım verisini
ve EPİAŞ'ın ulusal saatlik tüketimini kullanıyor. Çalışan sürüm: esnek-baglanti.vercel.app

Hesaptaki tek varsayım, trafo merkezinin tepe yükü. Bu veri kamuya açık olmadığı için ulusal
yük profilini ölçekliyorum. Sizden ricam, **Konya bölgesinden bir trafo merkezi için** şu
verilerden sağlayabildiklerinizi paylaşmanız:

1. Bir takvim yılına ait **saatlik yük (çekiş) değerleri** (MW). Mümkün değilse aylık azami /
   asgari yük ya da örnek bir hafta da çalışmayı anlamlı biçimde ilerletir.
2. Trafo merkezinin **trafo gücü (MVA)** ve ters güç akışına izin verilen sınır.
3. Varsa, o TM'ye bağlı mevcut GES'lerin **toplam kurulu gücü**.
4. Mevcut üretimin **hangi fiderlerde ve fider üzerinde hangi noktada** olduğu.
   (Bu madde sonradan eklendi: yaptığımız duyarlılık analizi, aynı fiderde başka
   üretim varsa basit gerilim kontrolünün kapasiteyi fazla gösterdiğini ortaya
   çıkardı. Fider bilgisi olmadan gerilim sayısı paylaşılan fiderde kullanılamıyor.)

Veriler tüketici bilgisi içermeyen toplulaştırılmış değerler olarak yeterlidir; ticari amaçla
kullanılmayacak, sonuçlar MEDAŞ kaynak gösterilerek paylaşılacaktır. Tesis adı yerine
"Konya bölgesinde bir TM" ifadesi kullanılabilir.

**Karşılığında sunabileceğim:** Seçtiğiniz trafo merkezi için hazırlanmış, kısıntı riskini
P50/P90 olarak veren bir analiz raporu ve aracın o TM'ye uyarlanmış hali — ücretsiz ve
açık kaynak. Ayrıca şebeke planlama biriminizden bir mühendisle 20 dakikalık görüşme,
çalışmanın sahadaki karşılığını doğrulamak için çok değerli olur.

Saygılarımla,

Hüseyin Eren Kılıç
Orta Doğu Teknik Üniversitesi, Çevre Mühendisliği
kilichuseyineren@gmail.com

---

## Görüşme olursa sorulacak dört soru

1. Bir GES başvurusunu reddederken hangi sayıya bakıyorsunuz; kalan kapasite nasıl hesaplanıyor?
2. Trafo merkezinin en düşük gündüz yükünü biliyor musunuz, yoksa siz de mi varsayıyorsunuz?
3. Kısıntı koşullu bağlantı önerilse yatırımcı kabul eder miydi; sizin tarafınızda engel ne?
4. EPDK'dan ne gelirse bu uygulamayı başlatabilirsiniz?

Cevaplar dokümanın "Bugün kim kullanır" ve "Bilinen sınırlar" bölümlerine tarihiyle işlenecek.
