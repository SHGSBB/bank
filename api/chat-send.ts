import { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';
import { db } from './db.js';

export default async (req: VercelRequest, res: VercelResponse) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    const { chatId, message } = req.body;

    if (!chatId || !message) {
        return res.status(400).send('Missing chatId or message');
    }

    try {
        // 1. Write the message to the message store
        await db.ref(`chatMessages/${chatId}/${message.id}`).set(message);

        // 2. Update the chat room metadata (for preview in list)
        await db.ref(`chatRooms/${chatId}`).update({
            lastMessage: message.text,
            lastTimestamp: message.timestamp
        });

        // 3. Send Notifications (Integrated Logic)
        const roomSnap = await db.ref(`chatRooms/${chatId}`).once('value');
        const room = roomSnap.val();
        
        if (room && room.participants) {
            // Get sender name
            const senderNameSnap = await db.ref(`users/${message.sender}/name`).once('value');
            const senderName = senderNameSnap.val() || message.sender;
            
            const tokens: string[] = [];
            
            // Collect tokens of other participants
            for (const uid of room.participants) {
                if (uid !== message.sender) {
                    const tokenSnap = await db.ref(`users/${uid}/fcmToken`).once('value');
                    const token = tokenSnap.val();
                    if (token) tokens.push(token);
                }
            }

            // Send Multicast
            if (tokens.length > 0) {
                const fcmMessage = {
                    notification: {
                        title: room.type === 'group' ? `${senderName} (${room.groupName})` : senderName,
                        body: message.text
                    },
                    data: {
                        chatId: chatId
                    },
                    tokens: tokens
                };
                
                await admin.messaging().sendEachForMulticast(fcmMessage);
            }
        }

        res.status(200).json({ success: true });

    } catch (error) {
        console.error('Chat Send Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};