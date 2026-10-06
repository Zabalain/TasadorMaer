import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const SYSTEM_PROMPT = `Eres un experto en valoración e informe de tasación inmobiliaria en España. 
Tu función es analizar los datos de la propiedad introducidos por el usuario (ubicación, superficie m2, habitaciones, estado, tipo de inmueble) y generar una estimación razonada de mercado.

REGLAS DE PROCESAMIENTO:
1. Extrae m2, municipio/zona, número de habitaciones, baños y conservación.
2. Determina un precio estimado por m2 acorde al mercado de la zona.
3. Calcula el valor total de mercado estimado y aplica un rango comercial (mínimo - máximo).
4. Redondea los valores finales a bloques de 500€ o 1.000€ para un acabado profesional.
5. Genera un resumen con aspectos clave a valorar (orientación, estado del edificio, eficiencia energética, necesidad de reforma).

Devuelve strictly un JSON válido:
{
  "necesitaAclaracion": false,
  "valorEstimado": "XXX.XXX",
  "valorMinimo": "XXX.XXX",
  "valorMaximo": "XXX.XXX",
  "precioMetroCuadrado": "X.XXX",
  "resumen": "Análisis y factores clave a revisar en la inspección de la propiedad."
}`;

export async function POST(req) {
  try {
    const { query } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Falta la variable GEMINI_API_KEY en el servidor." },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: `Analiza y realiza la tasación inmobiliaria para: ${query}`,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        temperature: 0.0,
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
