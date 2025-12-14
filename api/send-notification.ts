import { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';
import { db } from './db';

export default async (req: VercelRequest, res: VercelResponse) => {
    // CORS와 POST 요청 처리
    // Allow all origins to prevent 'Failed to fetch' in preview/dev environments
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    const { chatId, senderId, text } = req.body;
    
    try {
        // 발신자 이름 조회
        const senderSnapshot = await db.ref(`users/${senderId}/name`).once('value');
        const senderName = senderSnapshot.val() || '알 수 없는 사용자'; 

        // 1. 채팅방 사용자 목록 및 FCM 토큰을 RTDB에서 읽기
        const chatSnapshot = await db.ref(`chats/${chatId}`).once('value');
        const chatData = chatSnapshot.val();
        
        if (!chatData || !chatData.participants) {
             return res.status(404).send('Chat not found.');
        }

        const memberIds = chatData.participants;
        const tokens: string[] = [];
        
        for (const userId of memberIds) {
            if (userId !== senderId) { // 메시지를 보낸 사람 제외
                const tokenSnapshot = await db.ref(`users/${userId}/fcmToken`).once('value');
                const token = tokenSnapshot.val();
                if (token) {
                    tokens.push(token);
                }
            }
        }

        if (tokens.length === 0) {
            return res.status(200).send('No recipients found.');
        }

        // 2. 알림 페이로드 구성
        const message = {
            notification: {
                title: `${senderName}님의 메시지`, 
                body: text,
            },
            data: {
                chatId: chatId,
            },
            tokens: tokens
        };

        // 3. FCM 알림 발송
        // sendToDevice is deprecated, using sendEachForMulticast
        await admin.messaging().sendEachForMulticast(message);

        res.status(200).send('Notifications sent successfully.');

    } catch (error) {
        console.error('Notification error:', error);
        res.status(500).send('Notification sending failed.');
    }
};