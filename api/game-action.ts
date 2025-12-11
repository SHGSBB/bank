import { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';
import { db } from './db'; // Shared admin db instance

export default async (req: VercelRequest, res: VercelResponse) => {
    // Allow CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    const { action, payload } = req.body;

    try {
        if (action === 'transfer') {
            // Payload: { senderId: string, receiverId: string, amount: number, senderMemo: string, receiverMemo: string }
            const { senderId, receiverId, amount, senderMemo, receiverMemo } = payload;
            
            // Transactional Update
            await db.ref('users').transaction((users) => {
                if (!users || !users[senderId] || !users[receiverId]) return users; // Abort if users missing
                
                const sender = users[senderId];
                const receiver = users[receiverId];

                if (sender.balanceKRW < amount) return; // Abort if insufficient funds (client should catch, but double check)

                sender.balanceKRW -= amount;
                receiver.balanceKRW += amount;

                // Log Transactions
                const date = new Date().toISOString();
                const now = Date.now();
                
                if (!sender.transactions) sender.transactions = [];
                sender.transactions.push({
                    id: now, type: 'expense', amount: -amount, currency: 'KRW', description: senderMemo, date
                });

                if (!receiver.transactions) receiver.transactions = [];
                receiver.transactions.push({
                    id: now + 1, type: 'income', amount: amount, currency: 'KRW', description: receiverMemo, date
                });

                return users;
            });

            // Trigger Notification via FCM (Simplified - calling the notification logic directly or triggering separate function)
            // Ideally, we'd use the same logic as send-notification here. For now, rely on client triggering notification
            // or implement basic FCM send here.
            
            // Fetch receiver token
            const receiverTokenSnap = await db.ref(`users/${receiverId}/fcmToken`).once('value');
            const token = receiverTokenSnap.val();
            if (token) {
                await admin.messaging().send({
                    token,
                    notification: {
                        title: '입금 알림',
                        body: `${senderId}님으로부터 ₩${amount.toLocaleString()}을 받았습니다.`
                    }
                });
            }

            return res.status(200).json({ success: true });
        }

        if (action === 'weekly_pay') {
            // Payload: { amount: number, userIds: string[] }
            const { amount, userIds } = payload;
            const bankId = '한국은행';

            await db.ref('users').transaction((users) => {
                if (!users || !users[bankId]) return users;
                const bank = users[bankId];

                userIds.forEach((uid: string) => {
                    if (users[uid]) {
                        users[uid].balanceKRW += amount;
                        bank.balanceKRW -= amount;
                        
                        const date = new Date().toISOString();
                        const now = Date.now() + Math.random();

                        if (!users[uid].transactions) users[uid].transactions = [];
                        users[uid].transactions.push({
                            id: now, type: 'income', amount: amount, currency: 'KRW', description: '주급 수령', date
                        });
                        
                        // Add notification to user object directly to avoid separate API calls
                        if (!users[uid].notifications) users[uid].notifications = [];
                        users[uid].notifications.unshift({
                            id: now.toString(), message: `주급 ₩${amount.toLocaleString()}가 지급되었습니다.`, read: false, isPersistent: false, date
                        });
                    }
                });
                return users;
            });

            // Send Mass FCM (Topic or Batch) - Here we assume topic 'citizens' exists or just return success
            // In a real app, send multicast.
            return res.status(200).json({ success: true });
        }

        if (action === 'collect_tax') {
            // Payload: { taxSessionId: string, taxes: { userId: string, amount: number, breakdown: string }[] }
            const { taxSessionId, taxes, dueDate } = payload;
            
            const updates: any = {};
            
            // Prepare updates for each user
            taxes.forEach((tax: any) => {
                const taxId = `t_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                const pendingTax = {
                    id: taxId,
                    sessionId: taxSessionId,
                    amount: tax.amount,
                    type: tax.type,
                    dueDate: dueDate,
                    status: 'pending',
                    breakdown: tax.breakdown
                };
                
                // We use update path to avoid downloading all users
                // RTDB update key: users/{userId}/pendingTaxes/{index} 
                // Since array manipulation is hard with 'update', we might need to transaction specific users 
                // OR just push to a list. 
                // For simplicity/bandwidth, we will assume we can push to `users/{uid}/pendingTaxes`
                const userRef = db.ref(`users/${tax.userId}/pendingTaxes`);
                const newRef = userRef.push();
                updates[`users/${tax.userId}/pendingTaxes/${newRef.key}`] = pendingTax;
                
                // Add Notification
                const notifRef = db.ref(`users/${tax.userId}/notifications`).push();
                updates[`users/${tax.userId}/notifications/${notifRef.key}`] = {
                    id: notifRef.key,
                    message: `[세금 고지] ${tax.type} ₩${tax.amount.toLocaleString()}가 부과되었습니다.`,
                    read: false, 
                    isPersistent: true,
                    date: new Date().toISOString(),
                    action: 'tax_pay',
                    actionData: pendingTax
                };
            });

            await db.ref().update(updates);
            return res.status(200).json({ success: true });
        }

        return res.status(400).send('Unknown action');

    } catch (error) {
        console.error("Game Action Error:", error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};