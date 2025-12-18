
import { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcryptjs';
import { db } from './db.js';

const setCors = (res: VercelResponse) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

const toSafeId = (id: string) => id.replace(/\./g, '_');

export default async (req: VercelRequest, res: VercelResponse) => {
    setCors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    if (!db) return res.status(503).json({ error: 'DATABASE_UNAVAILABLE' });

    const { action, payload } = req.body || {};

    if (!action) {
        return res.status(400).json({ error: "MISSING_ACTION" });
    }

    try {
        if (action === 'fetch_initial_data') {
            const snapshot = await db.ref('/').once('value');
            return res.status(200).json(snapshot.val() || {});
        }

        // [핵심] 로그인용 실제 이메일 주소 검색 (Index-less version)
        if (action === 'get_user_email') {
            const { id } = payload || {};
            if (!id) return res.status(400).json({ error: "ID_REQUIRED" });
            
            const usersRef = db.ref('users');
            
            // 1. Try safe ID lookup first (O(1))
            const safeId = toSafeId(id);
            const nameSnap = await usersRef.child(safeId).once('value');
            if (nameSnap.exists()) {
                const user = nameSnap.val();
                if (user.email) return res.status(200).json({ email: user.email });
            }

            // 2. Fetch all and filter (to bypass missing index on 'id' or 'email' field)
            const allUsersSnap = await usersRef.once('value');
            if (allUsersSnap.exists()) {
                const users = allUsersSnap.val();
                const found = Object.values(users).find((u: any) => 
                    u.id === id || u.name === id || u.email === id
                ) as any;
                
                if (found && found.email) {
                    return res.status(200).json({ email: found.email });
                }
            }
            
            return res.status(404).json({ error: "USER_NOT_FOUND" });
        }

        if (action === 'login') {
            const { userId, password } = payload || {};
            if (!userId) return res.status(400).json({ error: "MISSING_USER_ID" });

            let user = null; let userKey = '';
            // 우선 Key로 시도 (변환된 버전 포함)
            const safeId = toSafeId(userId);
            const keySnap = await db.ref(`users/${safeId}`).once('value');
            if (keySnap.exists()) {
                userKey = safeId;
                user = keySnap.val();
            } else {
                // 필드로 시도 (Index-less fallback)
                const allSnap = await db.ref('users').once('value');
                const users = allSnap.val() || {};
                const foundEntry = Object.entries(users).find(([k, u]: [string, any]) => u.id === userId);
                if (foundEntry) {
                    userKey = foundEntry[0];
                    user = foundEntry[1];
                }
            }
            
            if (!user) return res.status(400).json({ error: "USER_NOT_FOUND" });

            let match = false;
            if (user.password) {
                match = user.password.startsWith('$2') ? await bcrypt.compare(password, user.password) : (user.password === password);
            }
            
            if (!match) return res.status(401).json({ error: "INVALID_PASSWORD" });
            
            const sanitized = { ...user, name: userKey, password: "" };
            return res.status(200).json({ success: true, user: sanitized });
        }

        // --- 금융/기능 액션 ---
        if (action === 'transfer') {
            const { senderId, receiverId, amount, senderMemo, receiverMemo } = payload || {};
            const senderSafeId = toSafeId(senderId);
            const receiverSafeId = toSafeId(receiverId);
            
            const senderSnap = await db.ref(`users/${senderSafeId}`).once('value');
            const receiverSnap = await db.ref(`users/${receiverSafeId}`).once('value');
            
            if (!senderSnap.exists() || !receiverSnap.exists()) return res.status(400).json({ error: "USER_NOT_FOUND" });
            
            const sender = senderSnap.val();
            const receiver = receiverSnap.val();
            if (sender.balanceKRW < amount) return res.status(400).json({ error: "INSUFFICIENT_FUNDS" });

            const updates: any = {};
            const txId = `tx_${Date.now()}`;
            const date = new Date().toISOString();

            updates[`users/${senderSafeId}/balanceKRW`] = sender.balanceKRW - amount;
            updates[`users/${receiverSafeId}/balanceKRW`] = (receiver.balanceKRW || 0) + amount;
            
            const senderTx = (sender.transactions || []).concat({ id: txId + '_s', type: 'transfer', amount: -amount, currency: 'KRW', description: senderMemo || `이체 (${receiverId})`, date }).slice(-50);
            const receiverTx = (receiver.transactions || []).concat({ id: txId + '_r', type: 'transfer', amount: amount, currency: 'KRW', description: receiverMemo || `수신 (${senderId})`, date }).slice(-50);
            
            updates[`users/${senderSafeId}/transactions`] = senderTx;
            updates[`users/${receiverSafeId}/transactions`] = receiverTx;
            updates[`users/${receiverSafeId}/notifications/n_${txId}`] = { id: `n_${txId}`, message: `₩${amount.toLocaleString()} 입금됨 (${senderId})`, read: false, date, timestamp: Date.now() };

            await db.ref().update(updates);
            return res.status(200).json({ success: true });
        }

        return res.status(400).json({ error: "INVALID_ACTION" });
    } catch (e: any) {
        console.error("Game Action Error:", e);
        return res.status(500).json({ error: e.message });
    }
};
