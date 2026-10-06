// Servidor de tasación: Claude busca anuncios reales en los portales (web_search),
// y la valoración se calcula aquí con reglas fijas a partir de esos anuncios.
export const maxDuration = 60;

const PORTALES = ['idealista.com', 'fotocasa.es', 'habitaclia.com', 'pisos.com'];
const MODELO = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const DESCUENTO_NEGOCIACION = 0.07; // precio pedido -> precio de cierre (ajústalo a tu experiencia)
const MIN_COMPARABLES = 3;

const mediana = (a) => percentil(a, 0.5);
function percentil(a, p) {
  const s = [...a].sort((x, y) => x - y);
  const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}
const normUrl = (u) => { try { const x = new URL(u); return x.origin + x.pathname.replace(/\/$/, ''); } catch { return null; } };
const hostValido = (u) => { try { const h = new URL(u).hostname.replace(/^www\./, ''); return PORTALES.some((p) => h === p || h.endsWith('.' + p)); } catch { return false; } };

async function llamarClaude(messages) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: 4000,
      system:
        'Eres un analista inmobiliario en España. Usa la búsqueda web SOLO para localizar anuncios reales de venta en los portales indicados. ' +
        'Extrae únicamente datos que aparezcan en el anuncio: no inventes ni estimes precios ni superficies. ' +
        'Responde SOLO con un array JSON, sin texto antes ni después ni bloques de código.',
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 8, allowed_domains: PORTALES }],
      messages,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || 'Error al consultar la IA (' + res.status + ')');
  return data;
}

export async function POST(req) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: 'Falta ANTHROPIC_API_KEY en el servidor.' }, { status: 500 });

    const d = await req.json();
    const m2 = Number(d.m2);
    const zona = String(d.zona || '').trim().slice(0, 200);
    const tipo = d.tipo === 'local' ? 'local' : 'vivienda';
    const estado = { reformar: 'a reformar', bueno: 'en buen estado', reformado: 'reformado o de obra nueva' }[d.estado] || 'en buen estado';
    if (!zona || !(m2 >= 5 && m2 <= 5000)) return Response.json({ error: 'Indica una zona y una superficie válida (5–5000 m²).' }, { status: 400 });
    const ajustePct = Math.max(-10, Math.min(10, Number(d.calibracion?.ajustePct) || 0));

    const pedido =
      `Busca entre 6 y 10 anuncios de ${tipo === 'local' ? 'locales comerciales' : 'viviendas'} EN VENTA, actuales, similares a este inmueble:\n` +
      `- Zona: ${zona}\n- Superficie: ${m2} m² (prioriza anuncios entre ${Math.round(m2 * 0.7)} y ${Math.round(m2 * 1.3)} m²)\n- Estado: ${estado}\n` +
      (d.habitaciones ? `- Habitaciones: ${Number(d.habitaciones)}\n` : '') +
      (d.notas ? `- Notas: ${String(d.notas).slice(0, 300)}\n` : '') +
      `Prioriza la misma calle, barrio o zona próxima. Portales: ${PORTALES.join(', ')}.\n` +
      'Devuelve SOLO un array JSON con objetos: {"portal":"Idealista|Fotocasa|Habitaclia|pisos.com","url":"enlace exacto del anuncio","titulo":"...","precio":número en euros,"m2":número,"habitaciones":número o null,"fecha":"AAAA-MM-DD si aparece, si no null"}.';

    // Llamada con búsqueda web (puede pausarse; se reanuda hasta 3 veces)
    let messages = [{ role: 'user', content: pedido }];
    const urlsVistas = new Set();
    let texto = '';
    for (let i = 0; i < 3; i++) {
      const r = await llamarClaude(messages);
      for (const b of r.content) {
        if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) b.content.forEach((x) => { const n = x.url && normUrl(x.url); if (n) urlsVistas.add(n); });
      }
      texto = r.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      if (r.stop_reason === 'pause_turn') { messages = [...messages, { role: 'assistant', content: r.content }]; continue; }
      break;
    }

    let crudos = [];
    try { const t = texto.match(/\[[\s\S]*\]/); crudos = JSON.parse(t ? t[0] : '[]'); } catch { crudos = []; }

    // Trazabilidad: solo se aceptan anuncios cuya URL salió realmente de la búsqueda y es de un portal permitido
    const vistos = new Set();
    let comparables = [];
    for (const c of crudos) {
      const n = normUrl(c?.url);
      const precio = Number(c?.precio), sup = Number(c?.m2);
      if (!n || vistos.has(n) || !hostValido(c.url) || !urlsVistas.has(n)) continue;
      if (!(precio >= 10000 && precio <= 20000000) || !(sup >= 10 && sup <= 5000)) continue;
      vistos.add(n);
      comparables.push({ portal: String(c.portal || new URL(c.url).hostname.replace(/^www\./, '')), url: c.url, titulo: String(c.titulo || '').slice(0, 120),
        precio, m2: sup, habitaciones: c.habitaciones ?? null, fecha: c.fecha || null });
    }
    const encontrados = comparables.length;
    if (encontrados < MIN_COMPARABLES)
      return Response.json({ error: `Solo se han podido verificar ${encontrados} anuncios comparables (mínimo ${MIN_COMPARABLES}). Prueba con una zona más amplia o una superficie distinta.` });

    // Descarta valores atípicos (€/m² fuera de 0,6x–1,6x la mediana)
    const med0 = mediana(comparables.map((c) => c.precio / c.m2));
    const filtrados = comparables.filter((c) => { const p = c.precio / c.m2; return p >= med0 * 0.6 && p <= med0 * 1.6; });
    if (filtrados.length >= MIN_COMPARABLES) comparables = filtrados;
    const descartados = encontrados - comparables.length;

    const pm2 = comparables.map((c) => c.precio / c.m2);
    const med = mediana(pm2);
    const factor = (1 - DESCUENTO_NEGOCIACION) * (1 + ajustePct / 100);
    const valor = med * factor * m2;
    const rangoMin = Math.min(percentil(pm2, 0.25) * factor * m2, valor * 0.95);
    const rangoMax = Math.max(percentil(pm2, 0.75) * factor * m2, valor * 1.05);
    const cv = Math.sqrt(pm2.reduce((s, x) => s + (x - med) ** 2, 0) / pm2.length) / med;
    const fiabilidad = comparables.length >= 6 && cv < 0.15 ? 'ALTA' : comparables.length >= 4 && cv < 0.25 ? 'MEDIA' : 'BAJA';

    return Response.json({
      precioTasacion: valor, rangoMin, rangoMax, precioM2: med * factor,
      precioMedioAnuncios: comparables.reduce((s, c) => s + c.precio, 0) / comparables.length,
      fiabilidad,
      resumen: tipo === 'local'
        ? 'Comprobar licencia de actividad, salida de humos, accesibilidad, fachada, instalación eléctrica y cargas registrales.'
        : 'Comprobar cédula de habitabilidad / certificado energético, estado de instalaciones, derramas de la comunidad, cargas registrales y orientación.',
      metodologia: {
        fuentes: [...new Set(comparables.map((c) => c.portal))], nComparables: comparables.length, medianaPrecioM2Anuncio: med,
        descuentoNegociacion: DESCUENTO_NEGOCIACION * 100, ajusteCalibracionPct: ajustePct,
        nota: (descartados ? `Se descartaron ${descartados} anuncio(s) con €/m² atípico. ` : '') + 'Los precios son de anuncio (precio pedido); no sustituyen a una tasación oficial homologada.',
      },
      comparables, fechaConsulta: new Date().toISOString(),
    });
  } catch (e) {
    return Response.json({ error: 'No se pudo completar la tasación: ' + (e.message || 'error desconocido') }, { status: 500 });
  }
}
