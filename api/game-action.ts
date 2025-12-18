
import { VercelRequest, VercelResponse } from '@vercel/node';
import bcrypt from 'bcryptjs';
import { db } from './db.js';

const setCors = (res: VercelResponse) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

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
        // --- 1. Initial Data Fetch ---
        if (action === 'fetch_initial_data') {
            const snapshot = await db.ref('/').once('value');
            return res.status(200).json(snapshot.val() || {});
        }

        // --- 2. Auth Actions ---
        if (action === 'login') {
            const { userId, password } = payload || {};
            if (!userId) return res.status(400).json({ error: "MISSING_USER_ID" });

            let user = null; let userKey = '';
            
            const directSnap = await db.ref(`users/${userId}`).once('value');
            if (directSnap.exists()) { user = directSnap.val(); userKey = userId; }
            else {
                const querySnap = await db.ref('users').orderByChild('id').equalTo(userId).limitToFirst(1).once('value');
                if (querySnap.exists()) { userKey = Object.keys(querySnap.val())[0]; user = querySnap.val()[userKey]; }
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

        // --- 3. Account Linking Actions ---
        if (action === 'fetch_linked_accounts') {
            const { linkedIds } = payload || {};
            if (!linkedIds || !Array.isArray(linkedIds)) return res.status(200).json({ accounts: [] });

            const accounts = [];
            for (const uid of linkedIds) {
                const snap = await db.ref(`users/${uid}`).once('value');
                if (snap.exists()) {
                    const u = snap.val();
                    accounts.push({
                        name: uid,
                        id: u.id,
                        profilePic: u.profilePic,
                        type: u.type,
                        customJob: u.customJob,
                        nickname: u.nickname
                    });
                }
            }
            return res.status(200).json({ accounts });
        }

        if (action === 'link_account') {
            const { myName, targetId, targetPw } = payload || {};
            let targetUser = null; let targetKey = '';
            const querySnap = await db.ref('users').orderByChild('id').equalTo(targetId).limitToFirst(1).once('value');
            if (!querySnap.exists()) return res.status(400).json({ error: "TARGET_NOT_FOUND" });
            targetKey = Object.keys(querySnap.val())[0];
            targetUser = querySnap.val()[targetKey];
            if (targetKey === myName) return res.status(400).json({ error: "CANNOT_LINK_SELF" });
            const match = targetUser.password.startsWith('$2') ? await bcrypt.compare(targetPw, targetUser.password) : (targetUser.password === targetPw);
            if (!match) return res.status(401).json({ error: "TARGET_PASSWORD_MISMATCH" });
            const mySnap = await db.ref(`users/${myName}`).once('value');
            const myUser = mySnap.val();
            const myLinked = myUser.linkedAccounts || [];
            const targetLinked = targetUser.linkedAccounts || [];
            if (myLinked.includes(targetKey)) return res.status(400).json({ error: "ALREADY_LINKED" });
            const updates: any = {};
            updates[`users/${myName}/linkedAccounts`] = Array.from(new Set([...myLinked, targetKey]));
            updates[`users/${targetKey}/linkedAccounts`] = Array.from(new Set([...targetLinked, myName]));
            await db.ref().update(updates);
            return res.status(200).json({ success: true });
        }

        if (action === 'unlink_account') {
            const { myName, targetName } = payload || {};
            const myLinkedSnap = await db.ref(`users/${myName}/linkedAccounts`).once('value');
            const targetLinkedSnap = await db.ref(`users/${targetName}/linkedAccounts`).once('value');
            const myLinked = (myLinkedSnap.val() || []).filter((id: string) => id !== targetName);
            const targetLinked = (targetLinkedSnap.val() || []).filter((id: string) => id !== myName);
            const updates: any = {};
            updates[`users/${myName}/linkedAccounts`] = myLinked;
            updates[`users/${targetName}/linkedAccounts`] = targetLinked;
            await db.ref().update(updates);
            return res.status(200).json({ success: true });
        }

        // --- 4. Financial Actions ---
        if (action === 'transfer') {
            const { senderId, receiverId, amount, senderMemo, receiverMemo } = payload || {};
            const date = new Date().toISOString();
            const updates: any = {};
            
            const senderSnap = await db.ref(`users/${senderId}`).once('value');
            const receiverSnap = await db.ref(`users/${receiverId}`).once('value');
            const sender = senderSnap.val();
            const receiver = receiverSnap.val();

            if (!sender || !receiver) return res.status(400).json({ error: "USER_NOT_FOUND" });
            if (sender.balanceKRW < amount) return res.status(400).json({ error: "INSUFFICIENT_FUNDS" });

            const txId = `tx_${Date.now()}`;
            updates[`users/${senderId}/balanceKRW`] = (sender.balanceKRW || 0) - amount;
            updates[`users/${receiverId}/balanceKRW`] = (receiver.balanceKRW || 0) + amount;

            const sTx = { id: txId + '_s', type: 'transfer', amount: -amount, currency: 'KRW', description: senderMemo || `이체 (${receiverId})`, date };
            const rTx = { id: txId + '_r', type: 'transfer', amount: amount, currency: 'KRW', description: receiverMemo || `수신 (${senderId})`, date };
            
            const sTxs = (sender.transactions || []).concat(sTx).slice(-50);
            const rTxs = (receiver.transactions || []).concat(rTx).slice(-50);
            
            updates[`users/${senderId}/transactions`] = sTxs;
            updates[`users/${receiverId}/transactions`] = rTxs;

            const notif = { id: `n_${txId}`, message: `₩${amount.toLocaleString()} 입금 완료 (${senderId})`, read: false, date, timestamp: Date.now() };
            updates[`users/${receiverId}/notifications/${notif.id}`] = notif;

            await db.ref().update(updates);
            return res.status(200).json({ success: true });
        }

        if (action === 'exchange') {
            const { userId, fromCurrency, toCurrency, amount } = payload || {};
            const snap = await db.ref(`users/${userId}`).once('value');
            const user = snap.val();
            const rateSnap = await db.ref('settings/exchangeRate/KRW_USD').once('value');
            const rate = rateSnap.val() || 1350;

            if (!user) return res.status(400).json({ error: "USER_NOT_FOUND" });
            const fromKey = fromCurrency === 'KRW' ? 'balanceKRW' : 'balanceUSD';
            const toKey = toCurrency === 'KRW' ? 'balanceKRW' : 'balanceUSD';

            if (user[fromKey] < amount) return res.status(400).json({ error: "INSUFFICIENT_FUNDS" });

            let outAmount = 0;
            if (fromCurrency === 'KRW' && toCurrency === 'USD') outAmount = amount / rate;
            else if (fromCurrency === 'USD' && toCurrency === 'KRW') outAmount = amount * rate;

            const updates: any = {};
            updates[`users/${userId}/${fromKey}`] = user[fromKey] - amount;
            updates[`users/${userId}/${toKey}`] = (user[toKey] || 0) + outAmount;

            const tx = { id: `ex_${Date.now()}`, type: 'exchange', amount: -amount, currency: fromCurrency, description: `${fromCurrency} -> ${toCurrency} 환전`, date: new Date().toISOString() };
            updates[`users/${userId}/transactions`] = (user.transactions || []).concat(tx).slice(-50);

            await db.ref().update(updates);
            return res.status(200).json({ success: true });
        }

        if (action === 'purchase') {
            const { buyerId, items } = payload || {};
            const buyerSnap = await db.ref(`users/${buyerId}`).once('value');
            const buyer = buyerSnap.val();
            if (!buyer) return res.status(400).json({ error: "USER_NOT_FOUND" });

            const updates: any = {};
            let totalCost = 0;
            const date = new Date().toISOString();

            for (const item of items) {
                const sellerSnap = await db.ref(`users/${item.sellerName}`).once('value');
                const seller = sellerSnap.val();
                if (!seller) continue;

                const cost = item.price * item.quantity;
                totalCost += cost;

                updates[`users/${item.sellerName}/balanceKRW`] = (seller.balanceKRW || 0) + cost;
                const sTx = { id: `sell_${Date.now()}_${item.id}`, type: 'income', amount: cost, currency: 'KRW', description: `판매: ${item.name} x${item.quantity}`, date };
                updates[`users/${item.sellerName}/transactions`] = (seller.transactions || []).concat(sTx).slice(-50);
            }

            if (buyer.balanceKRW < totalCost) return res.status(400).json({ error: "INSUFFICIENT_FUNDS" });

            updates[`users/${buyerId}/balanceKRW`] = buyer.balanceKRW - totalCost;
            const bTx = { id: `buy_${Date.now()}`, type: 'expense', amount: -totalCost, currency: 'KRW', description: `물품 구매 (${items.length}종)`, date };
            updates[`users/${buyerId}/transactions`] = (buyer.transactions || []).concat(bTx).slice(-50);

            await db.ref().update(updates);
            return res.status(200).json({ success: true });
        }

        if (action === 'pay_rent') {
            const { userId, ownerId, amount, propertyId } = payload || {};
            const updates: any = {};
            const userSnap = await db.ref(`users/${userId}`).once('value');
            const ownerSnap = await db.ref(`users/${ownerId}`).once('value');
            const user = userSnap.val();
            const owner = ownerSnap.val();

            if (!user || !owner) return res.status(400).json({ error: "USER_NOT_FOUND" });
            if (user.balanceKRW < amount) return res.status(400).json({ error: "INSUFFICIENT_FUNDS" });

            updates[`users/${userId}/balanceKRW`] = user.balanceKRW - amount;
            updates[`users/${ownerId}/balanceKRW`] = (owner.balanceKRW || 0) + amount;
            updates[`users/${userId}/pendingRent`] = null;

            const txId = `rent_${Date.now()}`;
            const date = new Date().toISOString();
            const uTx = { id: txId + '_u', type: 'expense', amount: -amount, currency: 'KRW', description: `임대료 납부 (집 #${propertyId})`, date };
            const oTx = { id: txId + '_o', type: 'income', amount: amount, currency: 'KRW', description: `임대료 수입 (집 #${propertyId}, ${userId})`, date };

            updates[`users/${userId}/transactions`] = (user.transactions || []).concat(uTx).slice(-50);
            updates[`users/${ownerId}/transactions`] = (owner.transactions || []).concat(oTx).slice(-50);

            await db.ref().update(updates);
            return res.status(200).json({ success: true });
        }

        // --- 5. Admin & Policy Actions ---
        if (action === 'weekly_pay') {
            const { amount, userIds } = payload || {};
            const bankId = '한국은행';
            const date = new Date().toISOString();
            const bankSnap = await db.ref(`users/${bankId}`).once('value');
            const bank = bankSnap.val();
            const total = amount * userIds.length;
            if (!bank || bank.balanceKRW < total) return res.status(400).json({ error: "INSUFFICIENT_BANK_FUNDS" });
            const updates: any = {};
            updates[`users/${bankId}/balanceKRW`] = bank.balanceKRW - total;
            for (const uid of userIds) {
                const uSnap = await db.ref(`users/${uid}`).once('value');
                const u = uSnap.val();
                if (u) {
                    const txId = `tx_${Date.now()}_${Math.random().toString(36).substr(2,5)}`;
                    const tx = { id: txId, type: 'income', amount, currency: 'KRW', description: '주급 지급', date };
                    const notif = { id: `n_${txId}`, message: `주급 ₩${amount.toLocaleString()} 지급 완료`, read: false, date, timestamp: Date.now() };
                    updates[`users/${uid}/balanceKRW`] = (u.balanceKRW || 0) + amount;
                    updates[`users/${uid}/transactions`] = (u.transactions || []).concat(tx).slice(-50);
                    updates[`users/${uid}/notifications/${notif.id}`] = notif;
                }
            }
            await db.ref().update(updates);
            return res.status(200).json({ success: true });
        }

        if (action === 'collect_tax') {
            const { taxSessionId, taxes, dueDate } = payload || {};
            const updates: any = {};
            for (const t of taxes) {
                const uSnap = await db.ref(`users/${t.userId}`).once('value');
                const u = uSnap.val();
                if (u) {
                    const taxObj = { id: `tax_${Date.now()}_${t.userId}`, sessionId: taxSessionId, amount: t.amount, type: t.type, dueDate, status: 'pending', breakdown: t.breakdown };
                    updates[`users/${t.userId}/pendingTaxes`] = (u.pendingTaxes || []).concat(taxObj);
                    const notif = { id: `n_${taxObj.id}`, message: `세금 고지서 도착: ₩${t.amount.toLocaleString()} (${t.type})`, read: false, date: new Date().toISOString(), type: 'tax', timestamp: Date.now() };
                    updates[`users/${t.userId}/notifications/${notif.id}`] = notif;
                }
            }
            await db.ref().update(updates);
            return res.status(200).json({ success: true });
        }

        if (action === 'distribute_welfare') {
            const { targetUser, amount } = payload || {};
            const bankId = '한국은행';
            const bankSnap = await db.ref(`users/${bankId}`).once('value');
            const uSnap = await db.ref(`users/${targetUser}`).once('value');
            const bank = bankSnap.val();
            const user = uSnap.val();
            if (!bank || bank.balanceKRW < amount) return res.status(400).json({ error: "BANK_FUNDS_LACK" });
            const updates: any = {};
            updates[`users/${bankId}/balanceKRW`] = bank.balanceKRW - amount;
            updates[`users/${targetUser}/balanceKRW`] = (user.balanceKRW || 0) + amount;
            const tx = { id: `wel_${Date.now()}`, type: 'income', amount, currency: 'KRW', description: '복지 지원금 수령', date: new Date().toISOString() };
            updates[`users/${targetUser}/transactions`] = (user.transactions || []).concat(tx).slice(-50);
            await db.ref().update(updates);
            return res.status(200).json({ success: true });
        }

        if (action === 'mint_currency') {
            const { amount, currency } = payload || {};
            const bankId = '한국은행';
            const bankSnap = await db.ref(`users/${bankId}`).once('value');
            const bank = bankSnap.val();
            const updates: any = {};
            const key = currency === 'KRW' ? 'balanceKRW' : 'balanceUSD';
            updates[`users/${bankId}/${key}`] = (bank[key] || 0) + amount;
            const tx = { id: `mint_${Date.now()}`, type: 'income', amount, currency, description: `화폐 발행 (${currency})`, date: new Date().toISOString() };
            updates[`users/${bankId}/transactions`] = (bank.transactions || []).concat(tx).slice(-50);
            await db.ref().update(updates);
            return res.status(200).json({ success: true });
        }

        return res.status(400).json({ error: "INVALID_ACTION", received: action });
    } catch (e: any) {
        console.error("Server Action Error:", e);
        return res.status(500).json({ error: e.message });
    }
};
