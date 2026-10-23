const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();

exports.updateUserInfoInReviews = onDocumentUpdated('users/{userId}', async (event) => {
    const userId = event.params.userId;
    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();

    if (beforeData.avatarUrl === afterData.avatarUrl) {
        logger.info('El avatar no cambió. No se actualizan las reseñas.', { userId });
        return;
    }

    const reviewsSnapshot = await db.collection('reviews')
        .where('userId', '==', userId)
        .get();

    for (let offset = 0; offset < reviewsSnapshot.docs.length; offset += 500) {
        const batch = db.batch();
        const reviewBatch = reviewsSnapshot.docs.slice(offset, offset + 500);

        reviewBatch.forEach((reviewDocument) => {
            batch.update(reviewDocument.ref, {
                'user.avatarUrl': afterData.avatarUrl || null,
            });
        });

        await batch.commit();
    }

    logger.info('Se actualizaron los avatares de las reseñas.', {
        userId,
        reviewCount: reviewsSnapshot.size,
    });
});

exports.sendFollowNotification = onDocumentCreated(
    'users/{userId}/followers/{followerId}',
    async (event) => {
        const userId = event.params.userId;
        const followerId = event.params.followerId;

        const [userDocument, followerDocument] = await Promise.all([
            db.collection('users').doc(userId).get(),
            db.collection('users').doc(followerId).get(),
        ]);

        if (!userDocument.exists) {
            logger.info('No existe el usuario que recibió el seguimiento.', { userId });
            return;
        }

        const userData = userDocument.data();
        if (userData.notificationPreferences?.newFollowers !== true) {
            logger.info('El usuario tiene desactivadas las notificaciones de seguidores.', {
                userId,
            });
            return;
        }

        const userToken = userData.fcmToken;
        if (!userToken) {
            logger.info('El usuario no tiene un token FCM registrado.', { userId });
            return;
        }

        const followerData = followerDocument.data();
        const followerName = followerData?.name || followerData?.username || followerId;
        const message = {
            token: userToken,
            notification: {
                title: 'Nuevo seguidor',
                body: `${followerName} comenzó a seguirte.`,
            },
        };

        try {
            await admin.messaging().send(message);
            logger.info('Se envió la notificación de nuevo seguidor.', { userId, followerId });
        } catch (error) {
            logger.error('No se pudo enviar la notificación de nuevo seguidor.', {
                userId,
                followerId,
                error,
            });
        }
    }
);

exports.sendReviewLikeNotification = onDocumentCreated(
    'reviews/{reviewId}/likes/{likerId}',
    async (event) => {
        const reviewId = event.params.reviewId;
        const likerId = event.params.likerId;

        const reviewDocument = await db.collection('reviews').doc(reviewId).get();

        if (!reviewDocument.exists) {
            logger.info('No existe la reseña que recibió el like.', { reviewId });
            return;
        }

        const reviewData = reviewDocument.data();
        const reviewOwnerId = reviewData.userId;

        if (!reviewOwnerId || reviewOwnerId === likerId) {
            logger.info('No se envía notificación para un like propio o sin autor.', {
                reviewId,
                likerId,
            });
            return;
        }

        const [reviewOwnerDocument, likerDocument] = await Promise.all([
            db.collection('users').doc(reviewOwnerId).get(),
            db.collection('users').doc(likerId).get(),
        ]);

        if (!reviewOwnerDocument.exists) {
            logger.info('No existe el usuario autor de la reseña.', { reviewId, reviewOwnerId });
            return;
        }

        const reviewOwnerData = reviewOwnerDocument.data();
        if (reviewOwnerData.notificationPreferences?.likesReceived !== true) {
            logger.info('El usuario tiene desactivadas las notificaciones de likes.', {
                reviewId,
                reviewOwnerId,
            });
            return;
        }

        const reviewOwnerToken = reviewOwnerData.fcmToken;
        if (!reviewOwnerToken) {
            logger.info('El autor de la reseña no tiene un token FCM registrado.', {
                reviewId,
                reviewOwnerId,
            });
            return;
        }

        const likerData = likerDocument.exists ? likerDocument.data() : {};
        const likerName = likerData.name || likerData.username || likerId;
        const message = {
            token: reviewOwnerToken,
            notification: {
                title: 'Nuevo me gusta',
                body: `${likerName} indicó que le gusta tu reseña.`,
            },
            data: {
                reviewId,
            },
        };

        try {
            await admin.messaging().send(message);
            logger.info('Se envió la notificación de like en reseña.', {
                reviewId,
                reviewOwnerId,
                likerId,
            });
        } catch (error) {
            logger.error('No se pudo enviar la notificación de like en reseña.', {
                reviewId,
                reviewOwnerId,
                likerId,
                error,
            });
        }
    }
);
