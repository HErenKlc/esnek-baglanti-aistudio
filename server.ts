import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
app.use(express.json());

const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

const TALIMAT = `Sen Türkiye'de bir elektrik dağıtım şirketinde (EDAŞ) şebeke planlama mühendisisin.
Sana bir trafo merkezi için esnek (kısılabilir) GES bağlantısı simülasyonunun sonuçları JSON olarak verilecek.
Türkçe, en fazla 4 kısa paragrafta bir planlama notu yaz:
1) Durum: statik kurala göre ne görünüyor, esnek bağlantıyla ne değişiyor.
2) Risk: kısıntının P50/P90 değerleri ne demek; yatırımcı için anlamı.
3) Öneri: ne kadar MW, hangi koşulla (kısıntı sınırı, batarya), tek somut adım.
4) Dikkat: bu analizin modellemediği şey (gerilim, N-1, koruma) ve TM yükünün varsayım olduğu.
JSON'da varsayimsiz_alt_sinir altında yıllık gelir ve kısıntı bedeli (milyon TL) varsa, 2. paragrafta yatırımcı için bunu tek cümleyle söyle.
Kurallar: JSON'da olmayan hiçbir sayı yazma. Sayıları Türkçe biçimde yaz (virgüllü ondalık). Abartma, reklam dili kullanma.
Biçim: düz metin yaz. Yıldız, kalın, başlık, madde imi veya başka markdown işareti kullanma. Her paragrafı tamamla; yarım cümle bırakma. Toplam 150 kelimeyi geçme.`;

const virgul = (x: unknown) => String(x).replace('.', ',');

function sablon(o: any): string {
  const y = (x: number) => `%${(x * 100).toFixed(1).replace('.', ',')}`;
  return [
    `${o.trafo}: statik kurala göre ${virgul(o.statik_kalan_MW)} MW boş görünüyor. Trafo yükü hakkında hiçbir varsayım yapmadan esnek bağlantıyla ${virgul(o.yuk_varsayimsiz_alt_sinir_MW)} MW ek GES bağlanabilir; TM yükü bilinirse bu ${virgul(o.esnek_MW)} MW'a çıkar.`,
    `Yük bilgisiyle bağlanan güçte yeni projenin yıllık kısıntısı tipik yılda ${y(o.kisinti_P50)}, kötü yılda ${y(o.kisinti_P90)}. Mevcut santraller kısılmıyor.`,
    `Öneri: %${virgul(+(o.kabul_kisinti * 100).toFixed(1))} kısıntı sınırlı esnek bağlantı anlaşmasıyla pilot başvuru değerlendirilebilir. Batarya: ${o.batarya}.`,
    ...(Array.isArray(o.varsayimsiz_alt_sinir) ? [`Para karşılığı (varsayımsız alt sınır): ${o.varsayimsiz_alt_sinir.map((m: any) => `${m.risk_olcusu} ${virgul(m.ek_MW)} MW, yılda ≈ ${virgul(m.yillik_gelir_milyon_TL)} milyon TL satış, kısıntı bedeli ≈ ${virgul(m.yillik_kisinti_bedeli_milyon_TL)} milyon TL`).join('; ')}.`] : []),
    `Dikkat: TM yükü (${o.yuk_tepe_varsayim_MW} MW tepe) varsayımdır; gerilim ve koruma etüdü yapılmamıştır.`,
  ].join('\n');
}

const duzelt = (s: string) => s.trim().replace(/\*\*/g, '').replace(/^#+\s*/gm, '');

const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GOOGLE_API_KEY;
const ai = new GoogleGenAI({
  ...(apiKey ? { apiKey } : {}),
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

const CAGRI_MS = 12000;

async function gemini(o: any) {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), CAGRI_MS)
  );

  try {
    const requestPromise = ai.models.generateContent({
      model: MODEL,
      contents: JSON.stringify(o),
      config: {
        systemInstruction: TALIMAT,
        temperature: 0.2,
        maxOutputTokens: 2048,
      },
    });

    const resp = await Promise.race([requestPromise, timeoutPromise]);
    const metin = duzelt(resp.text ?? '');
    if (!metin) throw new Error('Gemini boş yanıt döndü');
    return { metin, kaynak: 'gemini', model: MODEL };
  } catch (sdkError) {
    if (apiKey) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
        method: 'POST',
        signal: AbortSignal.timeout(CAGRI_MS),
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: TALIMAT }] },
          contents: [{ role: 'user', parts: [{ text: JSON.stringify(o) }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } },
        }),
      });
      const j: any = await r.json();
      if (!r.ok) throw new Error(j?.error?.message || `Gemini ${r.status}`);
      const aday = j.candidates?.[0];
      const metin = duzelt((aday?.content?.parts ?? []).map((p: any) => p.text ?? '').join(''));
      if (!metin) throw new Error('Gemini boş yanıt döndü');
      return { metin, kaynak: 'gemini', model: MODEL };
    }
    throw sdkError;
  }
}

app.post('/api/ozet', async (req, res) => {
  const o = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  if (!o || typeof o !== 'object' || !o.trafo) {
    return res.status(400).json({ hata: 'Simülasyon özeti eksik' });
  }

  try {
    const resp = await gemini(o);
    return res.status(200).json(resp);
  } catch (e) {
    console.error('Gemini error:', (e as Error).message);
    const msg = (e as Error).message || '';
    const uyari = /high demand|overloaded|unavailable|rate|quota|429|500|502|503|504|timeout|abort/i.test(msg)
      ? 'Gemini şu an yoğun; sayılar aynı, not şablonla yazıldı. Birkaç saniye sonra tekrar deneyebilirsiniz'
      : 'dil modeline ulaşılamadı; sayılar aynı, not şablonla yazıldı';
    return res.status(200).json({
      metin: sablon(o),
      kaynak: 'sablon',
      uyari,
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist/index.html'));
    });
  } else {
    const vite = await createViteServer({
      root: path.resolve(__dirname, 'web'),
      server: { middlewareMode: true, host: '0.0.0.0', port: PORT },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
