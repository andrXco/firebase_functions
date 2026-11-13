# Firebase Cloud Functions

Funciones de Firebase para WaySpot. Requiere Node.js 22 y Firebase CLI.

## Desplegar

1. Instala Firebase CLI: `npm install -g firebase-tools`.
2. Inicia sesión: `firebase login`.
3. En la raíz del proyecto, selecciona el proyecto Firebase: `firebase use --add`.
4. Despliega las funciones: `firebase deploy --only functions`.

Después del despliegue, Firebase mantiene activas las funciones y ejecuta cada una cuando ocurre el evento configurado en Firestore. Para ejecutarlas localmente con el emulador: `cd functions`, `npm install` y `npm run serve`.

## Coordenadas de lugares existentes

Las coordenadas versionadas están en `functions/data/place-coordinates.json`. El script `functions/scripts/backfill-place-coordinates.js` agrega el campo `coordinates` como `GeoPoint` a los seis documentos existentes de `places` en `wayspot-60fd2`. Conserva los valores que ya existan y no crea documentos nuevos. Es una migración puntual, no una Cloud Function ni una tarea de inicio de la app.

Con Node.js 22, las dependencias de `functions` instaladas y credenciales de aplicación de Google Cloud disponibles:

```sh
cd functions
npm run backfill:place-coordinates -- --project wayspot-60fd2
npm run backfill:place-coordinates -- --project wayspot-60fd2 --apply
```

El primer comando solo muestra los cambios. El segundo los escribe. `firebase login` no proporciona por sí solo las credenciales de aplicación que usa Admin SDK; si no están disponibles, usa `gcloud auth application-default login` con una cuenta autorizada para escribir en Firestore. Comprueba después el campo `coordinates` de tipo geopoint en `places/piedra_del_penol` y los demás documentos.
