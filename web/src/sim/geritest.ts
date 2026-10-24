// Geri test: model test yılını GÖRMEDEN boyutlandırır, sonra o yılın gerçek havası + gerçek EPİAŞ yükü ile
// gerçekleşen kısıntı hesaplanır. Aynı şey "naif planlamacı" (geçen yılın tek senaryosu) için de yapılır.
// Soru: kabul edilen kısıntı hedefi gerçekte tuttu mu?

import type { HavaYili } from "../veri/hava";
import {
  senaryolarKur, tekSenaryo, pvYillari, enYuksekEkMW, dagilim, gerceklesenKisinti, statikKalan,
  type TrafoGirdisi,
} from "./kisinti";

export interface GeriTestYili {
  saatler: number[][]; gercek: number[]; onceki_yil_gercek: number[]; saat_kapsama_P5_P95: number; egitim: number[]; kalibrasyon: number;
}
export interface GeriTestVerisi { kantiller: number[]; yillar: Record<string, GeriTestYili> }

export interface YilSonucu {
  yil: number;
  modelMW: number; modelGercek: number; modelBantP05: number; modelBantP95: number;
  naifMW: number; naifGercek: number;
}

export function geriTestYili(
  hava: HavaYili[], veri: GeriTestVerisi, yil: number, g: TrafoGirdisi, hedef: number, ist: "p50" | "p90", cekilis = 5,
): YilSonucu | null {
  const t = veri.yillar[String(yil)];
  const buYil = hava.find((h) => h.yil === yil), gecenYil = hava.find((h) => h.yil === yil - 1);
  const once = hava.filter((h) => h.yil < yil);
  if (!t || !buYil || !gecenYil || once.length < 5) return null;
  const yk = { kantiller: veri.kantiller, saatler: t.saatler };
  const st = statikKalan(g);
  const ust = Math.max(60, g.maksMW * 4);

  // Model: hava bilinmiyor (önceki yıllar), yük olasılıklı (o yılı görmemiş model)
  const sc = senaryolarKur(once, yk, g, cekilis);
  const modelMW = Math.max(st, enYuksekEkMW(sc, g, hedef, ist, undefined, ust));
  const band = dagilim(sc, g, Math.max(modelMW, 0.01));

  // Naif: geçen yılın gerçek havası + gerçek yükü, tek senaryo
  const pvGecen = pvYillari([gecenYil])[0].pv;
  const naifSc = tekSenaryo(pvGecen, t.onceki_yil_gercek, g.yukTepeMW, sc.ihracatLimitiMW, yil - 1);
  const naifMW = Math.max(st, enYuksekEkMW(naifSc, g, hedef, "p50", undefined, ust));

  // Gerçekleşen: bu yılın gerçek havası + gerçek yükü
  const pvBu = pvYillari([buYil])[0].pv;
  const modelGercek = gerceklesenKisinti(pvBu, t.gercek, g, sc.ihracatLimitiMW, Math.max(modelMW, 0.01));
  const naifGercek = gerceklesenKisinti(pvBu, t.gercek, g, sc.ihracatLimitiMW, Math.max(naifMW, 0.01));
  return { yil, modelMW, modelGercek, modelBantP05: band.p05, modelBantP95: band.p95, naifMW, naifGercek };
}
