
import { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from './db.js';

const setCors = (res: VercelResponse) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

// [핵심] 모든 ID를 안전한 형태로 바꿔주는 함수
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

        // [2] 이메일 찾기
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

        // [3] 계정 연동 정보 조회
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

        // [4] 계정 연동하기 (수정된 코드: 비번 검사 삭제 + 안전장치 추가)
        if (action === 'link_account') {
            const { myEmail, targetId } = payload;
            const mySafeId = toSafeId(myEmail);
            
            const usersRef = db.ref('users');
            const allSnap = await usersRef.once('value');
            const users = allSnap.val() || {};
            
            // 1. 상대방 찾기
            const searchTarget = (targetId || "").trim().toLowerCase();
            const targetEntry = Object.entries(users).find(([k, u]: [string, any]) => 
                (u.id || "").toLowerCase() === searchTarget || 
                (u.email || "").toLowerCase() === searchTarget
            );

            if (!targetEntry) return res.status(404).json({ error: "TARGET_NOT_FOUND" });
            const [targetSafeId, targetUser]: [string, any] = targetEntry;

            if (targetSafeId === mySafeId) return res.status(400).json({ error: "CANNOT_LINK_SELF" });
            
            // 2. 내 정보 찾기
            const myUser = users[mySafeId];
            if (!myUser) return res.status(404).json({ error: "SENDER_NOT_FOUND" });

            // 3. [중요] 500 에러 방지 (이메일이 없으면 ID라도 저장)
            const myEmailToSave = myUser.email || myUser.id || myEmail; 
            const targetEmailToSave = targetUser.email || targetUser.id || targetId;

            if (!myEmailToSave || !targetEmailToSave) {
                 return res.status(400).json({ error: "EMAIL_MISSING: 계정 정보를 찾을 수 없습니다." });
            }

            const myLinks = Array.isArray(myUser.linkedAccounts) ? myUser.linkedAccounts : [];
            const targetLinks = Array.isArray(targetUser.linkedAccounts) ? targetUser.linkedAccounts : [];

            if (myLinks.includes(targetEmailToSave)) return res.status(400).json({ error: "ALREADY_LINKED" });

            const updates: any = {};
            updates[`users/${mySafeId}/linkedAccounts`] = [...myLinks, targetEmailToSave];
            updates[`users/${targetSafeId}/linkedAccounts`] = [...targetLinks, myEmailToSave];

            await db.ref().update(updates);
            return res.status(200).json({ success: true });
        }

        // [5] 연동 해제
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
            
            const myLinks = (myUser.linkedAccounts || []).filter((e: string) => e !== targetUser.email);
            const targetLinks = (targetUser.linkedAccounts || []).filter((e: string) => e !== myUser.email);

            const updates: any = {};
            updates[`users/${mySafeId}/linkedAccounts`] = myLinks;
            updates[`users/${targetSafeId}/linkedAccounts`] = targetLinks;

            await db.ref().update(updates);
            return res.status(200).json({ success: true });
        }

        // [6] 금융/행정 액션
        const financialActions = ['transfer', 'exchange', 'purchase', 'mint_currency', 'collect_tax', 'weekly_pay', 'distribute_welfare', 'pay_rent'];
        if (financialActions.includes(action)) {
            
            // [6-1] 발권 (한국은행 계정 생성 보장)
            if (action === 'mint_currency') {
                const { amount, currency } = payload;
                const bankRef = db.ref('users/한국은행');
                let bankSnap = await bankRef.once('value');
                
                if (!bankSnap.exists()) {
                    await bankRef.set({ name: '한국은행', type: 'admin', balanceKRW: 0, balanceUSD: 0, email: 'bok@bank.sh' });
                    bankSnap = await bankRef.once('value');
                }

                const field = currency === 'KRW' ? 'balanceKRW' : 'balanceUSD';
                const current = bankSnap.val()[field] || 0;
                await bankRef.update({ [field]: current + amount });
                return res.status(200).json({ success: true, balance: current + amount });
            }

            // [6-2] 주급 및 복지 지급
            if (action === 'weekly_pay' || action === 'distribute_welfare') {
                const { amount, userIds, targetUser } = payload;
                const count = action === 'weekly_pay' ? (userIds?.length || 0) : 1;
                const total = amount * count;
                
                const bankRef = db.ref('users/한국은행');
                const bankSnap = await bankRef.once('value');
                if(!bankSnap.exists()) return res.status(400).json({error: "Bank account not found"});
                
                const bankBalance = bankSnap.val().balanceKRW || 0;
                if (bankBalance < total) return res.status(400).json({ error: "BANK_INSUFFICIENT_FUNDS" });

                await bankRef.update({ balanceKRW: bankBalance - total });
                
                if (action === 'weekly_pay' && userIds) {
                    for(const uid of userIds) {
                        await db.ref(`users/${toSafeId(uid)}/balanceKRW`).transaction(cur => (cur || 0) + amount);
                    }
                }

                if (action === 'distribute_welfare' && targetUser) {
                    await db.ref(`users/${toSafeId(targetUser)}/balanceKRW`).transaction(cur => (cur || 0) + amount);
                }

                return res.status(200).json({ success: true });
            }

            // [6-3] 세금 징수 (고지서 발급)
            if (action === 'collect_tax') {
                const { taxSessionId, taxes, dueDate } = payload;
                if (!taxes || !Array.isArray(taxes)) return res.status(400).json({ error: "Invalid tax data" });

                for (const tax of taxes) {
                    const userRef = db.ref(`users/${toSafeId(tax.userId)}`);
                    const userSnap = await userRef.once('value');
                    
                    if (userSnap.exists()) {
                        const newTaxItem = {
                            id: `tax_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                            sessionId: taxSessionId,
                            amount: tax.amount,
                            type: tax.type,
                            dueDate: dueDate,
                            status: 'pending',
                            breakdown: tax.breakdown
                        };
                        const existingTaxes = userSnap.val().pendingTaxes || [];
                        await userRef.update({ pendingTaxes: [...existingTaxes, newTaxItem] });
                    }
                }
                return res.status(200).json({ success: true });
            }

            // [6-4] 이체
            if (action === 'transfer') {
                const { senderId, receiverId, amount, senderMemo, receiverMemo } = payload; // senderId is NAME, receiverId is NAME based on current app logic, but we need Emails/IDs for Safety.
                // NOTE: The app currently passes NAMES in some places. We must find the correct User Key.
                
                // Helper to find key by name if it's not a safe ID
                const findKey = async (nameOrId: string) => {
                    const directRef = db.ref(`users/${toSafeId(nameOrId)}`);
                    const directSnap = await directRef.once('value');
                    if (directSnap.exists()) return toSafeId(nameOrId);

                    // Fallback: search by name
                    const allSnap = await db.ref('users').once('value');
                    const users = allSnap.val() || {};
                    const foundKey = Object.keys(users).find(key => users[key].name === nameOrId);
                    return foundKey || null;
                };

                const senderKey = await findKey(senderId);
                const receiverKey = await findKey(receiverId);

                if (!senderKey || !receiverKey) return res.status(404).json({ error: "USER_NOT_FOUND" });

                const senderRef = db.ref(`users/${senderKey}`);
                const receiverRef = db.ref(`users/${receiverKey}`);

                const senderSnap = await senderRef.once('value');
                const receiverSnap = await receiverRef.once('value');

                if (senderSnap.val().balanceKRW < amount) return res.status(400).json({ error: "INSUFFICIENT_FUNDS" });

                await senderRef.update({ balanceKRW: senderSnap.val().balanceKRW - amount });
                await receiverRef.update({ balanceKRW: receiverSnap.val().balanceKRW + amount });

                const now = new Date().toISOString();
                const txId = Date.now();

                // Log Transactions
                const sTx = senderSnap.val().transactions || [];
                const rTx = receiverSnap.val().transactions || [];

                sTx.push({ id: txId, type: 'transfer', amount: -amount, currency: 'KRW', description: senderMemo || `이체 (${receiverSnap.val().name})`, date: now });
                rTx.push({ id: txId+1, type: 'transfer', amount: amount, currency: 'KRW', description: receiverMemo || `입금 (${senderSnap.val().name})`, date: now });

                await senderRef.update({ transactions: sTx });
                await receiverRef.update({ transactions: rTx });

                return res.status(200).json({ success: true });
            }

            // [6-5] 환전
            if (action === 'exchange') {
                const { userId, fromCurrency, toCurrency, amount } = payload;
                const userKey = toSafeId(userId) // Assuming passed ID is name, need to check if safeId works or fallback to name search
                // Actually, let's look up properly like transfer
                const allSnap = await db.ref('users').once('value');
                const users = allSnap.val() || {};
                const foundKey = Object.keys(users).find(key => users[key].name === userId) || toSafeId(userId); // Try name match, then ID match

                const userRef = db.ref(`users/${foundKey}`);
                const userSnap = await userRef.once('value');
                if(!userSnap.exists()) return res.status(404).json({error: "User not found"});

                const user = userSnap.val();
                const settingsSnap = await db.ref('settings').once('value');
                const rate = settingsSnap.val()?.exchangeRate?.KRW_USD || 1350;

                let deductKey = fromCurrency === 'KRW' ? 'balanceKRW' : 'balanceUSD';
                let addKey = toCurrency === 'KRW' ? 'balanceKRW' : 'balanceUSD';
                let finalRate = (fromCurrency === 'KRW' && toCurrency === 'USD') ? (1/rate) : rate;
                
                if (user[deductKey] < amount) return res.status(400).json({ error: "Insufficient funds" });

                const targetAmount = amount * finalRate;
                
                // Bank (BOK) Liquidity Check
                const bankRef = db.ref('users/한국은행');
                const bankSnap = await bankRef.once('value');
                const bank = bankSnap.val();
                
                // If user buys USD, Bank loses USD. If Bank has no USD, fail?
                // For simulation, let's assume Bank prints KRW but has limited USD.
                if (toCurrency === 'USD' && (bank.balanceUSD || 0) < targetAmount) {
                     return res.status(400).json({ error: "BANK_NO_LIQUIDITY" });
                }

                await userRef.update({ 
                    [deductKey]: user[deductKey] - amount,
                    [addKey]: (user[addKey] || 0) + targetAmount
                });

                // Adjust Bank Balance (Opposite)
                await bankRef.update({
                    [deductKey]: (bank[deductKey] || 0) + amount,
                    [addKey]: (bank[addKey] || 0) - targetAmount
                });

                return res.status(200).json({ success: true });
            }

            // [6-6] 구매 (VAT 포함)
            if (action === 'purchase') {
                const { buyerId, items } = payload;
                // items: [{ id, sellerName, price, quantity }]
                
                const allSnap = await db.ref('users').once('value');
                const users = allSnap.val() || {};
                const buyerKey = Object.keys(users).find(key => users[key].name === buyerId);
                
                if (!buyerKey) return res.status(404).json({ error: "Buyer not found" });
                
                const buyer = users[buyerKey];
                
                // Calculate Totals and VAT
                const settingsSnap = await db.ref('settings').once('value');
                const vatSettings = settingsSnap.val()?.vat || { rate: 0, targetMarts: [] };
                
                let totalCost = 0;
                const sellerUpdates: any = {}; // map sellerKey -> { addMoney: 0, sales: [] }
                const bankRef = db.ref('users/한국은행');
                let vatTotal = 0;

                // Pre-calculation loop
                for (const item of items) {
                    const itemTotal = item.price * item.quantity; // Base price
                    let itemVat = 0;
                    
                    // VAT Check
                    if (vatSettings.targetMarts.includes('all') || vatSettings.targetMarts.includes(item.sellerName)) {
                        itemVat = Math.floor(itemTotal * (vatSettings.rate / 100));
                    }
                    
                    const lineTotal = itemTotal + itemVat;
                    totalCost += lineTotal;
                    vatTotal += itemVat;

                    const sellerKey = Object.keys(users).find(key => users[key].name === item.sellerName);
                    if (sellerKey) {
                        if (!sellerUpdates[sellerKey]) sellerUpdates[sellerKey] = { amount: 0, name: item.sellerName };
                        sellerUpdates[sellerKey].amount += itemTotal; // Seller gets base price
                    }
                }

                if (buyer.balanceKRW < totalCost) return res.status(400).json({ error: "Insufficient funds" });

                // Execute
                await db.ref(`users/${buyerKey}`).update({ balanceKRW: buyer.balanceKRW - totalCost });
                
                // Credit Sellers
                for (const sKey in sellerUpdates) {
                    const sData = sellerUpdates[sKey];
                    const currentSeller = users[sKey];
                    await db.ref(`users/${sKey}`).update({ balanceKRW: (currentSeller.balanceKRW || 0) + sData.amount });
                    
                    // Add Transaction Log for Seller
                    const sTx = currentSeller.transactions || [];
                    sTx.push({ id: Date.now(), type: 'income', amount: sData.amount, currency: 'KRW', description: `판매 수익 (${buyer.name})`, date: new Date().toISOString() });
                    await db.ref(`users/${sKey}/transactions`).set(sTx);
                }

                // Credit VAT to Bank
                if (vatTotal > 0) {
                    const bankSnap = await bankRef.once('value');
                    const bank = bankSnap.val();
                    await bankRef.update({ balanceKRW: (bank.balanceKRW || 0) + vatTotal });
                }

                // Add Transaction Log for Buyer
                const bTx = buyer.transactions || [];
                bTx.push({ id: Date.now(), type: 'expense', amount: -totalCost, currency: 'KRW', description: `물품 구매 (${items.length}건)`, date: new Date().toISOString() });
                await db.ref(`users/${buyerKey}/transactions`).set(bTx);

                return res.status(200).json({ success: true });
            }

            return res.status(200).json({ success: true });
        }

        return res.status(400).json({ error: "INVALID_ACTION", received: action });
    } catch (e: any) {
        console.error("Server Action Error:", e);
        return res.status(500).json({ error: e.message });
    }
};
