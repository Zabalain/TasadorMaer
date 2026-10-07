import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const SYSTEM_PROMPT = `Eres un motor experto en valoración e informe de tasación inmobiliaria en España.
Tu tarea es analizar los datos de la propiedad introducidos por el usuario y generar una estimación de mercado razonada y trazable.

Devuelve EXCLUSIVAMENTE un objeto JSON válido con la siguiente estructura exacta (sin formato Markdown, sin texto adicional):

{
  "precioTasacion": 210000,
  "rangoMin": 195000,
  "rangoMax": 225000,
  "precioM2": 2100,
  "precioMedioAnuncios": 2250,
  "fiabilidad": "ALTA",
  "resumen": "Resumen técnico de puntos críticos de revisión para la propiedad.",
  "metodologia": {
    "fuentes": ["Idealista", "Fotocasa", "Habitaclia"],
    "nComparables": 6,
    "medianaPrecioM2Anuncio": 2250,
    "descuentoNegociacion": 7,
    "ajusteCalibracionPct": 0,
    "nota": "Estimación calculada mediante análisis comparativo de mercado."
  },
  "comparables": [
    {
      "portal": "Idealista",
      "url": null,
      "titulo": "Inmueble comparable 1",
      "precio": 215000,
      "m2": 85,
      "habitaciones": 3,
      "fecha": "2026-10-01"
    }
  ],
  "fechaConsulta": "2026-10-07T12:00:00.000Z"
}

REGLAS DE PROCESAMIENTO:
1. Extrae los metros cuadrados (m2), estado de conservación, ubicación/zona y habitaciones.
2. Determina un valor realista de mercado ajustado a la zona de España indicada.
3. El campo 'fiabilidad' debe ser estrictamente uno de estos tres valores: "ALTA", "MEDIA" o "BAJA".
4. Genera entre 4 y 8 comparables verosímiles adaptados a la zona del inmueble para justificar la muestra.
5. Los precios finales deben estar redondeados para un acabado profesional.
`;

export async function POST(req) {
  try {
    const body = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Falta la variable GEMINI_API_KEY en las variables de entorno de Vercel." },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    const promptUsuario = `Realiza la tasación del siguiente inmueble:
- Tipo: ${body.tipo || 'vivienda'}
- Estado: ${body.estado || 'bueno'}
- Ubicación/Zona: ${body.zona}
- Superficie: ${body.m2} m²
- Habitaciones: ${body.habitaciones || 'No especificado'}
- Notas adicionales: ${body.notas || 'Ninguna'}
- Ajuste por calibración del usuario: ${body.calibracion?.ajustePct || 0}%`;

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: promptUsuario,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        temperature: 0.1,
      },
    });

    const data = JSON.parse(response.text.trim());
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: "Error en la tasación inmobiliaria: " + error.message },
      { status: 500 }
    );
  }
}
