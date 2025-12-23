
import { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from './db.js';

const setCors = (res: VercelResponse) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

// Safe ID Generator
const toSafeId = (id: string) => 
    (id || '').trim().toLowerCase()
    .replace(/[@.+]/g, '_')
    .replace(/[#$\[\]]/g, '_');

// [CRITICAL] Helper to find the SINGLE source of truth key for a user
const findRealUserKey = async (identifier: string, allUsersCache?: any): Promise<string | null> => {
    if (!identifier) return null;
    const safeInput = toSafeId(identifier);
    
    let users = allUsersCache;
    if (!users) {
        const snap = await db.ref('users').once('value');
        users = snap.val() || {};
    }

    // 1. Direct Hit on Key (Prioritize Email-based safe key)
    if (users[safeInput]) return safeInput;

    // 2. Search by ID, Email, or Name
    const foundKey = Object.keys(users).find(key => {
        const u = users[key];
        if (!u) return false;
        
        // Match Email (Highest priority)
        if (u.email && (u.email === identifier || toSafeId(u.email) === safeInput)) return true;
        // Match ID
        if (u.id && (u.id === identifier || toSafeId(u.id) === safeInput)) return true;
        // Match Name (Fallback)
        if (u.name === identifier) return true;
        
        return false;
    });

    return foundKey || null;
};

export default async (req: VercelRequest, res: VercelResponse) => {
    setCors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    if (!db) return res.status(503).json({ error: 'DATABASE_UNAVAILABLE' });

    const { action, payload } = req.body || {};
    if (!action) return res.status(400).json({ error: "MISSING_ACTION" });

    try {
        const now = new Date().toISOString();
        
        // ---------------------------------------------------------
        // [1] DB REPAIR (Fix Structure)
        // ---------------------------------------------------------
        if (action === 'fix_database_structure') {
            const snapshot = await db.ref('users').once('value');
            const users = snapshot.val() || {};
            const updates: any = {};
            let fixedCount = 0;

            const grouped: Record<string, string[]> = {}; 

            Object.keys(users).forEach(key => {
                const u = users[key];
                // Determine the "True Email"
                const email = u.email || (key.includes('_') && key.includes('@') ? key.replace(/_/g, '.') : null); 
                
                if (email && email.includes('@')) {
                    const safeKey = toSafeId(email);
                    if (!grouped[safeKey]) grouped[safeKey] = [];
                    grouped[safeKey].push(key);
                }
            });

            for (const [targetKey, keys] of Object.entries(grouped)) {
                let mergedUser: any = { 
                    balanceKRW: 0, 
                    balanceUSD: 0, 
                    transactions: [],
                    notifications: [],
                    products: {}
                };

                // Prioritize keys that exactly match targetKey
                keys.sort((a, b) => (a === targetKey ? 1 : -1));

                for (const k of keys) {
                    const u = users[k];
                    if (u.email) mergedUser.email = u.email;
                    if (u.id) mergedUser.id = u.id;
                    if (u.name) mergedUser.name = u.name;
                    if (u.password) mergedUser.password = u.password;
                    if (u.pin) { mergedUser.pin = u.pin; mergedUser.pinLength = u.pinLength; }
                    if (u.type) mergedUser.type = u.type;
                    if (u.subType) mergedUser.subType = u.subType;
                    if (u.govtRole) mergedUser.govtRole = u.govtRole;
                    if (u.approvalStatus && u.approvalStatus !== 'pending') mergedUser.approvalStatus = u.approvalStatus;

                    mergedUser.balanceKRW = Math.max(mergedUser.balanceKRW, u.balanceKRW || 0);
                    mergedUser.balanceUSD = Math.max(mergedUser.balanceUSD, u.balanceUSD || 0);
                    
                    if (u.transactions) mergedUser.transactions = [...mergedUser.transactions, ...(Array.isArray(u.transactions) ? u.transactions : Object.values(u.transactions))];
                    if (u.notifications) mergedUser.notifications = { ...mergedUser.notifications, ...u.notifications };
                    if (u.products) mergedUser.products = { ...mergedUser.products, ...u.products };
                    
                    if (k !== targetKey) {
                        updates[`users/${k}`] = null;
                        fixedCount++;
                    }
                }
                updates[`users/${targetKey}`] = mergedUser;
            }

            if (Object.keys(updates).length > 0) await db.ref().update(updates);
            return res.status(200).json({ success: true, message: `DB 복구 완료: ${fixedCount}개 노드 통합됨` });
        }

        // ---------------------------------------------------------
        // [2] ADMIN: Approve User (Fix "Stuck in Pending")
        // ---------------------------------------------------------
        if (action === 'approve_user') {
            const { userId, approve } = payload;
            const targetKey = await findRealUserKey(userId);
            
            if (!targetKey) return res.status(404).json({ error: "USER_NOT_FOUND" });

            if (approve) {
                await db.ref(`users/${targetKey}`).update({ approvalStatus: 'approved' });
                // Notification
                const notifId = `n_${Date.now()}`;
                await db.ref(`users/${targetKey}/notifications/${notifId}`).set({
                    id: notifId,
                    message: "회원가입이 승인되었습니다. 서비스를 이용해보세요!",
                    read: false,
                    date: now,
                    type: 'success',
                    timestamp: Date.now()
                });
            } else {
                await db.ref(`users/${targetKey}`).remove();
            }
            return res.status(200).json({ success: true });
        }

        // ---------------------------------------------------------
        // [3] FINANCE: Minting (Fix "Not working")
        // ---------------------------------------------------------
        if (action === 'mint_currency') {
            const amount = Number(payload.amount || 0);
            const currency = payload.currency || 'KRW';
            const field = currency === 'KRW' ? 'balanceKRW' : 'balanceUSD';
            
            // Try to find the admin user requesting this, OR default to '한국은행' role
            const allUsersSnap = await db.ref('users').once('value');
            const users = allUsersSnap.val() || {};
            
            // 1. Try finding by payload userId (e.g., admin's email)
            let targetKey = await findRealUserKey(payload.userId, users);
            
            // 2. If not found, fallback to finding the "BOK Governor"
            if (!targetKey) {
                targetKey = Object.keys(users).find(k => 
                    users[k].govtRole === '한국은행장' || 
                    users[k].name === '한국은행' ||
                    users[k].type === 'root'
                ) || null;
            }

            if (!targetKey) return res.status(404).json({ error: "Admin/Bank account not found." });

            // Atomic update
            await db.ref(`users/${targetKey}/${field}`).transaction((curr) => (curr || 0) + amount);
            
            // Transaction Record
            const txRef = db.ref(`users/${targetKey}/transactions`);
            const snap = await txRef.limitToLast(1).once('value'); // Check if empty
            const txs = snap.val(); 
            // If array structure is messy, we just push a new one or set keyed object
            // Using indexed keys is safer: tx_TIMESTAMP
            const txId = `tx_${Date.now()}`;
            await db.ref(`users/${targetKey}/transactions/${txId}`).set({ 
                id: Date.now(), type: 'income', amount: amount, currency, description: '화폐 발권 (Minting)', date: now 
            });

            return res.status(200).json({ success: true });
        }

        // ---------------------------------------------------------
        // [4] Transfer (Fix "Separation")
        // ---------------------------------------------------------
        if (action === 'transfer') {
            const { senderId, receiverId, amount, senderMemo, receiverMemo, currency = 'KRW' } = payload;
            const numAmount = Number(amount);
            
            const allUsersSnap = await db.ref('users').once('value');
            const allUsers = allUsersSnap.val();

            const sKey = await findRealUserKey(senderId, allUsers);
            const rKey = await findRealUserKey(receiverId, allUsers);
            
            if (!sKey || !rKey) return res.status(404).json({ error: "사용자를 찾을 수 없습니다." });
            if (sKey === rKey) return res.status(400).json({ error: "자신에게 이체할 수 없습니다." });
            
            const sVal = allUsers[sKey];
            const rVal = allUsers[rKey];
            const balField = currency === 'USD' ? 'balanceUSD' : 'balanceKRW';

            if ((Number(sVal[balField]) || 0) < numAmount) return res.status(400).json({ error: "잔액 부족" });

            const updates: any = {};
            updates[`users/${sKey}/${balField}`] = Number(sVal[balField] || 0) - numAmount;
            updates[`users/${rKey}/${balField}`] = Number(rVal[balField] || 0) + numAmount;
            
            const txId = Date.now();
            
            // Instead of overwriting array, use object keys for transactions to prevent index conflicts
            updates[`users/${sKey}/transactions/tx_${txId}_s`] = { 
                id: txId, type: 'transfer', amount: -numAmount, currency, description: senderMemo || `이체 (${rVal.name})`, date: now 
            };
            updates[`users/${rKey}/transactions/tx_${txId}_r`] = { 
                id: txId+1, type: 'transfer', amount: numAmount, currency, description: receiverMemo || `입금 (${sVal.name})`, date: now 
            };
            
            updates[`users/${rKey}/notifications/n_${txId}`] = {
                id: `n_${txId}`,
                message: `${sVal.name}님으로부터 ₩${numAmount.toLocaleString()} 입금되었습니다.`,
                read: false, date: now, type: 'success', timestamp: Date.now()
            };

            await db.ref().update(updates);
            return res.status(200).json({ success: true });
        }

        // ---------------------------------------------------------
        // [5] Purchase (Fix missing purchase logic)
        // ---------------------------------------------------------
        if (action === 'purchase') {
            const { buyerId, items } = payload;
            const allUsersSnap = await db.ref('users').once('value');
            const allUsers = allUsersSnap.val();

            const buyerKey = await findRealUserKey(buyerId, allUsers);
            if (!buyerKey) return res.status(404).json({ error: "Buyer not found" });

            let totalCost = 0;
            const updates: any = {};
            const txIdBase = Date.now();

            for (const [idx, item] of items.entries()) {
                const cost = item.price * item.quantity;
                totalCost += cost;
                
                // Find Seller
                const sellerKey = await findRealUserKey(item.sellerName, allUsers);
                if (sellerKey) {
                    const sellerBal = allUsers[sellerKey].balanceKRW || 0;
                    updates[`users/${sellerKey}/balanceKRW`] = sellerBal + cost;
                    updates[`users/${sellerKey}/transactions/tx_${txIdBase}_${idx}_s`] = {
                        id: txIdBase + idx,
                        type: 'income',
                        amount: cost,
                        currency: 'KRW',
                        description: `판매: ${item.name} (${item.quantity}개)`,
                        date: now
                    };
                }
            }

            const buyerBal = allUsers[buyerKey].balanceKRW || 0;
            if (buyerBal < totalCost) return res.status(400).json({ error: "Insufficient funds" });

            updates[`users/${buyerKey}/balanceKRW`] = buyerBal - totalCost;
            updates[`users/${buyerKey}/transactions/tx_${txIdBase}_b`] = {
                id: txIdBase,
                type: 'expense',
                amount: -totalCost,
                currency: 'KRW',
                description: `구매: ${items.length}건 (총 ₩${totalCost.toLocaleString()})`,
                date: now
            };

            await db.ref().update(updates);
            return res.status(200).json({ success: true });
        }

        // Fetch Logic (Lightweight)
        if (action === 'fetch_all_users_light') {
            const snapshot = await db.ref('users').once('value');
            const users = snapshot.val() || {};
            const lightweightUsers: Record<string, any> = {};
            Object.keys(users).forEach(key => {
                const u = users[key];
                if (!u.email && !u.id && !u.name) return; // Skip ghosts
                lightweightUsers[key] = {
                    name: u.name,
                    id: u.id,
                    email: u.email,
                    type: u.type,
                    subType: u.subType,
                    balanceKRW: u.balanceKRW || 0,
                    balanceUSD: u.balanceUSD || 0,
                    loans: u.loans || {}, 
                    approvalStatus: u.approvalStatus,
                    govtRole: u.govtRole,
                    customJob: u.customJob,
                    products: u.products,
                    isSuspended: u.isSuspended,
                    linkedAccounts: u.linkedAccounts
                };
            });
            return res.status(200).json({ users: lightweightUsers });
        }

        return res.status(200).json({ success: true });

    } catch (e: any) {
        console.error("API Error:", e);
        return res.status(500).json({ error: e.message });
    }
};
