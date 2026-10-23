---
name: firebase-firestore-functions
description: Implement or update Firestore-backed Firebase Cloud Functions in this repository, including event triggers and FCM notifications. Use when changing functions/index.js, Firestore data access, or server-side notification behavior.
metadata:
  short-description: Firestore and Cloud Functions for this project
---

# Firestore and Cloud Functions

Use this skill for backend changes that read or write Firestore from Firebase Cloud Functions, or send FCM notifications from those functions. Work with the current repository before assuming its schema or deployment setup.

## Project conventions

Read [project-patterns.md](references/project-patterns.md) before changing triggers, Firestore paths, batches, or notification code. It records the observed runtime, SDK setup, and data paths. Treat it as a snapshot of current conventions: inspect the live source and Firebase configuration if they differ.

## Workflow

1. Inspect `firebase.json`, `functions/package.json`, `functions/index.js`, and any relevant Firestore rules or client-side writers. Confirm the trigger path and the fields actually written by the app before relying on a schema.
2. Preserve the existing Cloud Functions v2 and Admin SDK style unless the task requires a migration. Initialize Admin once, reuse the Firestore instance, and use structured `logger` calls that avoid logging credentials or full FCM tokens.
3. For Firestore triggers, use the event's document parameters and snapshots. Handle deleted/missing documents and optional fields explicitly. For update triggers, compare before and after values and return early when the relevant field did not change.
4. Keep writes bounded and intentional. Firestore write batches accept at most 500 operations; chunk larger fan-outs. Prefer transactions when a decision depends on the latest value and concurrent writes could invalidate it. Do not add reads or writes that the feature does not need.
5. Treat event handlers that cause external effects, including FCM sends, as potentially repeatable. Avoid duplicate effects where retries or redelivery are enabled; use a stable event or notification identifier when the product requires exactly-once behavior. Do not claim delivery to a device merely because `admin.messaging().send()` returned a message ID.
6. For FCM, verify the stored value is a current FCM registration token, the target app is registered to the same Firebase project, and user notification preferences are honored. Send via the Admin SDK from trusted server code. Handle invalid/unregistered token responses deliberately; do not silently erase tokens for unrelated errors.
7. Keep changes focused. Deploy only when the user asks for deployment or has already authorized it. Report the changed files and any validation performed.

## Troubleshooting FCM tests

The Firebase Console does not automatically import tokens stored in Cloud Firestore. A single-device console test requires manually entering or selecting the FCM registration token in the **Test on device** dialog. “No test devices configured” means there are no saved suggestions; it does not prove that the app has no token. A console campaign test and a production campaign target are separate flows.

When a test is accepted but no visible notification appears, check that the app is installed and registered against the same Firebase project, the token is current, Android notification permission is granted (Android 13+), and the app is in the background. Notification payloads received in the foreground generally need app-side handling to show a visible notification. Consult the official Firebase Cloud Messaging docs for platform-specific behavior rather than guessing from the console UI.

## References

- [Project patterns](references/project-patterns.md) — current runtime, triggers, Firestore paths, token and preference fields.
