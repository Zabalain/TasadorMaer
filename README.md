# Tasación Inmobiliaria Maer

1. `npm install`
2. Copia `.env.example` a `.env.local` y pon tu `ANTHROPIC_API_KEY`
3. `npm run dev` y abre http://localhost:3000

Despliegue en Vercel: sube la carpeta a GitHub, impórtala en Vercel y añade `ANTHROPIC_API_KEY` en Environment Variables.

- Interfaz: `public/index.html` (se sirve en `/`). Pon `MODO_DEMO = true` dentro para probar solo el diseño.
- Servidor: `app/api/tasar/route.js` (búsqueda de anuncios + cálculo). Descuento de negociación: constante `DESCUENTO_NEGOCIACION`.
