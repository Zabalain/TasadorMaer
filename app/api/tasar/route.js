import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `Eres un motor experto en valoración e informe de tasación inmobiliaria en España.
Tu tarea es analizar los datos de la propiedad introducidos por el usuario y generar una estimación de mercado razonada y trazable.

Devuelve EXCLUSIVAMENTE un objeto JSON válido (sin etiquetas markdown, sin texto antes ni después) con esta estructura exacta:

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

REGLAS:
1. 'fiabilidad' solo puede ser "ALTA", "MEDIA" o "BAJA".
2. Incluye entre 4 y 8 comparables verosímiles adaptados a la zona.
3. Precios redondeados.`;

export async function POST(req) {
  try {
    const body = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Falta la variable GEMINI_API_KEY en Vercel." },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    const promptUsuario = `Tasación inmobiliaria:
- Tipo: ${body.tipo || 'vivienda'}
- Estado: ${body.estado || 'bueno'}
- Ubicación/Zona: ${body.zona}
- Superficie: ${body.m2} m²
- Habitaciones: ${body.habitaciones || 'No especificado'}
- Notas: ${body.notas || 'Ninguna'}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: promptUsuario,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
      },
    });

    const rawText = response?.text || "";
    const jsonString = rawText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

    if (!jsonString) {
      throw new Error("Respuesta vacía del servidor de IA.");
    }

    const data = JSON.parse(jsonString);
    return NextResponse.json(data);
  } catch (error) {
    let mensajeError = error.message || "Error al procesar la respuesta.";
    
    // Si la API devuelve un 503 por límite de peticiones o demanda
    if (mensajeError.includes("503") || mensajeError.includes("high demand")) {
      mensajeError = "La API de Google está saturada temporalmente. Por favor, espera 30 segundos y vuelve a pulsar en Tasar.";
    }

    return NextResponse.json(
      { error: "Error en la tasación: " + mensajeError },
      { status: 500 }
    );
  }
}
