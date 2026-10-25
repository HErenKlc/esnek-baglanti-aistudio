import "./stil.css";
import { TRAFOLAR, TRAFO_KAYNAK, KONUM_KAYNAK, type Trafo } from "./veri/trafolar";
import { olcumAyristir, type OlcumSonucu } from "./veri/olcum";
import { havaGetir, HAVA_KAYNAK, HAVA_YILLARI, type HavaSonucu } from "./veri/hava";
import {
  senaryolarKur, olcumSenaryolari, altSinirSenaryolari, pvYillari, dagilim, enYuksekEkMW, egri, statikKalan,
  type YukKantilleri, type Senaryolar, type TrafoGirdisi, type BataryaGirdisi,
} from "./sim/kisinti";
import { egriGrafigi, isiHaritasi, dogrulamaGrafigi } from "./ui/grafik";
import { ILETKENLER, fiderKapasitesi, type FiderGirdisi } from "./sim/fider";
import { geriTestYili, type GeriTestVerisi, type YilSonucu } from "./sim/geritest";

const tr = (x: number, d = 0) => x.toLocaleString("tr-TR", { maximumFractionDigits: d, minimumFractionDigits: d });
const yuzde = (x: number, d = 1) => `%${tr(x * 100, d)}`;

// Emisyon: ETKB "2023 Türkiye Ulusal Elektrik Şebekesi Emisyon Faktörü Bilgi Formu" (yayın Aralık 2025; UNFCCC CDM
// "Tool to calculate the emission factor for an electricity system"). Güneş/rüzgâr projeleri için kombine marj resmî değerdir.
// GES yaşam döngüsü: IPCC AR5 (2014) Ek III, şebeke ölçekli PV medyanı 48 gCO2eq/kWh.
const EF = {
  cm: { deger: 0.6242, ad: "ETKB 2023 kombine marj (güneş/rüzgâr, resmî)" },
  bm: { deger: 0.3567, ad: "ETKB 2023 yapı marjı (muhafazakâr)" },
  om: { deger: 0.7134, ad: "ETKB 2023 işletme marjı (üst sınır)" },
};
const GES_YASAM_DONGUSU = 0.048; // tCO2/MWh

// Karşı-olgusal taban (counterfactual): "esnek bağlantı olmasaydı bu MW hiç bağlanmazdı."
// Bu bir varsayım olarak bırakılmıyor, TEİAŞ'ın kendi tablosuyla sınırlanıyor: reddedilen
// gücün ancak ülkede kalan kapasite kadarı başka bir TM'ye taşınabilir. Kalan kapasitenin
// TAMAMI reddedilenlere verilse bile taşınabilecek pay bu oranla sınırlı; gerisinin
// gidecek yeri yok. Etkiden bu pay düşülüyor — yani sayı muhafazakâr tarafta kalıyor.
// Ember: 2024–2025'te 11,6 GW lisanssız başvurunun %65'i kapasite gerekçesiyle reddedildi.
const REDDEDILEN_MW = 11_600 * 0.65;

/** Reddedilen gücün başka TM'ye taşınabilecek payı (0..1). Ulusal tablo yoksa 0 varsayılmaz: hesap gösterilmez. */
function tasinabilirPay(u: Ulusal | null): number | null {
  if (!u || !(u.toplamKalanMWe > 0)) return null;
  return Math.min(1, u.toplamKalanMWe / REDDEDILEN_MW);
}

// Ekonomik karşılık: ek enerji × elektrik fiyatı. Varsayılan fiyat 2025 yıllık ortalama piyasa takas fiyatı
// (PTF, EPİAŞ Gün Öncesi Piyasası): 2.617,83 TL/MWh — myenerji.com "2012-2026 PTF-YEKDEM fiyatları" derlemesi.
// Muhafazakâr seçim: Aralık 2025 aylık ortalaması 2.973 TL/MWh (ETKB Aylık Enerji Bülteni, Ocak 2026),
// Ekim 2026 günlük PTF'ler 3.200 TL/MWh'nin üzerinde. Kullanıcı kendi fiyatını girebilir.
const PTF_VARSAYILAN = 2618;
const PTF_KAYNAK = "2025 yıllık ortalama PTF, EPİAŞ GÖP";
const milyonTL = (tl: number) => `${tr(tl / 1e6, 1)} milyon TL`;

type Sekme = "karar" | "bolge" | "kanit";
let sekme: Sekme = "karar";

type EfSecim = "cm" | "bm" | "om" | "ozel";
interface Durum {
  ptf: number; // TL/MWh
  trafo: Trafo;
  yukTepeMW: number;
  hedef: number;
  istatistik: "p50" | "p90";
  bataryaSaat: number;
  bataryaOrani: number;
  efSecim: EfSecim;
  efOzel: number;
  iletken: number; // -1 = fider kontrolü kapalı
  mesafeKm: number;
  fiderAdet: number;
  cosPhi: number;
  sinirYuzde: number;
}

const durum: Durum = {
  ptf: PTF_VARSAYILAN,
  trafo: TRAFOLAR.find((t) => t.ad.startsWith("Karapınar"))!,
  yukTepeMW: 40, hedef: 0.05, istatistik: "p50", bataryaSaat: 2, bataryaOrani: 0.3,
  efSecim: "cm", efOzel: 0.45, iletken: -1, mesafeKm: 10, fiderAdet: 2, cosPhi: 1, sinirYuzde: 2,
};
/**
 * EDAŞ ölçüm yükleme alanı — pilot verisi gelene kadar ARAYÜZDE GİZLİ.
 *
 * Mimaride hiçbir şey sökülmedi: okuyucu (veri/olcum.ts), sentetik dosya algılama,
 * ölçüm senaryoları (olcumSenaryolari), olcumYukle() ve tests/olcum.test.ts yerinde.
 * MEDAŞ'tan 8.760 saatlik TM yükü geldiğinde tek yapılacak: bunu true yapmak.
 * Çalışmayan bir düğmeyi jüriye göstermemek için kapatıldı, kaldırılmadı.
 */
const OLCUM_ACIK = false;

const DEQ_M = 1.5; // 34,5 kV havai hatta eşdeğer faz açıklığı (varsayım)
function fiderGirdisi(cos = durum.cosPhi): FiderGirdisi | null {
  const i = ILETKENLER[durum.iletken];
  return i ? { iletken: i, mesafeKm: durum.mesafeKm, gerilimKV: 34.5, cosPhi: cos, sinirYuzde: durum.sinirYuzde, deqM: DEQ_M } : null;
}
function fiderMW(): number | undefined {
  const g = fiderGirdisi();
  return g ? fiderKapasitesi(g).sinirMW * durum.fiderAdet : undefined;
}
const efBrut = () => (durum.efSecim === "ozel" ? durum.efOzel : EF[durum.efSecim].deger);
const efNet = (brut = efBrut()) => Math.max(0, brut - GES_YASAM_DONGUSU);

// Paylaşılabilir senaryo: ayarlar linkin içinde, veritabanı gerekmez
(() => {
  const q = new URLSearchParams(location.search);
  const bul = TRAFOLAR.find((t) => t.ad === q.get("tm"));
  if (bul) durum.trafo = bul;
  const sayi = (k: string, min: number, max: number) => {
    const v = Number(q.get(k));
    return q.has(k) && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined;
  };
  durum.yukTepeMW = sayi("yuk", 10, 120) ?? durum.yukTepeMW;
  durum.hedef = (sayi("hedef", 1, 15) ?? durum.hedef * 100) / 100;
  if (q.get("ist") === "p50" || q.get("ist") === "p90") durum.istatistik = q.get("ist") as "p50" | "p90";
  durum.bataryaOrani = (sayi("batG", 0, 100) ?? durum.bataryaOrani * 100) / 100;
  durum.bataryaSaat = sayi("batS", 0, 8) ?? durum.bataryaSaat;
  const ef = q.get("ef");
  if (ef === "cm" || ef === "bm" || ef === "om") durum.efSecim = ef;
  else if (ef) { const v = sayi("ef", 0.05, 1.2); if (v) { durum.efSecim = "ozel"; durum.efOzel = v; } }
  durum.iletken = Math.round(sayi("il", -1, ILETKENLER.length - 1) ?? -1);
  durum.mesafeKm = sayi("km", 1, 60) ?? durum.mesafeKm;
  durum.fiderAdet = Math.round(sayi("fa", 1, 8) ?? durum.fiderAdet);
  durum.cosPhi = q.get("cos") === "0.95" ? 0.95 : 1;
  durum.sinirYuzde = sayi("du", 0.5, 10) ?? durum.sinirYuzde;
  durum.ptf = sayi("ptf", 100, 20000) ?? durum.ptf;
  const sk = q.get("s");
  if (sk === "bolge" || sk === "kanit") sekme = sk;
})();

function urlYaz() {
  const q = new URLSearchParams({
    tm: durum.trafo.ad, yuk: String(durum.yukTepeMW), hedef: String(+(durum.hedef * 100).toFixed(1)),
    ist: durum.istatistik, batG: String(Math.round(durum.bataryaOrani * 100)), batS: String(durum.bataryaSaat),
    ef: durum.efSecim === "ozel" ? String(durum.efOzel) : durum.efSecim,
  });
  if (durum.iletken >= 0) {
    q.set("il", String(durum.iletken)); q.set("km", String(durum.mesafeKm)); q.set("fa", String(durum.fiderAdet));
    q.set("cos", String(durum.cosPhi)); q.set("du", String(durum.sinirYuzde));
  }
  if (durum.ptf !== PTF_VARSAYILAN) q.set("ptf", String(durum.ptf));
  if (sekme !== "karar") q.set("s", sekme);
  history.replaceState(null, "", `${location.pathname}?${q}`);
}

let yk: YukKantilleri;
/** EDAŞ SCADA ölçümü yüklendiyse yük varsayımı devreden çıkar (kanıt merdiveni 3. basamak). */
let olcum: (OlcumSonucu & { ad: string }) | null = null;
let geriTest: GeriTestVerisi | null = null;

/** TEİAŞ'ın iki tarihli resmî tablosunun özeti; hesap değil, fotoğraf (model/ulusal_ozet.py). */
interface Ulusal {
  tarih: string; oncekiTarih: string; kaynak: string;
  tmSayisi: number; ilSayisi: number; toplamKalanMWe: number; doluTM: number;
  oncekiToplamMWe: number; oncekiDoluTM: number; oncekiTMSayisi: number;
  azalanTM: number; artanTM: number; degisimMWe: number; degisimYuzde: number;
  tamamenDoluIl: string[];
  iller: { il: string; tm: number; dolu: number; kalan: number; doluOran: number }[];
}
let ulusal: Ulusal | null = null;
const trTarih = (g: string) => g.split("-").reverse().join(".");
const geriYillari = () => Object.keys(geriTest?.yillar ?? {}).map(Number).sort((a, b) => a - b);
let rapor: any;
let hava: HavaSonucu | null = null;
let sc: Senaryolar | null = null;
let sonOzet: Record<string, unknown> | null = null;

const app = document.getElementById("app")!;
app.innerHTML = `
<header class="ust">
  <h1>RoomForSun <span class="alt-ad">— Esnek Bağlantı Motoru</span></h1>
  <p>"Kapasite yok" denen trafo merkezine, kısıntı riskini bilerek ne kadar temiz enerji bağlanabilir?</p>
  <button class="rozet paylas" id="paylas">Senaryo linkini kopyala</button>
  <span class="rozet">Climathon 2026 · prototip</span>
  <p class="ust-cop">COP31'in elektrifikasyonu 2035'e kadar %35'e çıkarma hedefinde darboğaz panel değil, şebeke bağlantısı.
    Bu araç bugünkü trafolarla, yeni yatırım beklemeden ne kadar yer açılabileceğini hesaplar.</p>
</header>
<div class="yerlesim">
  <aside class="sol" aria-label="Trafo merkezi ve varsayımlar">
    <h2>Trafo merkezi</h2>
    <p class="not">TEİAŞ lisanssız GES-RES kapasite tablosu. Çubuk: tahsis edilen / yayımlanan üst sınır.</p>
    <div id="liste"></div>
    <div class="ayar">
      <label for="yuk">TM yük tepe değeri <span class="deger" id="yukD"></span></label>
      <input id="yuk" type="range" min="10" max="120" step="1" />
      <small>Varsayım: TM yükü açık veri değil. Şekil gerçek EPİAŞ verisinden. Kanıt merdiveninin ilk basamağı bu varsayımı hiç kullanmaz.</small>

      ${OLCUM_ACIK ? `
      <label for="olcumDosya">EDAŞ ölçümü (pilot)</label>
      <input id="olcumDosya" type="file" accept=".csv,.txt,text/csv,text/plain" />
      <div id="olcumDurum" class="olcum-durum"></div>
      <small>Dağıtım şirketinden 8.760 saatlik TM yükü (MW) gelirse buraya yükleyin: varsayım tamamen kalkar,
        aralık tek sayıya iner. Tek sütun ya da "tarih;MW" biçimi; dosya tarayıcıdan çıkmaz.</small>
      ` : ""}

      <label for="hedef">Kabul edilen yıllık kısıntı <span class="deger" id="hedefD"></span></label>
      <input id="hedef" type="range" min="1" max="15" step="0.5" />
      <small>Yatırımcının katlanabileceği kayıp. UKPN esnek bağlantılarında ortalama ≈ %2.</small>

      <label>Risk ölçüsü</label>
      <div class="secim" role="group" aria-label="Risk ölçüsü">
        <button data-ist="p50">P50 tipik yıl</button><button data-ist="p90">P90 kötü yıl</button>
      </div>
      <small>P90: 10 yılda bir görülecek kadar kötü yıl. Bankalar finansmanda bunu ister.</small>

      <label>Batarya</label>
      <div class="ikili">
        <div><input id="batG" type="number" min="0" max="100" step="5" aria-label="Batarya gücü, ek MW'nin yüzdesi" /><small>güç, ek MW'nin %'si</small></div>
        <div><input id="batS" type="number" min="0" max="8" step="1" aria-label="Batarya süresi, saat" /><small>süre, saat (0 = yok)</small></div>
      </div>

      <label for="iletken">Bağlantı hattı (34,5 kV)</label>
      <select id="iletken">
        <option value="-1">Hat kontrolü kapalı</option>
        ${ILETKENLER.map((i, k) => `<option value="${k}">${i.ad}</option>`).join("")}
      </select>
      <div class="ikili" id="fiderAyar">
        <div><input id="mesafe" type="number" min="1" max="60" step="1" aria-label="Hat uzunluğu, km" /><small>uzunluk, km</small></div>
        <div><input id="fiderAdet" type="number" min="1" max="8" step="1" aria-label="Yeni projeler için fider sayısı" /><small>fider sayısı</small></div>
        <div><select id="cosPhi" aria-label="Güç faktörü"><option value="1">cosφ 1,00</option><option value="0.95">cosφ 0,95 endüktif</option></select><small>reaktif güç</small></div>
        <div><input id="du" type="number" min="0.5" max="10" step="0.5" aria-label="İzin verilen gerilim değişimi, yüzde" /><small>gerilim sınırı, %</small></div>
      </div>
      <small>Gerilim yükselmesi ve ısıl sınır hesaplanır; aşan üretim kısıntıya eklenir. İletken verisi Southwire, %2 sınırı VDE-AR-N 4110.</small>

      <label for="efSec">Emisyon faktörü</label>
      <select id="efSec">
        <option value="cm">0,6242 ETKB 2023 kombine marj (resmî)</option>
        <option value="bm">0,3567 ETKB 2023 yapı marjı (muhafazakâr)</option>
        <option value="om">0,7134 ETKB 2023 işletme marjı</option>
        <option value="ozel">Özel değer</option>
      </select>
      <input id="efOzel" type="number" min="0.05" max="1.2" step="0.01" aria-label="Özel emisyon faktörü, tCO₂/MWh" hidden />
      <small>tCO₂/MWh. ETKB 2023 bilgi formu (UNFCCC CDM yöntemi). GES'in yaşam döngüsü emisyonu (IPCC AR5: 0,048) düşülür.</small>

      <label for="ptf">Elektrik fiyatı <span class="deger" id="ptfD"></span></label>
      <input id="ptf" type="number" min="100" max="20000" step="1" aria-label="Elektrik fiyatı, TL/MWh" />
      <small>TL/MWh. Varsayılan ${tr(PTF_VARSAYILAN)}: ${PTF_KAYNAK}. Yalnızca para karşılığını değiştirir; MW ve kısıntı hesabına girmez.</small>
    </div>
  </aside>
  <main class="ana" id="ana" aria-live="polite">
    <div class="durum">Veriler yükleniyor…</div>
  </main>
</div>`;

function listeCiz() {
  const iller = ["KONYA", "KARAMAN"] as const;
  document.getElementById("liste")!.innerHTML = iller.map((il) => `
    <div class="bara"><h3>${il === "KONYA" ? "Konya" : "Karaman"}</h3>
    ${TRAFOLAR.filter((t) => t.il === il).map((t) => {
      const oran = Math.min(1, t.tahsisMW / t.maksMW);
      return `<button class="tm" data-ad="${t.ad}" aria-pressed="${t === durum.trafo}">
        <span class="tm-ad">${t.ad}${t.kesin ? "" : " *"}</span>
        <span class="tm-sayi">${tr(t.tahsisMW)} / ${tr(t.maksMW)} MW</span>
        <span class="tm-cubuk"><span class="${oran >= 0.999 ? "dolu" : ""}" style="width:${oran * 100}%"></span></span>
      </button>`;
    }).join("")}</div>`).join("") + `<p class="not">* TEİAŞ'a göre kesinleşmemiş satır.</p>`;
  document.querySelectorAll<HTMLButtonElement>(".tm").forEach((b) =>
    b.addEventListener("click", () => {
      durum.trafo = TRAFOLAR.find((t) => t.ad === b.dataset.ad)!;
      listeCiz();
      yenile(true);
    }));
}

function ayarlariBagla() {
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const yuk = $<HTMLInputElement>("yuk"), hedef = $<HTMLInputElement>("hedef");
  const batG = $<HTMLInputElement>("batG"), batS = $<HTMLInputElement>("batS");
  const efSec = $<HTMLSelectElement>("efSec"), efOzel = $<HTMLInputElement>("efOzel");
  const iletken = $<HTMLSelectElement>("iletken"), mesafe = $<HTMLInputElement>("mesafe"), fiderAdet = $<HTMLInputElement>("fiderAdet");
  const cosPhi = $<HTMLSelectElement>("cosPhi"), du = $<HTMLInputElement>("du");
  const ptf = $<HTMLInputElement>("ptf");
  const goster = () => {
    ptf.value = String(durum.ptf); $("ptfD").textContent = `${tr(durum.ptf)} TL/MWh`;
    yuk.value = String(durum.yukTepeMW); hedef.value = String(durum.hedef * 100);
    batG.value = String(Math.round(durum.bataryaOrani * 100)); batS.value = String(durum.bataryaSaat);
    iletken.value = String(durum.iletken); $("fiderAyar").hidden = durum.iletken < 0;
    mesafe.value = String(durum.mesafeKm); fiderAdet.value = String(durum.fiderAdet);
    cosPhi.value = String(durum.cosPhi); du.value = String(durum.sinirYuzde);
    efSec.value = durum.efSecim; efOzel.hidden = durum.efSecim !== "ozel"; efOzel.value = String(durum.efOzel);
    $("yukD").textContent = `${tr(durum.yukTepeMW)} MW`;
    $("hedefD").textContent = yuzde(durum.hedef);
    document.querySelectorAll<HTMLButtonElement>("[data-ist]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.ist === durum.istatistik)));
  };
  goster();
  let zaman: number | undefined;
  const gecikmeli = (yeniSenaryo: boolean) => { goster(); clearTimeout(zaman); zaman = window.setTimeout(() => yenile(yeniSenaryo), 180); };
  yuk.addEventListener("input", () => { durum.yukTepeMW = +yuk.value; gecikmeli(true); });
  if (OLCUM_ACIK) ($("olcumDosya") as HTMLInputElement).addEventListener("change", olcumYukle);
  hedef.addEventListener("input", () => { durum.hedef = +hedef.value / 100; gecikmeli(false); });
  batG.addEventListener("change", () => { durum.bataryaOrani = Math.max(0, +batG.value / 100); gecikmeli(false); });
  batS.addEventListener("change", () => { durum.bataryaSaat = Math.max(0, +batS.value); gecikmeli(false); });
  iletken.addEventListener("change", () => { durum.iletken = +iletken.value; gecikmeli(false); });
  mesafe.addEventListener("change", () => { durum.mesafeKm = Math.min(60, Math.max(1, +mesafe.value || 10)); gecikmeli(false); });
  fiderAdet.addEventListener("change", () => { durum.fiderAdet = Math.min(8, Math.max(1, Math.round(+fiderAdet.value || 1))); gecikmeli(false); });
  cosPhi.addEventListener("change", () => { durum.cosPhi = +cosPhi.value; gecikmeli(false); });
  du.addEventListener("change", () => { durum.sinirYuzde = Math.min(10, Math.max(0.5, +du.value || 2)); gecikmeli(false); });
  efSec.addEventListener("change", () => { durum.efSecim = efSec.value as EfSecim; gecikmeli(false); });
  ptf.addEventListener("change", () => { durum.ptf = Math.min(20000, Math.max(100, Math.round(+ptf.value || PTF_VARSAYILAN))); gecikmeli(false); });
  efOzel.addEventListener("change", () => { durum.efOzel = Math.min(1.2, Math.max(0.05, +efOzel.value || 0.45)); gecikmeli(false); });
  document.querySelectorAll<HTMLButtonElement>("[data-ist]").forEach((b) =>
    b.addEventListener("click", () => { durum.istatistik = b.dataset.ist as "p50" | "p90"; gecikmeli(false); }));
}

const ana = document.getElementById("ana")!;

/** Statik sınırın üzerindeki MW'ın şebekeye verdiği ek enerji (P50, MWh/yıl). Additionality. */
function ekEnerji(s: Senaryolar, g: TrafoGirdisi, esnek: number, statik: number) {
  const d = dagilim(s, g, Math.max(esnek, 0.01));
  const d0 = statik > 0.01 ? dagilim(s, g, statik).teslimP50MWh : 0;
  return Math.max(0, d.teslimP50MWh - d0);
}

async function yenile(yeniSenaryo: boolean) {
  const t = durum.trafo;
  const fider = fiderMW();
  const girdi: TrafoGirdisi = { maksMW: t.maksMW, tahsisMW: t.tahsisMW, yukTepeMW: durum.yukTepeMW, fiderMW: fider };
  try {
    if (yeniSenaryo || !sc) {
      ana.innerHTML = `<div class="durum">${t.ad} için Open-Meteo'dan ${HAVA_YILLARI[0]}–${HAVA_YILLARI.at(-1)} saatlik hava verisi (20 yıl) alınıyor ve senaryolar kuruluyor…</div>`;
      hava = await havaGetir(t.enlem, t.boylam);
      sc = olcum ? olcumSenaryolari(hava.yillar, olcum.deger, t.maksMW)
                 : senaryolarKur(hava.yillar, yk, girdi);
    }
  } catch (e) {
    ana.innerHTML = `<div class="durum hata"><p>Hava verisi alınamadı: ${(e as Error).message}</p>
      <p>Open-Meteo'ya erişilemedi. Sayfayı yenileyin ya da başka bir ağdan deneyin.</p>
      <button class="dugme" id="tekrar">Tekrar dene</button></div>`;
    document.getElementById("tekrar")?.addEventListener("click", () => yenile(true));
    return;
  }
  const s = sc!;
  urlYaz();
  const statik = statikKalan(girdi);
  const esnek = Math.max(statik, enYuksekEkMW(s, girdi, durum.hedef, durum.istatistik));

  // Kanıt merdiveni 1: yük bilgisi olmadan alt sınır (sadece gerçek hava + TEİAŞ sınırı)
  const altSc = altSinirSenaryolari(pvYillari(hava!.yillar), t.maksMW);
  const altSinir = Math.max(statik, enYuksekEkMW(altSc, girdi, durum.hedef, durum.istatistik));
  // Kanıt merdiveni 2: yük büyüklüğüne duyarlılık (±%50)
  const duyar = (k: number) => {
    const g = { ...girdi, yukTepeMW: durum.yukTepeMW * k };
    return Math.max(statik, enYuksekEkMW(senaryolarKur(hava!.yillar, yk, g, 3), g, durum.hedef, durum.istatistik));
  };
  const esnekAlt = duyar(0.5), esnekUst = duyar(1.5);

  const bat: BataryaGirdisi | undefined = durum.bataryaSaat > 0 && durum.bataryaOrani > 0
    ? { gucMW: esnek * durum.bataryaOrani, enerjiMWh: esnek * durum.bataryaOrani * durum.bataryaSaat, verim: 0.88 }
    : undefined;
  const esnekBat = bat ? Math.max(esnek, enYuksekEkMW(s, girdi, durum.hedef, durum.istatistik, bat)) : esnek;
  const isi = new Float64Array(12 * 24);
  const d = dagilim(s, girdi, Math.max(esnek, 0.01), undefined, isi);
  const ekMWh = ekEnerji(s, girdi, esnek, statik);
  const co2 = ekMWh * efNet(), co2Muh = ekMWh * efNet(EF.bm.deger);
  // Varsayımsız etki: yalnızca alt sınırın (yük bilgisi kullanmayan) getirdiği ek enerji.
  const ekMWhAlt = ekEnerji(altSc, girdi, altSinir, statik);
  const co2Alt = ekMWhAlt * efNet(), co2AltMuh = ekMWhAlt * efNet(EF.bm.deger);
  // Emisyon bandı: ETKB 2023'ün üç resmî marjı. Yapı marjı = düşük, kombine = orta, işletme = yüksek.
  const co2AltDus = ekMWhAlt * efNet(EF.bm.deger), co2AltYuk = ekMWhAlt * efNet(EF.om.deger);
  // Taşınma payı düşülmüş hâli: karşı-olgusal tabanın TEİAŞ tablosuyla sınırlanmış sürümü.
  const tasinir = tasinabilirPay(ulusal);
  const co2AltNet = tasinir == null ? co2Alt : co2Alt * (1 - tasinir);
  const dAlt = dagilim(altSc, girdi, Math.max(altSinir, 0.01));
  const kisintiAlt = durum.istatistik === "p90" ? dAlt.p90 : dAlt.p50;

  // Manşet: varsayımsız alt sınır iki risk ölçüsüyle yan yana. Seçili ölçü yukarıdaki hesapla aynı sayıyı verir;
  // diğeri ayrıca hesaplanır. Para karşılığı tipik yıl (P50) teslim ve kısılan enerjisinden.
  const manset = (["p50", "p90"] as const).map((ist) => {
    const mw = ist === durum.istatistik ? altSinir : Math.max(statik, enYuksekEkMW(altSc, girdi, durum.hedef, ist));
    const dd = dagilim(altSc, girdi, Math.max(mw, 0.01));
    const ekMWh_ = ekEnerji(altSc, girdi, mw, statik);
    // P50: tipik yılın teslim ve kısılan enerjisi. P90: kötü yıl — potansiyel üretim × (1 − P90 kısıntı), statik üstü pay.
    // Kısıntı bedeli: yeni projenin kısılan enerjisi × fiyat (LIFO: mevcut santraller kısılmaz).
    const k = ist === "p90" ? dd.p90 : dd.p50;
    const teslimStatik = statik > 0.01 ? dagilim(altSc, girdi, statik).teslimP50MWh : 0;
    const ek = ist === "p50" ? ekMWh_ : Math.max(0, dd.potansiyelMWh * (1 - k) - teslimStatik);
    const kisilan = ist === "p50" ? dd.kisilanP50MWh : dd.potansiyelMWh * k;
    return { ist, mw, kisinti: k, ekMWh: ek, gelirTL: ek * durum.ptf, bedelTL: kisilan * durum.ptf };
  });

  // Geri test: model test yılını görmeden boyutlandırır; o yılın gerçek havası + gerçek EPİAŞ yükü ile gerçekleşen kısıntı
  const geri = geriTest ? geriYillari().map((y) => geriTestYili(hava!.yillar, geriTest!, y, girdi, durum.hedef, durum.istatistik))
    .filter((r): r is YilSonucu => r !== null) : [];

  const ustX = Math.max(30, Math.ceil((Math.max(esnekUst, esnekBat) * 1.4) / 10) * 10);
  const nokta = egri(s, girdi, ustX);
  const kisinti = durum.istatistik === "p90" ? d.p90 : d.p50;
  const istAd = durum.istatistik === "p90" ? "kötü yılda (P90)" : "tipik yılda (P50)";
  const dolu = statik < 0.5;
  let tepeAy = 0, tepeDeger = -1;
  for (let a = 0; a < 12; a++) { let v = 0; for (let h = 0; h < 24; h++) v += isi[a * 24 + h]; if (v > tepeDeger) { tepeDeger = v; tepeAy = a; } }
  const AY = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

  sonOzet = {
    trafo: t.ad, il: t.il, tahsis_MW: t.tahsisMW, ust_sinir_MW: t.maksMW, statik_kalan_MW: +statik.toFixed(1),
    yuk_varsayimsiz_alt_sinir_MW: +altSinir.toFixed(1),
    esnek_MW: +esnek.toFixed(1), esnek_MW_yuk_yari: +esnekAlt.toFixed(1), esnek_MW_yuk_bucuk_kat: +esnekUst.toFixed(1),
    yuk_tepe_varsayim_MW: durum.yukTepeMW, kabul_kisinti: durum.hedef, risk_olcusu: durum.istatistik.toUpperCase(),
    kisinti_P50: +d.p50.toFixed(4), kisinti_P90: +d.p90.toFixed(4),
    batarya: bat ? `${tr(bat.gucMW, 1)} MW / ${tr(bat.enerjiMWh, 1)} MWh` : "yok", batarya_ile_MW: +esnekBat.toFixed(1),
    fider_siniri_MW: fider ?? "yok",
    statik_ustu_ek_enerji_MWh_P50: Math.round(ekMWh), net_onlenen_tCO2_yil: Math.round(co2), muhafazakar_tCO2_yil: Math.round(co2Muh),
    emisyon_faktoru: `${tr(efBrut(), 4)} − GES yaşam döngüsü 0,048`,
    geri_test: geri.map((r) => ({ yil: r.yil, model_MW: +r.modelMW.toFixed(1), model_gerceklesen_kisinti: +r.modelGercek.toFixed(4),
      naif_MW: +r.naifMW.toFixed(1), naif_gerceklesen_kisinti: +r.naifGercek.toFixed(4) })),
    mevcut_santral_kisintisi_MWh: Math.round(d.mevcutKisilanMaks),
    elektrik_fiyati_TL_MWh: durum.ptf,
    varsayimsiz_alt_sinir: manset.map((m) => ({ risk_olcusu: m.ist.toUpperCase(), ek_MW: +m.mw.toFixed(1), kisinti: +m.kisinti.toFixed(4),
      yillik_gelir_milyon_TL: +(m.gelirTL / 1e6).toFixed(1), yillik_kisinti_bedeli_milyon_TL: +(m.bedelTL / 1e6).toFixed(1) })),
  };

  const fg = fiderGirdisi(), fs = fg ? fiderKapasitesi(fg) : null, fs95 = fg ? fiderKapasitesi(fiderGirdisi(0.95)!) : null;
  const fs1 = fg ? fiderKapasitesi(fiderGirdisi(1)!) : null;

  ana.innerHTML = `
    <nav class="sekmeler" role="tablist" aria-label="Görünüm">
      <button role="tab" id="tab-karar" aria-controls="sk-karar" data-sekme="karar">Karar</button>
      <button role="tab" id="tab-bolge" aria-controls="sk-bolge" data-sekme="bolge">Bölge ve Türkiye</button>
      <button role="tab" id="tab-kanit" aria-controls="sk-kanit" data-sekme="kanit">Kanıt</button>
    </nav>

    <div class="sekme" id="sk-karar" role="tabpanel" aria-labelledby="tab-karar" tabindex="0">
    <p class="cevap">${t.ad}: statik kurala göre ${dolu ? "<b>dolu</b>" : `<b>${tr(statik)} MW</b> boş`}. Trafodaki yük hakkında
      <b>hiçbir varsayım yapmadan</b> bile esnek bağlantı <b>${tr(altSinir, 1)} MW</b> açıyor${dolu ? "" : `, statik sınırın <b>${tr(altSinir - statik, 1)} MW</b> üzerinde`}.
      Bedeli: ${istAd} yeni projelerin üretiminde <b>${yuzde(kisintiAlt)}</b> kısıntı.</p>
    <div class="manset" role="group" aria-label="Varsayımsız alt sınır, iki risk ölçüsüyle">
      ${manset.map((m) => `<div class="manset-kol${m.ist === durum.istatistik ? " secili" : ""}">
        <div class="mk-ad">${m.ist === "p50" ? "P50 · tipik yıl" : "P90 · kötü yıl"}<span>${m.ist === "p50" ? "planlamacının baktığı" : "bankanın istediği"}</span></div>
        <div class="mk-mw">${tr(m.mw, 1)}<small>MW</small></div>
        <div class="mk-satir">statik kural: <b>${tr(statik)} MW</b> · kısıntı <b>${yuzde(m.kisinti)}</b></div>
        <div class="mk-satir">${m.ist === "p50" ? "tipik yılda" : "kötü yıl kısıntı oranıyla"} yatırımcıya ≈ <b>${milyonTL(m.gelirTL)}</b> satış · kısıntı bedeli ≈ ${milyonTL(m.bedelTL)}</div>
      </div>`).join("")}
    </div>
    <p class="kucuk manset-not">Varsayımsız alt sınır: TM yükü hakkında hiçbir varsayım yok. Para karşılığı o yılda şebekeye verilen ek enerji × ${tr(durum.ptf)} TL/MWh (${durum.ptf === PTF_VARSAYILAN ? PTF_KAYNAK : "kullanıcı fiyatı"}).
      Statik kuralda bu gelir sıfır, çünkü başvuru reddediliyor; yeni trafo merkezi gerekmiyor. Aşağıdaki kutular ve diğer sekmeler "Risk ölçüsü" ayarındaki ${durum.istatistik.toUpperCase()} seçimine göre.</p>
    <p class="cevap-alt">Bu sayı yalnızca iki şeye dayanır: TEİAŞ'ın bu TM için yayımladığı ${tr(t.maksMW)} MW üst sınırı ve bu koordinatın 20 yıllık gerçek hava verisi.
      Yük en düşük kabul edilir, yani statik kuralın kendi en kötü varsayımı korunur. Kazanç tamamen şundan gelir: GES yılın çok az saatinde tam güçte üretir.
      TM yükü bilinirse sayı <b>${tr(esnek)} MW</b>'a çıkar; Kanıt sekmesindeki merdiven bunu ayrı basamakta gösterir.</p>
    <div class="olcumler">
      <div class="olcum"><div class="ad">Statik kurala göre boş</div><div class="sayi">${tr(statik)}<small>MW</small></div><div class="ek">${tr(t.tahsisMW)} / ${tr(t.maksMW)} MW tahsisli</div></div>
      <div class="olcum vurgu"><div class="ad">Varsayımsız alt sınır</div><div class="sayi">${tr(altSinir, 1)}<small>MW</small></div><div class="ek">yük bilgisi kullanılmadan</div></div>
      <div class="olcum"><div class="ad">Yük bilgisiyle</div><div class="sayi">${tr(esnek)}<small>MW</small></div><div class="ek">${fiderMW() ? "hat sınırı dahil" : `yük ±%50 ile ${tr(esnekAlt)}–${tr(esnekUst)} MW`}</div></div>
      <div class="olcum"><div class="ad">Bataryayla</div><div class="sayi">${bat ? tr(esnekBat) : "–"}<small>${bat ? "MW" : ""}</small></div><div class="ek">${bat ? `${tr(bat.gucMW, 0)} MW / ${tr(bat.enerjiMWh, 0)} MWh, verim %88` : "batarya kapalı"}</div></div>
      <div class="olcum"><div class="ad">Net önlenen emisyon</div><div class="sayi">${tr(co2AltNet / 1000, 1)}<small>bin tCO₂/yıl</small></div><div class="ek">varsayımsız · ${tr(ekMWhAlt / 1000, 1)} GWh · band ${tr(co2AltDus / 1000, 1)}–${tr(co2AltYuk / 1000, 1)} bin${tasinir == null ? "" : ` · taşınma payı %${tr(tasinir * 100, 1)} düşüldü`}</div></div>
    </div>

    <section class="bolum">
        <h2>Planlama notu</h2>
        <p>Gemini, yukarıdaki sayıları EDAŞ planlama mühendisi için kısa bir uyarı metnine çevirir. Sayı üretmez. Not genellikle 10–30 saniyede gelir; ücretsiz API yoğunsa biraz daha uzun sürebilir.</p>
        <div class="gemini" id="gemini"><button class="dugme" id="ozetBtn">Planlama notu oluştur</button></div>
    </section>

    <section class="bolum">
      <h2>Bugün kim kullanır: mevzuat beklemeden</h2>
      <p>Türkiye'de trafo merkezi düzeyinde esnek bağlantı henüz tanımlı değil. Ama aynı ilke santral düzeyinde mevzuatta zaten var:
        <b>kurulu güç, şebekeye verilebilen güçten büyük olabilir; fazlası şebekeye verilmez.</b></p>
      <ul class="liste">
        <li><b>Depolamalı santraller:</b> mekanik kurulu güç, elektriksel kurulu gücün iki katına kadar çıkabilir. Sisteme verilen güç lisanstaki kurulu gücü aşamaz; aşan enerji uzlaştırmada sayılmaz. EPDK bu modelde 33,1 GW ön lisans verdi.</li>
        <li><b>Hibrit (yardımcı kaynak) santraller:</b> mevcut santralin bağlantısına GES eklenir, yeni kapasite tahsisi gerekmez. 3,5 GW izin verildi, 1,4 GW kuruldu. Ember'in önerisi: yatırımcı ne kadar ekleyeceğine kendisi karar versin, şebeke sınırını aşan üretim kısılsın.</li>
      </ul>
      <div class="hesap">
        <label for="santralMW">Mevcut santralin bağlantı gücü</label>
        <input id="santralMW" type="number" min="1" max="250" step="1" value="${santralMW}" /> <span>MW</span>
        <span class="hesap-sonuc" id="santralSonuc"></span>
      </div>
      <p class="kucuk">Hesap, merdivenin ilk basamağıdır: yük yok, sınır santralin kendi bağlantı gücü, hava ${t.ad} konumunun gerçek verisi. Kısıntı hedefi ve risk ölçüsü soldaki ayarlardan.
        Kaynaklar: Mondaq, "Elektrik Piyasasında Depolamalı Üretim Faaliyeti ve Lisanslama Süreci" (Lisans Yön. 12/14; 6446 s. Kanun 7/11); AA Enerji Terminali (33,1 GW);
        Ember, "Türkiye can bypass grid constraints with hybrid solar power plants" (bölüm 2.2 ve 4.2).</p>
    </section>

    </div>

    <div class="sekme" id="sk-bolge" role="tabpanel" aria-labelledby="tab-bolge" tabindex="0">
    <section class="bolum">
      <h2>Bölge ölçeğinde: Konya ve Karaman'daki ${TRAFOLAR.length} trafo merkezi</h2>
      <p>Aynı yöntem bölgedeki bütün trafo merkezlerine uygulanır. Kabul edilen kısıntı, risk ölçüsü ve emisyon faktörü soldaki ayarlardan gelir.
        Yük varsayımı üç seviyede denenir; yük bilgisi olmayan alt sınır ayrıca verilir.</p>
      <button class="dugme" id="bolgeBtn">Bölgeyi hesapla</button>
      <small class="kucuk">TM başına 60 senaryo (20 hava yılı × 3); hava verisi seçili TM'nin konumundan (bölge içi mesafeler ≤ 150 km). Yük tepesi = TM üst sınırının %30, %60 ve %90'ı.</small>
      <div id="bolge"></div>
    </section>

    ${ulusalBolum()}

    </div>

    <div class="sekme" id="sk-kanit" role="tabpanel" aria-labelledby="tab-kanit" tabindex="0">
    <section class="bolum">
      <h2>Kanıt merdiveni: varsayım azaldıkça sayı ne kadar sağlam?</h2>
      <p>Her basamak bir öncekinden daha az varsayım kullanır. İlk basamak TM yükü hakkında hiçbir şey varsaymaz ve TEİAŞ'ın hesap formülüne bağlı değildir.</p>
      <ol class="merdiven">
        <li><span class="m-ad">Yük bilgisi olmadan</span><span class="m-sayi">${tr(altSinir, 1)} MW</span>
          <span class="m-not">Tek kural: toplam üretim TEİAŞ'ın yayımladığı ${tr(t.maksMW)} MW'ı aşmasın. Yük her an en düşük kabul edilir. Kazanç sadece gerçek havadan: GES nadiren tam güçte üretir.</span></li>
        <li><span class="m-ad">Gerçek yük şekliyle</span><span class="m-sayi">${Math.round(esnekAlt) === Math.round(esnekUst) ? tr(esnekAlt) : `${tr(esnekAlt)}–${tr(esnekUst)}`} MW</span>
          <span class="m-not">EPİAŞ saatlik yük şekli, TM yük tepesi ${tr(durum.yukTepeMW * 0.5)}–${tr(durum.yukTepeMW * 1.5)} MW aralığında. Seçili varsayımla ${tr(esnek)} MW.</span></li>
        <li${olcum ? ' class="m-aktif"' : ""}><span class="m-ad">EDAŞ ölçümüyle</span><span class="m-sayi">${olcum ? `${tr(esnek)} MW` : "pilot"}</span>
          <span class="m-not">${olcum
            ? `<b>${olcum.ad}</b> yüklendi: ${olcum.satir.toLocaleString("tr")} saat, tepe ${tr(olcum.tepeMW, 1)} MW, en düşük gündüz yükü ${tr(olcum.enDusukGunduzMW, 1)} MW. ${olcum.sentetik ? "<b>Bu dosya SENTETİKTİR, gerçek ölçüm değildir</b> — yalnızca ölçüm geldiğinde ne olacağını göstermek için." : "Yük varsayımı devrede değil; aralık tek sayıya indi."}`
            : `TM'nin kendi SCADA yükü girilince aralık tek sayıya iner. Yöntem değişmez, sadece girdi değişir. ${OLCUM_ACIK ? "Soldaki \"EDAŞ ölçümü\" alanından yüklenir." : "Okuyucu yazıldı ve sınandı; pilot verisi geldiğinde devreye alınacak."}`}</span></li>
      </ol>
    </section>

    <section class="bolum">
      <h2>Ne kadar eklenirse ne kadar kısılır</h2>
      <p>${s.n} senaryo: ${new Set(s.havaYili).size} gerçek hava yılı (${s.havaYili[0]}–${s.havaYili.at(-1)}) × ${s.n / new Set(s.havaYili).size} yük çekilişi. Statik çizgiyle yeşil çizgi arasındaki her MW, bugün "kapasite yok" diye reddedilen başvurudur.</p>
      <div id="egri"></div>
      <div class="lejant"><span><i style="background:var(--gunes)"></i>P50 tipik yıl</span><span><i style="background:var(--kisinti)"></i>P90 kötü yıl</span></div>
    </section>

    <section class="bolum">
      <h2>Geri test: yılı görmeden boyutlandır, sonra gerçekle karşılaştır</h2>
      ${geri.length ? `<p>Her test yılında model o yılı hiç görmedi; hava da bilinmiyor kabul edildi (sadece önceki yıllar). Model, kabul edilen
        %${tr(durum.hedef * 100, 1)} kısıntıyı ${durum.istatistik.toUpperCase()} ile tutturacak MW'ı seçiyor. Basit yöntem ise "geçen yıl ne olduysa bu yıl da o olur"
        diyerek tek bir senaryoyla seçiyor. Sonra o yılın gerçek saatlik havası ve gerçek EPİAŞ yüküyle gerçekleşen kısıntı hesaplanıyor.</p>
        <table class="veri"><thead><tr><th>Test yılı</th><th style="text-align:right">Model: MW</th><th style="text-align:right">Model: gerçekleşen kısıntı</th><th style="text-align:right">Basit yöntem: MW</th><th style="text-align:right">Basit yöntem: gerçekleşen</th></tr></thead>
        <tbody>${geri.map((r) => `<tr><td>${r.yil}</td><td class="r">${tr(r.modelMW, 1)}</td><td class="r ${r.modelGercek > durum.hedef + 1e-9 ? "asim" : "tuttu"}">${yuzde(r.modelGercek)}</td>
          <td class="r">${tr(r.naifMW, 1)}</td><td class="r ${r.naifGercek > durum.hedef + 1e-9 ? "asim" : "tuttu"}">${yuzde(r.naifGercek)}</td></tr>`).join("")}</tbody></table>
        <p class="kucuk">Hedef %${tr(durum.hedef * 100, 1)}; kırmızı = hedef aşıldı. Her yılın modeli yalnızca o yıldan önceki verilerle eğitildi:
          ${geriYillari().map((y) => `${y}: ${geriTest!.yillar[String(y)].egitim.join(", ")} eğitim, ${geriTest!.yillar[String(y)].kalibrasyon} kalibrasyon (saatlik kapsama %${tr(geriTest!.yillar[String(y)].saat_kapsama_P5_P95 * 100, 1)})`).join("; ")}.
          "Gerçekleşen" ölçülmüş kısıntı değil: gerçek hava ve gerçek yük şekliyle aynı enerji dengesinden hesaplanır. Türkiye'de ölçülmüş esnek bağlantı kısıntısı henüz yok.
          EPİAŞ verisi 2016'ya uzatıldığında (model/epias_cek.py) geri test yılları kendiliğinden çoğalır.</p>`
        : `<p>${geriTest ? "Test yıllarının hava verisi alınamadı; geri test yapılamadı." : "Geri test verisi yükleniyor…"}</p>`}
    </section>

    ${fs && fs1 && fs95 ? `<section class="bolum">
      <h2>Bağlantı hattı: gerilim ve ısıl sınır</h2>
      <p>${ILETKENLER[durum.iletken].ad}, ${tr(durum.mesafeKm)} km, 34,5 kV. Bir fider gerilim değişimi %${tr(durum.sinirYuzde, 1)} sınırında
        <b>${tr(fs.gerilimMW === Infinity ? 999 : fs.gerilimMW, 1)} MW</b>, ısıl olarak <b>${tr(fs.isilMW, 1)} MW</b> taşır; bağlayıcı olan ${fs.baglayici} sınırı.
        ${durum.fiderAdet} fiderle yeni projeler için en fazla <b>${tr(fs.sinirMW * durum.fiderAdet, 1)} MW</b>; bu sınır kısıntı hesabına dahil.</p>
      <p>İkinci esneklik kaldıracı reaktif güç: GES eviricisi cosφ 0,95 endüktif çalışırsa bir fider ${tr(fs1.sinirMW, 1)} MW yerine
        <b>${tr(fs95.sinirMW, 1)} MW</b> taşır (${tr(fs95.sinirMW / fs1.sinirMW, 1)} kat). Bedeli: hatta biraz daha fazla akım ve kayıp.</p>
      <p class="kucuk">ΔU/U ≈ L·(R·P − X·Q)/U². R, X ve akım sınırı Southwire ACSR katalog değerleri; faz açıklığı ${tr(DEQ_M, 1)} m varsayımı.
        Trafo barası gerilimini kademe değiştirici sabit tuttuğu varsayılır. Ayrıntılı yük akışı (pandapower) bağlantı etüdünün işi.</p>
    </section>` : ""}

    <section class="bolum">
        <h2>Kısıntı ne zaman oluyor</h2>
        <p>${tr(esnek)} MW eklendiğinde ortalama kısılan enerji. En çok ${AY[tepeAy]} öğlelerinde: güneş güçlü, yük düşük. Batarya ve talep esnekliği bu saatleri hedeflemeli.</p>
        <div id="isi"></div>
    </section>

    <section class="bolum">
      <h2>Yük modeli gerçek veride nasıl çalışıyor</h2>
      <p>EPİAŞ saatlik tüketimi (${rapor.veri}): ${rapor.egitim} eğitim, ${rapor.kalibrasyon} kalibrasyon, ${rapor.test.slice(0, 4)} test. Model test yılını hiç görmedi; yakın yıllar daha ağır tartılır, COVID kapanma dönemi eğitimden çıkarılır. Aşağıdaki hafta test yılından.</p>
      <div id="dogrulama"></div>
      <div class="lejant"><span><i style="background:var(--murekkep)"></i>gerçek tüketim</span><span><i style="background:var(--dikkat)"></i>model P50</span><span><i style="background:var(--gunes-acik);height:10px"></i>P5–P95 bandı</span></div>
      ${modelTablosu()}
    </section>

    <section class="bolum">
      <h2>Hangi kısım gerçek, hangisi varsayım</h2>
      <table class="veri">
        <thead><tr><th>Katman</th><th>Kaynak</th><th>Durum</th></tr></thead>
        <tbody>
          <tr><td>Hava: ışınım (eğik yüzey), sıcaklık, rüzgâr</td><td>${HAVA_KAYNAK} ${t.ad} konumu, saatlik, ${new Set(s.havaYili).size} yıl (${s.havaYili[0]}–${s.havaYili.at(-1)}). Işınım: ${hava!.egikKaynak === "GTI" ? "30° güneye eğik yüzey" : "yatay (GTI alınamadı)"}; eksik değer ${yuzde(hava!.eksikOran, 2)}.</td><td><span class="etiket gercek">gerçek, canlı</span></td></tr>
          <tr><td>Yük şekli ve belirsizliği</td><td>EPİAŞ Şeffaflık Platformu ulusal saatlik tüketim ${rapor.veri} → LightGBM kantil + conformal.</td><td><span class="etiket gercek">gerçek veri</span></td></tr>
          <tr><td>Trafo üst sınırı ve tahsisli güç</td><td>${TRAFO_KAYNAK}</td><td><span class="etiket gercek">resmî, 01.10.2026</span></td></tr>
          <tr><td>Trafo merkezi konumu</td><td>OpenStreetMap, <code>power=substation</code> (≥66 kV). Bölgedeki ${KONUM_KAYNAK.toplam} TM'nin ${KONUM_KAYNAK.osm}'si gerçek saha konumundan, ${KONUM_KAYNAK.ilce}'i ilçe merkezinden. Ulusal tabloda ${KONUM_KAYNAK.ulusalOsm}/${KONUM_KAYNAK.ulusalToplam}. Eşleşmeler il merkezine 200 km sınırıyla denetlendi; ilk denemede il dışına düşen 48 kayıt elendi.</td><td><span class="etiket gercek">açık veri, doğrulandı</span></td></tr>
          <tr><td>Emisyon faktörü</td><td>ETKB 2023 Ulusal Elektrik Şebekesi Emisyon Faktörü Bilgi Formu (UNFCCC CDM yöntemi); GES yaşam döngüsü IPCC AR5.</td><td><span class="etiket gercek">resmî</span></td></tr>
          <tr><td>Karşı-olgusal taban</td><td>Etki hesabı "esnek bağlantı olmasaydı bu MW hiç bağlanmazdı" der. Bu varsayım olarak bırakılmadı, TEİAŞ'ın kendi tablosuyla sınırlandı: ${ulusal
            ? `reddedilen güç ${tr(REDDEDILEN_MW, 0)} MW (Ember: 11,6 GW'ın %65'i), ülke genelinde kalan kapasite yalnızca ${tr(ulusal.toplamKalanMWe, 1)} MWe. Kalan kapasitenin <b>tamamı</b> reddedilenlere verilse bile en fazla %${tr((tasinir ?? 0) * 100, 1)}'i başka bir TM'ye taşınabilir; <b>%${tr(100 - (tasinir ?? 0) * 100, 1)}'inin gidecek yeri yok</b>. Yukarıdaki emisyon sayısından bu taşınma payı düşüldü. Üstelik bu üst sınır cömert: kalan kapasite illere dağılmış durumda, reddedilen projenin bulunduğu bölgede olmayabilir.`
            : "ulusal tablo yüklenemedi, taşınma payı düşülemedi."}</td><td><span class="etiket gercek">tabloyla sınırlandı</span></td></tr>
          <tr><td>GES üretimi</td><td>PVWatts modeli (pvlib-python ile birebir doğrulandı), DC/AC 1,2, kayıp %14.</td><td><span class="etiket gercek">standart model</span></td></tr>
          <tr><td>TM yük büyüklüğü</td><td>${olcum
            ? (olcum.sentetik
              ? `<b>SENTETİK dosya yüklendi (${olcum.ad}) — gerçek ölçüm değildir.</b> ${olcum.satir.toLocaleString("tr")} saat, tepe ${tr(olcum.tepeMW, 1)} MW. Bu yalnızca "ölçüm geldiğinde ne olur" sorusunu göstermek içindir; buradan çıkan sayı bir iddia değildir. ${olcum.uyari ?? ""}`
              : `<b>EDAŞ ölçümü yüklendi (${olcum.ad}).</b> Varsayım yok: ${olcum.satir.toLocaleString("tr")} saatlik gerçek çekiş verisi, tepe ${tr(olcum.tepeMW, 1)} MW. ${olcum.uyari ?? ""}`)
            : `<b>Ana sayı (${tr(altSinir, 1)} MW) bu satırı hiç kullanmaz.</b> Yalnızca "yük bilgisiyle" üst senaryosunda devreye girer: ulusal şekil ${tr(durum.yukTepeMW)} MW tepeye ölçeklenir, en düşük gündüz yükü ${tr(s.enDusukGunduzYukMW, 1)} MW, ters akış sınırı ${tr(s.ihracatLimitiMW, 1)} MW. TM bazında gerçek yük Türkiye'de yayımlanmıyor (TEİAŞ YTBS topluyor, yayımlamıyor); EDAŞ'ın SCADA ölçümü girilince bu satır kalkar.`}</td><td><span class="etiket ${olcum ? (olcum.sentetik ? "varsayim" : "gercek") : "varsayim"}">${olcum ? (olcum.sentetik ? "SENTETİK, iddia değil" : "gerçek ölçüm") : "yalnızca üst senaryoda"}</span></td></tr>
          <tr><td>Tahsisli gücün kaynağı</td><td>TEİAŞ tablosu GES ve RES'i tek sütunda veriyor. Mevcut santraller GES kabul edilir; RES olsaydı üretim profili farklı olur, öğle tepesi yerine gece de üretim olurdu. <b>Ölçüldü (18 Ekim):</b> Konya ve Karaman'da OpenStreetMap'te haritalanmış 1.300 üretim tesisinin <b>1.192'si güneş, 84'ü rüzgâr</b> — sayıca 14 kat fark. Güç etiketi taşıyanlarda da aynı yön var: 1.882,5 MW güneş, 256,4 MW rüzgâr. İkinci sayıyı tek başına kullanmıyoruz, çünkü etiketleme oranları çok farklı (güneşin %1,8'i, rüzgârın %11,9'u etiketli); değerli olan, farklı yanlılıkları olan iki ölçünün aynı yöne işaret etmesi. <b>Rüzgâr sıfır değil</b>, ama tahsisli gücü GES saymak bu bölgede savunulabilir. Üretici: <code>model/kaynak_kirilimi.py</code>, kaynak OpenStreetMap (ODbL). Bu ölçüm TEİAŞ'ın tahsisli güç sütununu <i>karşılamaz</i> — o sütun kurulmamış tahsisleri de sayıyor, OSM ise yalnızca sahada olanı görüyor ve küçük çatı GES'lerini kaçırıyor. Tam ayrıştırma için EDAŞ fider verisi gerekiyor; MEDAŞ'tan 17 Ekim'de istendi.</td><td><span class="etiket varsayim">varsayım, etkisi sınırlı</span></td></tr>
          <tr><td>Bağlantı hattı gerilimi</td><td>${fider ? `${tr(fider, 1)} MW sınır uygulanıyor.` : "Soldan hat uzunluğu ve iletken seçilince açılır; şu an kapalı."} Kısa hat formülü (ΔU ≈ L·(R·P − X·Q)/U²) ve katalog iletken verisi (Southwire); %2 sınırı VDE-AR-N 4110. Formül pandapower yük akışına karşı 150 durumda sınandı (3 iletken × 5 mesafe × 2 cosφ): 25 kapasite durumunun <b>hiçbirinde</b> gerçek kapasiteden büyük sayı vermiyor, en iyimser gerilim sapması 0,02 puan — yani her durumda muhafazakâr. cosφ&lt;1'de sapma büyüyor çünkü R·P ile X·Q birbirini götürünce ihmal edilen ikinci dereceden terim göreli olarak büyüyor; yönü yine muhafazakâr. <b>Önemli sınır:</b> bu sonuç, santralin TM'den çıkan kendi hattında olduğu durum içindir. Gerçekçi bir OG fideri modellendiğinde (10 bara, dağıtık yük) ara yükler ve fiderin ortasına bağlanma kontrolü daha da muhafazakâr yapıyor; ama <b>aynı fiderde başka üretim varsa kontrol iyimser hale geliyor</b> — fiderde 20 MW mevcut GES varken 16,6 MW diyor, gerçek sınır 7,6 MW. Paylaşılan fiderde bu sayıya güvenilmez; bağlantı etüdü fiderin tamamına bakmalıdır. Kademe değiştirici, dallanma ve N-1 kapsam dışı.</td><td><span class="etiket ${fider ? "gercek" : "istege"}">${fider ? "mühendislik hesabı, açık" : "isteğe bağlı; formül doğrulandı"}</span></td></tr>
          <tr><td>Koruma ve kısa devre</td><td>Röle ayarları ve akım trafosu oranları yayımlanmaz, o yüzden koruma etüdü burada yapılamaz. Ama etüdün başladığı sayı hesaplandı (IEC 60909, pandapower): eviricili GES arıza akımını anma akımının 1,1 katıyla sınırlar, 40 MW'ta toplam arıza akımı yalnızca %22 artıyor — kesici dayanımını tek başına zorlamaz. Asıl soru <b>ara besleme</b>: santral arızaya kendi payını bastığı için TM rölesi arıza akımının tamamını görmez, sınanan en kötü durumda %19'unu görmüyor. Röle ayarı buna göre gözden geçirilmezse açma süresi uzar. Esnek bağlantıda bağlanan güç statik kuraldan büyük olduğu için bu etüt önkoşuldur.</td><td><span class="etiket istege">ilk sayı hesaplandı, etüt EDAŞ'ta</span></td></tr>
          <tr><td>N-1 güvenlik kriteri</td><td>Bilerek kapsam dışı. TM'nin tek hat / tek trafo konfigürasyonu şebeke güvenliği gerekçesiyle hiçbir ülkede yayımlanmaz; UKPN de bu veriyi kendi içinde tutar. Dayanağı olmayan bir N-1 sayısı üretmektense soruyu bağlantı etüdüne bırakıyoruz. Bu araç kapasite ve kısıntı sorusunu cevaplar.</td><td><span class="etiket kapsamdisi">kapsam dışı, gerekçeli</span></td></tr>
        </tbody>
      </table>
    </section>

    </div>

    <footer class="alt">
      Hesap tamamen tarayıcıda çalışır; sabit seed (42) ile tekrarlanabilir. Mevcut santrallerin kısıntısı bu senaryoda: ${tr(d.mevcutKisilanMaks)} MWh/yıl.
      Bu bir prototiptir: bağlantı kararı için EDAŞ'ın yük ölçümü ve bağlantı etüdü gerekir.
      Veri: Open-Meteo (CC BY 4.0), ERA5/Copernicus; EPİAŞ Şeffaflık Platformu; TEİAŞ; ETKB; IPCC AR5; Ember. Climathon 2026, Siemens × YGA × UP School.
    </footer>`;

  sekmeleriBagla();
  document.getElementById("egri")!.appendChild(egriGrafigi(nokta, durum.hedef, statik, esnek, durum.istatistik));
  document.getElementById("isi")!.appendChild(isiHaritasi(isi));
  document.getElementById("dogrulama")!.appendChild(dogrulamaGrafigi(rapor.ornek_hafta));
  document.getElementById("ozetBtn")!.addEventListener("click", ozetIste);
  document.getElementById("bolgeBtn")!.addEventListener("click", bolgeHesapla);
  if (sonBolge) bolgeCiz(sonBolge);
  const sInput = document.getElementById("santralMW") as HTMLInputElement;
  const santralHesapla = () => {
    santralMW = Math.min(250, Math.max(1, +sInput.value || 50));
    const g: TrafoGirdisi = { maksMW: santralMW, tahsisMW: santralMW, yukTepeMW: 0 };
    const ek = enYuksekEkMW(altSinirSenaryolari(pvYillari(hava!.yillar), santralMW), g, durum.hedef, durum.istatistik, undefined, santralMW * 2);
    document.getElementById("santralSonuc")!.innerHTML =
      `→ bağlantıyı büyütmeden <b>${tr(ek, 1)} MW</b> GES eklenebilir (toplam ${tr((santralMW + ek) / santralMW, 2)} kat); ${durum.istatistik.toUpperCase()} kısıntı %${tr(durum.hedef * 100, 1)}.`;
  };
  sInput.addEventListener("change", santralHesapla);
  santralHesapla();
}
let santralMW = 50;

/** Tek link, üç görünüm: Karar (EDAŞ mühendisi / yatırımcı), Bölge ve Türkiye (yönetici), Kanıt (teknik jüri). İçerik aynı, yalnızca gruplama. */
function sekmeleriBagla() {
  const sira: Sekme[] = ["karar", "bolge", "kanit"];
  const goster = () => {
    document.querySelectorAll<HTMLButtonElement>("[data-sekme]").forEach((b) => {
      const secili = b.dataset.sekme === sekme;
      b.setAttribute("aria-selected", String(secili)); b.tabIndex = secili ? 0 : -1;
    });
    (["karar", "bolge", "kanit"] as const).forEach((k) => { document.getElementById(`sk-${k}`)!.hidden = k !== sekme; });
  };
  document.querySelectorAll<HTMLButtonElement>("[data-sekme]").forEach((b) =>
    b.addEventListener("click", () => { sekme = b.dataset.sekme as Sekme; goster(); urlYaz(); }));
  document.querySelector(".sekmeler")!.addEventListener("keydown", (e) => {
    const k = (e as KeyboardEvent).key;
    if (k !== "ArrowRight" && k !== "ArrowLeft") return;
    const i = (sira.indexOf(sekme) + (k === "ArrowRight" ? 1 : sira.length - 1)) % sira.length;
    sekme = sira[i]; goster(); urlYaz();
    document.getElementById(`tab-${sekme}`)!.focus();
  });
  goster();
}

interface BolgeSatiri {
  ad: string; statik: number; alt: number; e30: number; e60: number; e90: number;
  ekMWh60: number; p60: number; geri: YilSonucu[];
}
let sonBolge: { satirlar: BolgeSatiri[]; ef: number; efMuh: number; hedef: number } | null = null;

async function bolgeHesapla() {
  const btn = document.getElementById("bolgeBtn") as HTMLButtonElement;
  if (!hava) return;
  btn.disabled = true;
  const pvTum = pvYillari(hava.yillar);
  const satirlar: BolgeSatiri[] = [];
  for (const [i, t] of TRAFOLAR.entries()) {
    btn.textContent = `Hesaplanıyor ${i + 1}/${TRAFOLAR.length}`;
    await new Promise((r) => setTimeout(r, 0));
    const g = (oran: number): TrafoGirdisi => ({ maksMW: t.maksMW, tahsisMW: t.tahsisMW, yukTepeMW: t.maksMW * oran });
    const st = statikKalan(g(0.6));
    const ust = Math.max(60, t.maksMW * 4);
    const alt = Math.max(st, enYuksekEkMW(altSinirSenaryolari(pvTum, t.maksMW), g(0.6), durum.hedef, durum.istatistik, undefined, ust));
    const es = (oran: number) => {
      const s_ = senaryolarKur(hava!.yillar, yk, g(oran), 3);
      return { s_, mw: Math.max(st, enYuksekEkMW(s_, g(oran), durum.hedef, durum.istatistik, undefined, ust)) };
    };
    const a = es(0.3), b = es(0.6), c = es(0.9);
    const ekMWh60 = ekEnerji(b.s_, g(0.6), b.mw, st);
    const d60 = dagilim(b.s_, g(0.6), Math.max(b.mw, 0.01));
    const geri = geriTest ? geriYillari().map((y) => geriTestYili(hava!.yillar, geriTest!, y, g(0.6), durum.hedef, durum.istatistik, 3))
      .filter((r): r is YilSonucu => r !== null) : [];
    satirlar.push({ ad: t.ad, statik: st, alt, e30: a.mw, e60: b.mw, e90: c.mw, ekMWh60, p60: durum.istatistik === "p90" ? d60.p90 : d60.p50, geri });
  }
  sonBolge = { satirlar, ef: efNet(), efMuh: efNet(EF.bm.deger), hedef: durum.hedef };
  btn.disabled = false; btn.textContent = "Yeniden hesapla";
  bolgeCiz(sonBolge);
}

function bolgeCiz(b: { satirlar: BolgeSatiri[]; ef: number; efMuh: number; hedef: number }) {
  const kutu = document.getElementById("bolge");
  if (!kutu) return;
  const top = (f: (r: BolgeSatiri) => number) => b.satirlar.reduce((a, r) => a + f(r), 0);
  const st = top((r) => r.statik), alt = top((r) => r.alt), e30 = top((r) => r.e30), e60 = top((r) => r.e60), e90 = top((r) => r.e90);
  const gwh = top((r) => r.ekMWh60) / 1000;
  const dolu = b.satirlar.filter((r) => r.statik < 0.5).length;
  const tumGeri = b.satirlar.flatMap((r) => r.geri);
  const h = b.hedef;
  const mAsim = tumGeri.filter((r) => r.modelGercek > h + 1e-9).length, nAsim = tumGeri.filter((r) => r.naifGercek > h + 1e-9).length;
  const mMaks = Math.max(0, ...tumGeri.map((r) => r.modelGercek - h)), nMaks = Math.max(0, ...tumGeri.map((r) => r.naifGercek - h));
  const kat = st > 0 ? alt / st : 0;
  const sirali = [...b.satirlar].sort((a, c) => (c.e60 - c.statik) - (a.e60 - a.statik));
  kutu.innerHTML = `
    <p class="bolge-cumle">Statik kural bölgede <b>${tr(st)} MW</b> boş görüyor; ${dolu} trafo tamamen dolu.
      Yük hakkında hiçbir varsayım yapmadan bile esnek bağlantı <b>${tr(alt)} MW</b> açıyor${kat >= 1.05 ? ` (${tr(kat, 1)} kat)` : ""}.
      Gerçek yük şekliyle <b>${tr(e30)}–${tr(e90)} MW</b>. Orta varsayımda aynı trafolar, yeni yatırım olmadan yılda <b>${tr(gwh, 0)} GWh</b> daha temiz elektrik taşır:
      <b>${tr(gwh * b.ef, 0)} bin ton CO₂</b> net azalma (muhafazakâr ${tr(gwh * b.efMuh, 0)} bin ton).</p>
    ${tumGeri.length ? `<p class="bolge-geri"><b>Geri test (${geriYillari().join(", ")}; ${tumGeri.length} trafo-yıl):</b> model ile boyutlandırılan bağlantılarda kısıntı hedefi
      ${mAsim} kez aşıldı, en fazla ${tr(mMaks * 100, 1)} puan. "Geçen yıl gibi olur" diyen basit yöntemde ${nAsim} kez, en fazla ${tr(nMaks * 100, 1)} puan.
      Trafo-yıllar bağımsız değil: aynı hava ve aynı ulusal yük şeklini paylaşır, yani bu ${geriYillari().length} yıllık bir sınavdır.</p>` : ""}
    <table class="veri"><thead><tr><th>Trafo merkezi</th><th style="text-align:right">Statik boş</th><th style="text-align:right">Yük bilgisiz alt sınır</th><th style="text-align:right">Esnek (yük %30–%90)</th><th style="text-align:right">Ek enerji (GWh/yıl)</th><th style="text-align:right">Geri test, model (${geriYillari().join(" / ")})</th></tr></thead>
    <tbody>${sirali.map((r) => `<tr><td>${r.ad}</td><td class="r">${tr(r.statik)}</td><td class="r">${tr(r.alt)}</td><td class="r">${tr(r.e30)}–${tr(r.e90)}</td><td class="r">${tr(r.ekMWh60 / 1000, 1)}</td><td class="r">${r.geri.map((g) => `<span class="${g.modelGercek > h + 1e-9 ? "asim" : "tuttu"}">${yuzde(g.modelGercek)}</span>`).join(" / ") || "–"}</td></tr>`).join("")}
    <tr><td><b>Toplam (MW)</b></td><td class="r"><b>${tr(st)}</b></td><td class="r"><b>${tr(alt)}</b></td><td class="r"><b>${tr(e30)}–${tr(e90)}</b></td><td class="r"><b>${tr(gwh, 0)}</b></td><td></td></tr></tbody></table>
    <p class="kucuk">Ek enerji ve CO₂ yalnızca statik sınırın üzerindeki MW için, orta yük varsayımıyla (%60) sayılır. Net emisyon faktörü ${tr(b.ef, 4)} tCO₂/MWh
      (şebeke faktörü − GES yaşam döngüsü 0,048). Sayılar yöntemin bölge ölçeğini gösterir, yatırım kararı değildir.</p>`;
  void e60;
}

function modelTablosu() {
  const satir = (r: any) => `<tr><td>${r.yontem}</td>
    <td class="r">${r.ortalama_pinball != null ? tr(r.ortalama_pinball, 4) : "–"}</td>
    <td class="r">${r.P5_P95_kapsama != null ? yuzde(r.P5_P95_kapsama) : "–"}</td>
    <td class="r">${yuzde(r.P50_MAPE_yuzde / 100, 2)}</td></tr>`;
  return `<table class="veri" style="margin-top:14px"><thead><tr><th>Yöntem (${rapor.test.slice(0, 4)} test yılı)</th><th style="text-align:right">Pinball kaybı ↓</th><th style="text-align:right">P5–P95 kapsama (hedef %90)</th><th style="text-align:right">P50 hata (MAPE)</th></tr></thead>
    <tbody>${rapor.sonuclar.map(satir).join("")}</tbody></table>
    <p class="kucuk">Basit yöntemi geçemeseydi karmaşık modeli kullanmayacaktık. LightGBM tek başına bandı dar tutuyor (kapsama ${yuzde(rapor.sonuclar[2].P5_P95_kapsama)}); conformal kalibrasyon bunu düzeltiyor.</p>`;
}

/** Türkiye tablosu: TEİAŞ'ın iki resmî tablosunun karşılaştırması. Simülasyon içermez. */
// Azami + tahsisli gücün birlikte bilindiği TM sayısı (model/trafolar_birlesik.csv).
// Simülasyonun teknik olarak yapılabileceği üst sınır bu; uygulamada şu an 25'i açık.
const BIRLESIK_TM = 183, BIRLESIK_IL = 45;

function ulusalBolum(): string {
  const u = ulusal;
  if (!u) return "";
  const dolu = (a: number, b: number) => `${tr(100 * a / b, 0)}`;
  const ilk = u.iller.filter((x) => x.tm >= 3).slice(0, 10);
  return `
    <section class="bolum">
      <h2>Türkiye tablosu: ${u.tmSayisi} trafo merkezi, ${u.ilSayisi} il</h2>
      <p>Bu bölümde simülasyon yok. TEİAŞ'ın iki ayrı tarihte yayımladığı resmî tablonun karşılaştırması;
        problemin ulusal büyüklüğünü ve <b>ne hızla büyüdüğünü</b> gösterir.</p>
      <div class="olcumler">
        <div class="olcum"><div class="ad">Kalan kapasite</div><div class="sayi">${tr(u.toplamKalanMWe, 1)}<small>MWe</small></div><div class="ek">${trTarih(u.tarih)} itibarıyla</div></div>
        <div class="olcum vurgu"><div class="ad">Tamamen dolu TM</div><div class="sayi">${u.doluTM}<small>/ ${u.tmSayisi}</small></div><div class="ek">%${dolu(u.doluTM, u.tmSayisi)}'i yeni GES alamıyor</div></div>
        <div class="olcum"><div class="ad">${trTarih(u.oncekiTarih)}'dan beri</div><div class="sayi">${tr(u.degisimMWe, 1)}<small>MWe</small></div><div class="ek">%${tr(Math.abs(u.degisimYuzde), 1)} azaldı</div></div>
        <div class="olcum"><div class="ad">Kapasitesi azalan TM</div><div class="sayi">${u.azalanTM}<small>TM</small></div><div class="ek">artan: ${u.artanTM}</div></div>
        <div class="olcum"><div class="ad">Tamamen dolu il</div><div class="sayi">${u.tamamenDoluIl.length}<small>il</small></div><div class="ek">${u.tamamenDoluIl.join(", ") || "–"}</div></div>
      </div>
      <p class="kucuk">İki tablo arasında ${u.oncekiTMSayisi} → ${u.tmSayisi} trafo merkezi listelendi; dolu TM sayısı
        ${u.oncekiDoluTM}'den ${u.doluTM}'e çıktı. TEİAŞ'ın notu: listede olmayan merkezlerde yönetmeliğin verdiği
        2 MW dışında talep gelmemiş, talep geldikçe ekleniyorlar. Yani bu tablo "yatırımcının kapı çaldığı her TM" demek.</p>
      <table class="veri">
        <thead><tr><th>En dolu iller (3+ TM)</th><th style="text-align:right">Dolu / toplam TM</th><th style="text-align:right">Kalan kapasite</th></tr></thead>
        <tbody>${ilk.map((x) => `<tr><td>${x.il}</td><td class="r">${x.dolu} / ${x.tm}</td>
          <td class="r">${tr(x.kalan, 2)} MWe</td></tr>`).join("")}</tbody>
      </table>
      <p class="kucuk"><b>Simülasyon neden yalnızca Konya–Karaman'da?</b> İki sebep var, ikisi de bu aracın
        sınırını tarif ediyor. <b>Birincisi veri:</b> ters akış sınırı için TM'nin <i>azami</i> kapasitesi gerekiyor,
        TEİAŞ ise yalnızca <i>kalan</i> kapasiteyi yayımlıyor. Azami gücü ikinci bir tabloyla birleştirip
        ${BIRLESIK_TM} TM / ${BIRLESIK_IL} il için çıkarabildik; kalan ${u.tmSayisi - BIRLESIK_TM} merkez için
        çıkaramadık. <b>İkincisi ve daha önemlisi:</b> tahsisli gücün tamamını GES saymak Konya'da savunulabilir
        çünkü bölgede rüzgâr marjinal. Aynı varsayım rüzgârın güçlü olduğu bir ilde <b>yanlış olurdu</b> — rüzgâr
        gece de ürettiği için ters akış tablosu tamamen değişir. Yani <b>yöntem ulusal ölçeğe taşınabilir, sayılar
        taşınamaz</b>: her bölge için kaynak karışımı yeniden ölçülmelidir
        (<code>model/kaynak_kirilimi.py</code> bunu yapar). Bu tablo ulusal bir kapasite iddiası değil, problemin
        büyüklüğünün fotoğrafıdır.</p>
      <p class="kucuk">Kaynak: ${u.kaynak}. Tablolar <code>model/pdf_tablo.py</code> ile okundu; üretilen toplam
        TEİAŞ'ın duyurduğu rakamla birebir doğrulandı.</p>
    </section>`;
}

/** EDAŞ'ın saatlik TM yükünü okur. Dosya tarayıcıdan çıkmaz; sunucuya gönderilmez. */
async function olcumYukle(e: Event) {
  const girdi = e.currentTarget as HTMLInputElement;
  const kutu = document.getElementById("olcumDurum")!;
  const dosya = girdi.files?.[0];
  if (!dosya) return;
  try {
    const sonuc = olcumAyristir(await dosya.text());
    olcum = { ...sonuc, ad: dosya.name };
    kutu.className = "olcum-durum tamam";
    kutu.innerHTML = `<b>${dosya.name}</b> okundu: ${sonuc.satir.toLocaleString("tr")} saat, tepe ${tr(sonuc.tepeMW, 1)} MW.
      ${sonuc.uyari ? `<br><span class="kucuk">${sonuc.uyari}</span>` : ""}
      <br><button class="dugme kucuk-dugme" id="olcumSil">Ölçümü kaldır</button>`;
    document.getElementById("olcumSil")!.addEventListener("click", () => {
      olcum = null; girdi.value = ""; kutu.className = "olcum-durum"; kutu.textContent = "";
      yenile(true);
    });
    await yenile(true);
  } catch (hata) {
    olcum = null; girdi.value = "";
    kutu.className = "olcum-durum hata";
    kutu.textContent = (hata as Error).message;
  }
}

async function ozetIste() {
  const kutu = document.getElementById("gemini")!;
  const btn = document.getElementById("ozetBtn") as HTMLButtonElement;
  btn.disabled = true; btn.textContent = "Not yazılıyor… (genellikle 10–30 sn)";
  try {
    const r = await fetch("/api/ozet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sonOzet) });
    const j = await r.json().catch(() => null);
    if (!j) throw new Error("dil modeli zamanında cevap vermedi. Sayılar yukarıda; birkaç saniye sonra tekrar deneyebilirsiniz");
    if (!r.ok) throw new Error(j.hata || r.statusText);
    kutu.innerHTML = j.metin.split(/\n+/).filter(Boolean).map((p: string) => `<p>${p.replace(/</g, "&lt;")}</p>`).join("") +
      `<p class="kaynak">${j.kaynak === "sablon"
        ? `Şablon metin${j.uyari ? ` (${String(j.uyari).replace(/</g, "&lt;")})` : ""}.</p><button class="dugme kucuk-dugme" id="ozetBtn">Tekrar dene</button><p class="kaynak">`
        : `${j.kaynak === "claude" ? "Claude" : "Gemini"} (${j.model}) yazdı; sayılar simülasyondan.`}</p>`;
    document.getElementById("ozetBtn")?.addEventListener("click", ozetIste);
  } catch (e) {
    kutu.innerHTML = `<p>Not oluşturulamadı: ${(e as Error).message}</p><button class="dugme" id="ozetBtn">Tekrar dene</button>`;
    document.getElementById("ozetBtn")!.addEventListener("click", ozetIste);
  }
}

document.getElementById("paylas")!.addEventListener("click", async (e) => {
  const b = e.currentTarget as HTMLButtonElement;
  try { await navigator.clipboard.writeText(location.href); b.textContent = "Link kopyalandı"; }
  catch { b.textContent = "Adres çubuğundaki linki paylaşın"; }
  setTimeout(() => (b.textContent = "Senaryo linkini kopyala"), 2500);
});

async function basla() {
  const geriYukle = fetch("/geri_test.json").then((r) => r.json());
  fetch("/ulusal.json").then((r) => r.json()).then((u) => { ulusal = u; yenile(false); })
    .catch(() => undefined); // ulusal tablo isteğe bağlı: gelmezse bölüm gizlenir
  const [a, b] = await Promise.all([fetch("/yuk_kantilleri_2026.json"), fetch("/model_raporu.json")]);
  yk = await a.json();
  rapor = await b.json();
  listeCiz();
  ayarlariBagla();
  await yenile(true);
  geriTest = await geriYukle; // büyük dosya: ilk ekran beklemesin
  yenile(false);
}
basla();
