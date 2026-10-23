# Firebase Cloud Functions

Funciones de Firebase para WaySpot. Requiere Node.js 22 y Firebase CLI.

## Desplegar

1. Instala Firebase CLI: `npm install -g firebase-tools`.
2. Inicia sesión: `firebase login`.
3. En la raíz del proyecto, selecciona el proyecto Firebase: `firebase use --add`.
4. Despliega las funciones: `firebase deploy --only functions`.

Después del despliegue, Firebase mantiene activas las funciones y ejecuta cada una cuando ocurre el evento configurado en Firestore. Para ejecutarlas localmente con el emulador: `cd functions`, `npm install` y `npm run serve`.
