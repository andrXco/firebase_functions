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

exports.sendReviewCommentNotification = onDocumentCreated(
    'comments/{commentId}',
    async (event) => {
        const commentId = event.params.commentId;
        const commentData = event.data?.data();

        if (!commentData) {
            logger.info('El comentario no contiene datos.', { commentId });
            return;
        }

        const reviewId = commentData.reviewId;
        const commenterId = commentData.userId;

        if (!reviewId || !commenterId) {
            logger.info('El comentario no incluye la reseña o el autor.', { commentId });
            return;
        }

        const reviewDocument = await db.collection('reviews').doc(reviewId).get();

        if (!reviewDocument.exists) {
            logger.info('No existe la reseña que recibió el comentario.', {
                commentId,
                reviewId,
            });
            return;
        }

        const reviewOwnerId = reviewDocument.data().userId;

        if (!reviewOwnerId || reviewOwnerId === commenterId) {
            logger.info('No se envía notificación para un comentario propio o sin autor.', {
                commentId,
                reviewId,
                commenterId,
            });
            return;
        }

        const reviewOwnerDocument = await db.collection('users').doc(reviewOwnerId).get();

        if (!reviewOwnerDocument.exists) {
            logger.info('No existe el usuario autor de la reseña.', {
                commentId,
                reviewId,
                reviewOwnerId,
            });
            return;
        }

        const reviewOwnerData = reviewOwnerDocument.data();
        if (reviewOwnerData.notificationPreferences?.reviewComments !== true) {
            logger.info('El usuario tiene desactivadas las notificaciones de comentarios.', {
                commentId,
                reviewId,
                reviewOwnerId,
            });
            return;
        }

        const reviewOwnerToken = reviewOwnerData.fcmToken;
        if (!reviewOwnerToken) {
            logger.info('El autor de la reseña no tiene un token FCM registrado.', {
                commentId,
                reviewId,
                reviewOwnerId,
            });
            return;
        }

        const commenter = commentData.user || {};
        const commenterName = commenter.name || commenter.username || commenterId;
        const message = {
            token: reviewOwnerToken,
            notification: {
                title: 'Nuevo comentario',
                body: `${commenterName} comentó tu reseña.`,
            },
            data: {
                reviewId,
                commentId,
            },
        };

        try {
            await admin.messaging().send(message);
            logger.info('Se envió la notificación de comentario en reseña.', {
                commentId,
                reviewId,
                reviewOwnerId,
                commenterId,
            });
        } catch (error) {
            logger.error('No se pudo enviar la notificación de comentario en reseña.', {
                commentId,
                reviewId,
                reviewOwnerId,
                commenterId,
                error,
            });
        }
    }
);

exports.sendNewReviewFromFollowingNotification = onDocumentCreated(
    'reviews/{reviewId}',
    async (event) => {
        const reviewId = event.params.reviewId;
        const reviewData = event.data?.data();

        if (!reviewData) {
            logger.info('La reseña no contiene datos.', { reviewId });
            return;
        }

        const authorId = reviewData.userId;
        if (typeof authorId !== 'string' || authorId.length === 0) {
            logger.info('La reseña no incluye el ID de su autor.', { reviewId });
            return;
        }

        const author = reviewData.user || {};
        const authorNameCandidate = author.name || reviewData.authorName || author.username;
        const authorName = typeof authorNameCandidate === 'string'
            ? authorNameCandidate
            : authorId;
        const followersRef = db.collection('users').doc(authorId).collection('followers');
        const messaging = admin.messaging();
        const sentTokens = new Set();
        let followerCursor = null;
        let eligibleTokenCount = 0;
        let successCount = 0;
        let failureCount = 0;

        while (true) {
            let followersQuery = followersRef
                .orderBy(admin.firestore.FieldPath.documentId())
                .limit(500);

            if (followerCursor) {
                followersQuery = followersQuery.startAfter(followerCursor);
            }

            const followersSnapshot = await followersQuery.get();
            if (followersSnapshot.empty) {
                break;
            }

            const followerDocuments = followersSnapshot.docs.filter(
                (followerDocument) => followerDocument.id !== authorId
            );
            const followerUsers = followerDocuments.length > 0
                ? await db.getAll(...followerDocuments.map(
                    (followerDocument) => db.collection('users').doc(followerDocument.id)
                ))
                : [];

            const tokens = followerUsers
                .filter((followerUser) => followerUser.exists)
                .filter((followerUser) => {
                    const preferences = followerUser.data().notificationPreferences;
                    return preferences?.newReviewsFromFollowing === true;
                })
                .map((followerUser) => followerUser.data().fcmToken)
                .filter((token) => typeof token === 'string' && token.length > 0)
                .filter((token) => {
                    if (sentTokens.has(token)) {
                        return false;
                    }
                    sentTokens.add(token);
                    return true;
                });

            eligibleTokenCount += tokens.length;

            if (tokens.length > 0) {
                try {
                    const response = await messaging.sendEachForMulticast({
                        tokens,
                        notification: {
                            title: 'Nueva reseña',
                            body: `${authorName} publicó una reseña nueva.`,
                        },
                        data: {
                            reviewId,
                            authorId,
                        },
                    });
                    successCount += response.successCount;
                    failureCount += response.failureCount;
                } catch (error) {
                    failureCount += tokens.length;
                    logger.error('No se pudieron enviar notificaciones de nueva reseña.', {
                        reviewId,
                        authorId,
                        tokenCount: tokens.length,
                        error,
                    });
                }
            }

            followerCursor = followersSnapshot.docs[followersSnapshot.docs.length - 1];
            if (followersSnapshot.size < 500) {
                break;
            }
        }

        logger.info('Se procesaron las notificaciones de nueva reseña.', {
            reviewId,
            authorId,
            eligibleTokenCount,
            successCount,
            failureCount,
        });
    }
);

