// Bağımlılıksız SVG grafikler: barındırma eğrisi, ay×saat kısıntı haritası, model doğrulama haftası.

const ns = "http://www.w3.org/2000/svg";
const tr = (x: number, d = 0) => x.toLocaleString("tr-TR", { maximumFractionDigits: d, minimumFractionDigits: d });

function svg(w: number, h: number, etiket: string) {
  const s = document.createElementNS(ns, "svg");
  s.setAttribute("viewBox", `0 0 ${w} ${h}`);
  s.setAttribute("class", "grafik");
  s.setAttribute("role", "img");
  s.setAttribute("aria-label", etiket);
  return s;
}
function el(tag: string, a: Record<string, string | number>, ebeveyn?: Element, metin?: string) {
  const e = document.createElementNS(ns, tag);
  for (const [k, v] of Object.entries(a)) e.setAttribute(k, String(v));
  if (metin != null) e.textContent = metin;
  ebeveyn?.appendChild(e);
  return e;
}

export interface EgriNoktasi { mw: number; p50: number; p90: number }

export function egriGrafigi(
  n: EgriNoktasi[], hedef: number, statikMW: number, esnekMW: number, istatistik: "p50" | "p90",
): SVGSVGElement {
  const W = 720, H = 330, m = { l: 52, r: 18, t: 18, b: 44 };
  const s = svg(W, H, "Eklenen GES gücüne göre yıllık kısıntı oranı");
  const xMax = n[n.length - 1].mw;
  const yMax = Math.max(hedef * 2.2, Math.min(0.4, Math.max(...n.map((p) => p.p90)) * 1.05), 0.02);
  const x = (v: number) => m.l + (v / xMax) * (W - m.l - m.r);
  const y = (v: number) => H - m.b - (Math.min(v, yMax) / yMax) * (H - m.t - m.b);

  // ızgara
  const adimY = yMax > 0.2 ? 0.05 : yMax > 0.08 ? 0.02 : 0.01;
  for (let v = 0; v <= yMax + 1e-9; v += adimY) {
    el("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), stroke: "var(--cizgi-ince)" }, s);
    el("text", { x: m.l - 8, y: y(v) + 4, "text-anchor": "end", class: "rakam" }, s, `%${tr(v * 100)}`);
  }
  const adimX = xMax > 200 ? 50 : xMax > 80 ? 20 : 10;
  for (let v = 0; v <= xMax + 1e-9; v += adimX) {
    el("text", { x: x(v), y: H - m.b + 18, "text-anchor": "middle", class: "rakam" }, s, tr(v));
  }
  el("text", { x: (m.l + W - m.r) / 2, y: H - 6, "text-anchor": "middle" }, s, "Tahsisli güce eklenen yeni GES (MW)");

  // hedef çizgisi
  el("line", { x1: m.l, x2: W - m.r, y1: y(hedef), y2: y(hedef), stroke: "var(--murekkep)", "stroke-dasharray": "5 4" }, s);
  el("text", { x: W - m.r - 4, y: y(hedef) - 6, "text-anchor": "end" }, s, `kabul edilen kısıntı %${tr(hedef * 100, 1)}`);

  // statik kalan ve esnek sonuç işaretleri
  const isaret = (mw: number, renk: string, yazi: string, ust: boolean) => {
    if (mw <= 0 && yazi.startsWith("statik")) return;
    el("line", { x1: x(mw), x2: x(mw), y1: m.t, y2: H - m.b, stroke: renk, "stroke-width": 1.5 }, s);
    el("text", { x: x(mw) + 6, y: ust ? m.t + 12 : m.t + 28, fill: renk }, s, yazi);
  };
  isaret(statikMW, "var(--murekkep-2)", `statik kural: ${tr(statikMW)} MW`, false);
  isaret(esnekMW, "var(--uygun)", `esnek: ${tr(esnekMW)} MW`, true);

  const yol = (k: "p50" | "p90") => n.map((p, i) => `${i ? "L" : "M"}${x(p.mw).toFixed(1)},${y(p[k]).toFixed(1)}`).join("");
  el("path", { d: yol("p50"), fill: "none", stroke: "var(--gunes)", "stroke-width": istatistik === "p50" ? 3 : 2 }, s);
  el("path", { d: yol("p90"), fill: "none", stroke: "var(--kisinti)", "stroke-width": istatistik === "p90" ? 3 : 2 }, s);
  return s;
}

const AYLAR = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

export function isiHaritasi(isi: Float64Array): SVGSVGElement {
  const W = 520, H = 330, m = { l: 40, r: 10, t: 14, b: 40 };
  const s = svg(W, H, "Ay ve saate göre ortalama kısılan enerji");
  const cw = (W - m.l - m.r) / 24, ch = (H - m.t - m.b) / 12;
  // gün başına ortalama MWh: ay toplamı / gün sayısı
  const GUN = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let maks = 0;
  const v: number[] = [];
  for (let a = 0; a < 12; a++) for (let h = 0; h < 24; h++) { const d = isi[a * 24 + h] / GUN[a]; v.push(d); maks = Math.max(maks, d); }
  for (let a = 0; a < 12; a++) {
    el("text", { x: m.l - 6, y: m.t + a * ch + ch / 2 + 4, "text-anchor": "end" }, s, AYLAR[a]);
    for (let h = 0; h < 24; h++) {
      const d = v[a * 24 + h];
      const o = maks > 0 ? d / maks : 0;
      el("rect", {
        x: m.l + h * cw + 0.5, y: m.t + a * ch + 0.5, width: cw - 1, height: ch - 1,
        fill: o > 0.002 ? "var(--kisinti)" : "var(--cizgi-ince)", "fill-opacity": o > 0.002 ? 0.12 + 0.88 * o : 1,
      }, s);
    }
  }
  for (const h of [0, 6, 12, 18, 23]) el("text", { x: m.l + h * cw + cw / 2, y: H - m.b + 16, "text-anchor": "middle", class: "rakam" }, s, `${h}:00`);
  el("text", { x: (m.l + W) / 2, y: H - 6, "text-anchor": "middle" }, s, `Saat · en koyu hücre ≈ ${tr(maks, 2)} MWh/gün`);
  return s;
}

export function dogrulamaGrafigi(h: { gercek: number[]; p05: number[]; p50: number[]; p95: number[] }): SVGSVGElement {
  const W = 720, H = 240, m = { l: 44, r: 12, t: 12, b: 34 };
  const s = svg(W, H, "2025 test haftası: gerçek tüketim ve model bandı");
  const tum = [...h.gercek, ...h.p05, ...h.p95];
  const lo = Math.min(...tum) * 0.98, hi = Math.max(...tum) * 1.02;
  const x = (i: number) => m.l + (i / (h.gercek.length - 1)) * (W - m.l - m.r);
  const y = (v: number) => H - m.b - ((v - lo) / (hi - lo)) * (H - m.t - m.b);
  const bant = h.p95.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join("") +
    h.p05.map((_, i) => { const j = h.p05.length - 1 - i; return `L${x(j)},${y(h.p05[j])}`; }).join("") + "Z";
  el("path", { d: bant, fill: "var(--gunes-acik)", "fill-opacity": 0.7 }, s);
  const cizgi = (d: number[], renk: string, gen: number) =>
    el("path", { d: d.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(""), fill: "none", stroke: renk, "stroke-width": gen }, s);
  cizgi(h.p50, "var(--dikkat)", 1.5);
  cizgi(h.gercek, "var(--murekkep)", 2);
  const gunler = ["Pzt 14", "Sal 15", "Çar 16", "Per 17", "Cum 18", "Cmt 19", "Paz 20"];
  gunler.forEach((g, k) => el("text", { x: x(k * 24 + 12), y: H - m.b + 18, "text-anchor": "middle" }, s, g));
  for (const v of [lo, (lo + hi) / 2, hi]) el("text", { x: m.l - 6, y: y(v) + 4, "text-anchor": "end", class: "rakam" }, s, tr(v, 2));
  return s;
}
