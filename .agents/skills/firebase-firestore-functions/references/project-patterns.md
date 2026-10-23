# Project patterns: Firebase Functions and Firestore

These notes reflect the repository source inspected on 2026-10-23. The source of truth remains the current files; update these notes when project structure or data fields change.

## Runtime and initialization

- Functions source directory: `functions/`, configured from root `firebase.json`.
- Runtime: Node.js 22 (`functions/package.json`).
- Functions SDK: `firebase-functions` 7.x; triggers currently import from `firebase-functions/v2/firestore`.
- Admin SDK: `firebase-admin` 13.x.
- CommonJS entry point: `functions/index.js`.
- `admin.initializeApp()` is called once at module scope. The shared Firestore instance is `const db = admin.firestore()`.
- Existing functions use structured logging from `firebase-functions/logger`.

## Current trigger and data patterns

- `updateUserInfoInReviews` listens to `users/{userId}` updates. It compares `avatarUrl` before and after, then queries `reviews` where `userId == userId` and updates `user.avatarUrl`. Writes are chunked into batches of at most 500.
- `sendFollowNotification` listens to creation of `users/{userId}/followers/{followerId}`. It loads both user documents, checks `users/{userId}.notificationPreferences.newFollowers === true`, then sends to `users/{userId}.fcmToken`.
- `sendReviewLikeNotification` listens to creation of `reviews/{reviewId}/likes/{likerId}`. It loads the review, resolves the owner from `reviews/{reviewId}.userId`, skips missing/self likes, checks `users/{ownerId}.notificationPreferences.likesReceived === true`, then sends to the owner's `fcmToken`.
- Follower and liker display names prefer `name`, then `username`, then the document ID.
- The like notification includes `reviewId` in its FCM `data` payload. FCM data values must be strings; preserve this when adding fields.
- Current handlers log failures but do not clear invalid tokens or configure explicit retry behavior. Do not assume either behavior exists.

## Important boundaries

- Admin SDK operations run with server credentials and are not restricted by Firestore client security rules. Check and update client rules separately when a feature also changes client access; never treat server-side validation as a substitute for correct client rules.
- The repository's function code documents only the fields above. Search client writers and current rules before adding new schema assumptions.
- Do not log FCM token values. The token identifies an app installation and should be handled as sensitive operational data.
- FCM `send()` success means FCM accepted the message for delivery; it does not prove that Android displayed it or that a user saw it.
