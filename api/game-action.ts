
import { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcryptjs';
import { db, adminAuth } from './db.js';

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

        // [핵심 기능] 아이디로 이메일 찾기 + 좀비 계정 자동 청소 (Index-less & Auth-Sync)
        if (action === 'get_user_email') {
            const { id } = payload || {};
            if (!id) return res.status(400).json({ error: "ID_REQUIRED" });
            
            const usersRef = db.ref('users');
            let foundUser = null;
            let foundKey = null;

            // 1. DB에서 유저 찾기 (ID/Name/Email 통합 검색)
            const searchId = id.trim().toLowerCase();
            
            // (1) Key로 먼저 시도 (성화 은행은 이름을 Key로 사용함)
            const safeId = toSafeId(id.trim());
            const keySnap = await usersRef.child(safeId).once('value');
            if (keySnap.exists()) {
                foundUser = keySnap.val();
                foundKey = safeId;
            } else {
                // (2) 필드로 시도 (전체 검색 fallback)
                const allSnap = await usersRef.once('value');
                if (allSnap.exists()) {
                    const users = allSnap.val();
                    const entry = Object.entries(users).find(([k, u]: [string, any]) => 
                        (u.id || "").toLowerCase() === searchId || 
                        (u.name || "").toLowerCase() === searchId ||
                        (u.email || "").toLowerCase() === searchId
                    );
                    if (entry) {
                        foundKey = entry[0];
                        foundUser = entry[1];
                    }
                }
            }

            // 2. [좀비 클리너] DB엔 기록이 있는데 Firebase Auth에 실제 계정이 있는지 교차 검증
            if (foundUser && foundUser.email && adminAuth) {
                try {
                    // Firebase Auth 서버에 해당 이메일 사용자가 있는지 조회
                    await adminAuth.getUserByEmail(foundUser.email);
                    
                    // Auth에 존재하면 정상적으로 이메일 반환
                    return res.status(200).json({ email: foundUser.email });

                } catch (e: any) {
                    // 🚨 Auth에 없는 유저인 경우 (계정 삭제 후 DB 잔재 등)
                    if (e.code === 'auth/user-not-found') {
                        console.log(`[Zombie Cleaner] DB 잔재 삭제: ${foundKey} (${foundUser.email})`);
                        
                        // DB에서 즉시 삭제하여 정합성 유지
                        await usersRef.child(foundKey!).remove();
                        
                        // 클라이언트에는 청소됨을 알림
                        return res.status(404).json({ error: "USER_NOT_FOUND_CLEANED" });
                    }
                    // 기타 Auth 서버 오류 발생 시
                    throw e;
                }
            }
            
            return res.status(404).json({ error: "USER_NOT_FOUND" });
        }

        if (action === 'login') {
            const { userId, password } = payload || {};
            if (!userId) return res.status(400).json({ error: "MISSING_USER_ID" });

            let user = null; let userKey = '';
            const inputTrimmed = userId.trim();
            const safeId = toSafeId(inputTrimmed);
            const keySnap = await db.ref(`users/${safeId}`).once('value');
            
            if (keySnap.exists()) {
                userKey = safeId;
                user = keySnap.val();
            } else {
                const allSnap = await db.ref('users').once('value');
                const users = allSnap.val() || {};
                const searchId = inputTrimmed.toLowerCase();
                const foundEntry = Object.entries(users).find(([k, u]: [string, any]) => 
                    (u.id || "").toLowerCase() === searchId || 
                    (u.email || "").toLowerCase() === searchId ||
                    (u.name || "").toLowerCase() === searchId
                );
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
