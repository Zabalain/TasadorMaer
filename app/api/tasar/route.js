import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const SYSTEM_PROMPT = `Eres un experto en valoración e informe de tasación inmobiliaria en España. 
Tu función es analizar los datos de la propiedad introducidos por el usuario (ubicación, superficie m2, habitaciones, estado, tipo de inmueble) y generar una estimación razonada de mercado.

REGLAS DE PROCESAMIENTO:
1. Extrae m2, municipio/zona, número de habitaciones, baños y conservación.
2. Determina un precio estimado por m2 acorde al mercado de la zona.
3. Calcula el valor total de mercado estimado y aplica un rango comercial (mínimo - máximo).
4. Redondea los valores finales a bloques de 500€ o 1.000€ para un acabado profesional.
5. Genera un resumen con aspectos clave a valorar (orientación, estado del edificio, eficiencia energética, necesidad de reforma).

Devuelve estrictamente un JSON válido con este formato:
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
        { error: "Falta la variable GEMINI_API_KEY en las variables de entorno de Vercel." },
        { status: 500 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.0,
      },
      systemInstruction: SYSTEM_PROMPT,
    });

    const result = await model.generateContent(
      `Analiza y realiza la tasación inmobiliaria para: ${query}`
    );

    const responseText = result.response.text();
    const data = JSON.parse(responseText.trim());

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: "Error en el servidor de tasación: " + error.message },
      { status: 500 }
    );
  }
}
