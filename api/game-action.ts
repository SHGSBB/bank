import { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from './db.js';

const setCors = (res: VercelResponse) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

const toSafeId = (id: string) => (id || '').trim().toLowerCase().replace(/[@.]/g, '_');

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
        // [1] 초기 데이터 조회
        if (action === 'fetch_initial_data') {
            const snapshot = await db.ref('/').once('value');
            return res.status(200).json(snapshot.val() || {});
        }

        // [2] 이메일 조회 (로그인 시 사용)
        if (action === 'get_user_email') {
            const { id } = payload || {};
            const usersRef = db.ref('users');
            const searchId = (id || "").trim().toLowerCase();
            
            const allSnap = await usersRef.once('value');
            const users = allSnap.val() || {};
            const found = Object.values(users).find((u: any) => 
                (u.id || "").toLowerCase() === searchId || 
                (u.name || "").toLowerCase() === searchId ||
                (u.email || "").toLowerCase() === searchId
            ) as any;

            if (found && found.email) {
                return res.status(200).json({ email: found.email });
            }
            return res.status(404).json({ error: "USER_NOT_FOUND" });
        }

        // [3] 계정 연동
        if (action === 'link_account') {
            const { myEmail, targetId, targetPw } = payload;
            const mySafeId = toSafeId(myEmail);
            
            const usersRef = db.ref('users');
            const allSnap = await usersRef.once('value');
            const users = allSnap.val() || {};
            
            const searchTarget = (targetId || "").trim().toLowerCase();
            const targetEntry = Object.entries(users).find(([k, u]: [string, any]) => 
                (u.id || "").toLowerCase() === searchTarget || 
                (u.email || "").toLowerCase() === searchTarget ||
                (u.name || "").toLowerCase() === searchTarget
            );

            if (!targetEntry) return res.status(404).json({ error: "TARGET_NOT_FOUND" });
            const [targetSafeId, targetUser]: [string, any] = targetEntry;

            if (targetSafeId === mySafeId) return res.status(400).json({ error: "CANNOT_LINK_SELF" });
            if (targetUser.password !== targetPw) return res.status(401).json({ error: "INVALID_CREDENTIALS" });

            const myUser = users[mySafeId];
            if (!myUser) return res.status(404).json({ error: "SENDER_NOT_FOUND" });

            const myLinks = Array.isArray(myUser.linkedAccounts) ? myUser.linkedAccounts : [];
            const targetLinks = Array.isArray(targetUser.linkedAccounts) ? targetUser.linkedAccounts : [];

            if (myLinks.includes(targetUser.email)) return res.status(400).json({ error: "ALREADY_LINKED" });

            const updates: any = {};
            updates[`users/${mySafeId}/linkedAccounts`] = [...myLinks, targetUser.email];
            updates[`users/${targetSafeId}/linkedAccounts`] = [...targetLinks, myUser.email];

            await db.ref().update(updates);
            return res.status(200).json({ success: true });
        }

        // [4] 연동 해제
        if (action === 'unlink_account') {
            const { myEmail, targetName } = payload;
            const mySafeId = toSafeId(myEmail);
            
            const usersRef = db.ref('users');
            const allSnap = await usersRef.once('value');
            const users = allSnap.val() || {};
            
            const myUser = users[mySafeId];
            const searchName = (targetName || "").trim().toLowerCase();
            const targetEntry = Object.entries(users).find(([k, u]: [string, any]) => 
                (u.name || "").toLowerCase() === searchName
            );
            
            if (!myUser || !targetEntry) return res.status(404).json({ error: "USER_NOT_FOUND" });
            
            const [targetSafeId, targetUser]: [string, any] = targetEntry;
            const updates: any = {};
            updates[`users/${mySafeId}/linkedAccounts`] = (myUser.linkedAccounts || []).filter((e: string) => e !== targetUser.email);
            updates[`users/${targetSafeId}/linkedAccounts`] = (targetUser.linkedAccounts || []).filter((e: string) => e !== myUser.email);

            await db.ref().update(updates);
            return res.status(200).json({ success: true });
        }

        // [5] 연동 계정 정보 일괄 조회
        if (action === 'fetch_linked_accounts') {
            const { linkedIds } = payload;
            if (!linkedIds || !Array.isArray(linkedIds) || linkedIds.length === 0) return res.status(200).json({ accounts: [] });

            const accounts = [];
            for (const email of linkedIds) {
                const snap = await db.ref(`users/${toSafeId(email)}`).once('value');
                if (snap.exists()) {
                    const data = snap.val();
                    accounts.push({
                        name: data.name,
                        email: data.email,
                        id: data.id,
                        profilePic: data.profilePic || null,
                        type: data.type,
                        customJob: data.customJob || ""
                    });
                }
            }
            return res.status(200).json({ accounts });
        }

        // [6] 금융 액션들
        const financialActions = ['transfer', 'exchange', 'purchase', 'mint_currency', 'collect_tax', 'weekly_pay', 'distribute_welfare'];
        if (financialActions.includes(action)) {
            if (action === 'mint_currency') {
                const { amount, currency } = payload;
                const bankRef = db.ref('users/한국은행'); 
                const snap = await bankRef.once('value');
                if (snap.exists()) {
                    const field = currency === 'KRW' ? 'balanceKRW' : 'balanceUSD';
                    const current = snap.val()[field] || 0;
                    await bankRef.update({ [field]: current + amount });
                    return res.status(200).json({ success: true });
                }
                return res.status(404).json({ error: "BANK_NOT_FOUND" });
            }
            return res.status(200).json({ success: true });
        }

        return res.status(400).json({ error: "INVALID_ACTION", received: action });
    } catch (e: any) {
        console.error("Server Action Error:", e);
        return res.status(500).json({ error: e.message });
    }
};