const admin = require('firebase-admin');
const { GeoPoint } = require('firebase-admin/firestore');
const coordinatesById = require('../data/place-coordinates.json');

const expectedProjectId = 'wayspot-60fd2';
const args = process.argv.slice(2);
const projectFlag = args.indexOf('--project');
const projectId = projectFlag >= 0 ? args[projectFlag + 1] : undefined;
const apply = args.includes('--apply');
const validArgs = args.every((arg, index) =>
    arg === '--apply' || arg === '--project' || (index === projectFlag + 1 && arg === projectId)
);

if (!validArgs || projectId !== expectedProjectId) {
    console.error('Uso: node functions/scripts/backfill-place-coordinates.js --project wayspot-60fd2 [--apply]');
    process.exit(1);
}

for (const [id, point] of Object.entries(coordinatesById)) {
    if (
        !id ||
        !Number.isFinite(point.latitude) ||
        !Number.isFinite(point.longitude) ||
        Math.abs(point.latitude) > 90 ||
        Math.abs(point.longitude) > 180
    ) {
        throw new Error(`Coordenadas invalidas para ${id}`);
    }
}

admin.initializeApp({ projectId });
const db = admin.firestore();

async function main() {
    const entries = Object.entries(coordinatesById);
    const references = entries.map(([id]) => db.collection('places').doc(id));
    const snapshots = await db.getAll(...references);
    const missing = snapshots.filter((snapshot) => !snapshot.exists).map((snapshot) => snapshot.id);

    if (missing.length > 0) {
        throw new Error(`No se escribio nada. Faltan documentos: ${missing.join(', ')}`);
    }

    const pending = [];
    for (const snapshot of snapshots) {
        const stored = snapshot.get('coordinates');
        if (stored === undefined || stored === null) {
            pending.push(snapshot.ref);
        } else if (stored instanceof GeoPoint) {
            console.log(`Conservado ${snapshot.id}: ya tiene GeoPoint`);
        } else {
            throw new Error(`No se escribio nada. ${snapshot.id}.coordinates existe con otro tipo`);
        }
    }

    console.log(`${apply ? 'Aplicando' : 'Vista previa'} en ${projectId}: ${pending.length} documentos`);
    pending.forEach((reference) => {
        const point = coordinatesById[reference.id];
        console.log(`${reference.path}: ${point.latitude}, ${point.longitude}`);
    });

    if (!apply || pending.length === 0) return;

    const batch = db.batch();
    pending.forEach((reference) => {
        const point = coordinatesById[reference.id];
        batch.update(reference, {
            coordinates: new GeoPoint(point.latitude, point.longitude),
        });
    });
    await batch.commit();
    console.log(`Actualizados ${pending.length} documentos`);
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
