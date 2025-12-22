
import { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from './db.js';

// CORS 설정
const setCors = (res: VercelResponse) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

// 특정 관리자 이메일 지정 (System Admin)
const SPECIFIC_ADMIN_EMAIL = '20jj43e009@n.jbedu.kr';

// ID 안전 변환
const toSafeId = (id: string) => 
    (id || '').trim().toLowerCase()
    .replace(/[@.+]/g, '_')
    .replace(/[#$\[\]]/g, '_');

// 유효하지 않은 값(undefined, NaN) 제거
const sanitizeUpdates = (updates: any) => {
    const clean: any = {};
    Object.keys(updates).forEach(key => {
        const val = updates[key];
        if (val === undefined) return;
        if (typeof val === 'number' && isNaN(val)) return;
        clean[key] = val;
    });
    return clean;
};

// [핵심 변경] 한국은행 역할을 하는 실제 관리자 계정 찾기
const findBankKey = async (): Promise<string | null> => {
    // 1. 지정된 관리자 이메일로 검색
    const emailQuery = await db.ref('users').orderByChild('email').equalTo(SPECIFIC_ADMIN_EMAIL).limitToFirst(1).once('value');
    if (emailQuery.exists()) {
        const val = emailQuery.val();
        const realKey = Object.keys(val).find(k => k !== 'bok');
        if (realKey) return realKey;
    }

    // 2. 'admin_core' (Renamed legacy bok)
    const coreSnap = await db.ref('users/admin_core').once('value');
    if (coreSnap.exists()) return 'admin_core';

    // 3. '한국은행장' 직책을 가진 사람 검색
    const roleSnap = await db.ref('users').orderByChild('govtRole').equalTo('한국은행장').once('value');
    if (roleSnap.exists()) {
        const users = roleSnap.val();
        const realKey = Object.keys(users).find(k => k !== 'bok');
        if (realKey) return realKey;
    }

    // 4. Admin 권한을 가진 실제 유저 검색 (오래된 가입자 순)
    const adminSnap = await db.ref('users').orderByChild('type').equalTo('admin').limitToFirst(5).once('value');
    if (adminSnap.exists()) {
        const admins = adminSnap.val();
        const realKey = Object.keys(admins).find(k => k !== 'bok');
        if (realKey) return realKey;
    }

    // 5. Last Resort: Check if 'bok' exists and use it (prevent system lockout)
    const bokSnap = await db.ref('users/bok').once('value');
    if (bokSnap.exists()) return 'bok';

    return null; 
};

// [Core Logic] 사용자 찾기
const findUserKey = async (identifier: string): Promise<string | null> => {
    if (!identifier) return null;
    
    // 한국은행 관련 식별자가 들어오면 실제 관리자 키로 리다이렉트
    if (['bok', 'bok_official', '한국은행', '한국은행장', 'admin'].includes(identifier)) {
        return await findBankKey();
    }

    const safeKey = toSafeId(identifier);
    const lowerId = identifier.trim().toLowerCase();

    // 1. Key로 직접 조회 (우선순위)
    const directSnap = await db.ref(`users/${safeKey}`).once('value');
    if (directSnap.exists()) return safeKey;

    // 2. Email 필드 일치 조회
    const emailQuery = await db.ref('users').orderByChild('email').equalTo(lowerId).limitToFirst(1).once('value');
    if (emailQuery.exists()) {
        return Object.keys(emailQuery.val())[0];
    }

    // 3. ID 필드 일치 조회
    const idQuery = await db.ref('users').orderByChild('id').equalTo(identifier).limitToFirst(1).once('value');
    if (idQuery.exists()) {
        return Object.keys(idQuery.val())[0];
    }

    // 4. 이름 일치 조회
    const nameQuery = await db.ref('users').orderByChild('name').equalTo(identifier).limitToFirst(1).once('value');
    if (nameQuery.exists()) {
        return Object.keys(nameQuery.val())[0];
    }

    return null;
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
        const txIdBase = Date.now();

        // [구조 복구] bok 노드 삭제 및 실제 관리자 계정으로 병합
        if (action === 'fix_database_structure') {
            const updates: any = {};
            const usersSnap = await db.ref('users').once('value');
            const users = usersSnap.val() || {};
            const userKeys = Object.keys(users);

            // 1. 지정된 관리자 계정 찾기
            let targetAdminKey = userKeys.find(k => k !== 'bok' && users[k].email === SPECIFIC_ADMIN_EMAIL);
            
            // 없으면 다른 관리자라도 찾음
            if (!targetAdminKey) {
                targetAdminKey = userKeys.find(k => k !== 'bok' && (users[k].type === 'admin' || users[k].govtRole === '한국은행장'));
            }

            // 가짜 'bok' 노드 찾기
            const bokNode = users['bok'];

            if (bokNode) {
                if (targetAdminKey) {
                    // 병합 로직
                    if (users[targetAdminKey].type !== 'admin') updates[`users/${targetAdminKey}/type`] = 'admin';
                    updates[`users/${targetAdminKey}/subType`] = 'govt';
                    updates[`users/${targetAdminKey}/govtRole`] = '한국은행장';

                    const currentKRW = Number(users[targetAdminKey].balanceKRW) || 0;
                    const currentUSD = Number(users[targetAdminKey].balanceUSD) || 0;
                    const bokKRW = Number(bokNode.balanceKRW) || 0;
                    const bokUSD = Number(bokNode.balanceUSD) || 0;

                    updates[`users/${targetAdminKey}/balanceKRW`] = currentKRW + bokKRW;
                    updates[`users/${targetAdminKey}/balanceUSD`] = currentUSD + bokUSD;
                    
                    // bok 삭제
                    updates['users/bok'] = null;
                } else {
                    // 병합할 대상이 없으면 'bok'을 'admin_core'로 이름 변경 (안전 조치)
                    updates['users/admin_core'] = bokNode;
                    updates['users/admin_core/type'] = 'admin';
                    updates['users/admin_core/subType'] = 'govt';
                    updates['users/admin_core/name'] = '한국은행(Core)';
                    updates['users/bok'] = null;
                }
            }

            if (Object.keys(updates).length > 0) {
                await db.ref().update(sanitizeUpdates(updates));
                return res.status(200).json({ success: true, message: `레거시 'bok' 계정을 정리하고 관리자 계정으로 자산을 통합했습니다.` });
            }
            return res.status(200).json({ success: true, message: "구조가 이미 정상입니다." });
        }

        // ==========================================
        // [1] 데이터 조회
        // ==========================================

        if (action === 'fetch_initial_data') {
            const [settings, grid, announce, ads, stocks, auction, countries, pendingApps, bonds] = await Promise.all([
                db.ref('settings').once('value'),
                db.ref('realEstate/grid').once('value'),
                db.ref('announcements').limitToLast(20).once('value'),
                db.ref('ads').once('value'),
                db.ref('stocks').once('value'),
                db.ref('auction').once('value'),
                db.ref('countries').once('value'),
                db.ref('pendingApplications').once('value'),
                db.ref('bonds').once('value')
            ]);

            const annVal = announce.val();
            return res.status(200).json({
                settings: settings.val() || {},
                realEstate: { grid: grid.val() || [] },
                announcements: annVal ? (Array.isArray(annVal) ? annVal : Object.values(annVal)) : [],
                ads: ads.val() || {},
                stocks: stocks.val() || {},
                auction: auction.val() || {},
                countries: countries.val() || {},
                pendingApplications: pendingApps.val() || {},
                bonds: bonds.val() || {} 
            });
        }

        if (action === 'fetch_my_lite_info') {
            const { userId } = payload;
            const userKey = await findUserKey(userId);
            if (!userKey) return res.status(404).json({});
            
            const u = (await db.ref(`users/${userKey}`).once('value')).val();
            if (!u) return res.status(404).json({});

            delete u.transactions;
            delete u.notifications; 
            if (u.profilePic?.startsWith('data:')) u.profilePic = null;
            return res.status(200).json(u);
        }

        if (action === 'fetch_all_users_light') {
            const snapshot = await db.ref('users').once('value');
            const users = snapshot.val() || {};
            const lightweightUsers: Record<string, any> = {};
            
            Object.keys(users).forEach(key => {
                if (key === 'bok') return; // 클라이언트에 bok 절대 노출 금지
                const u = users[key];
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
                    products: u.products
                };
            });
            return res.status(200).json({ users: lightweightUsers });
        }

        if (action === 'fetch_my_transactions') {
            const { userId, limit = 100 } = payload;
            const userKey = await findUserKey(userId);
            if (!userKey) return res.status(404).json({ error: "User not found" });
            const snap = await db.ref(`users/${userKey}/transactions`).limitToLast(limit).once('value');
            const txs = snap.val() || [];
            return res.status(200).json({ transactions: Array.isArray(txs) ? txs : Object.values(txs) });
        }

        if (action === 'fetch_wealth_stats') {
            const snap = await db.ref('users').once('value');
            const users = Object.values(snap.val() || {});
            const validUsers = users.filter((u: any) => u.id !== 'bok' && u.type === 'citizen'); // 통계는 시민만
            
            const assets = validUsers.map((u: any) => (Number(u.balanceKRW) || 0) + ((Number(u.balanceUSD) || 0) * 1350));
            assets.sort((a,b) => a - b);
            const buckets = [0, 0, 0, 0, 0];
            const maxVal = Math.max(...assets) || 1;
            assets.forEach(val => {
                const idx = Math.min(4, Math.floor((val / (maxVal * 1.01)) * 5));
                buckets[idx]++;
            });
            return res.status(200).json({ buckets, totalCount: validUsers.length });
        }

        // ==========================================
        // [2] 금융 거래 (Atomic Transactions)
        // ==========================================

        if (action === 'transfer') {
            const { senderId, receiverId, amount, senderMemo, receiverMemo, currency = 'KRW' } = payload;
            const numAmount = Number(amount);
            
            const sKey = await findUserKey(senderId);
            const rKey = await findUserKey(receiverId);
            
            if (!sKey || !rKey) return res.status(404).json({ error: "USER_NOT_FOUND" });
            if (sKey === rKey) return res.status(400).json({ error: "SELF_TRANSFER" });
            
            const [sSnap, rSnap] = await Promise.all([
                db.ref(`users/${sKey}`).once('value'),
                db.ref(`users/${rKey}`).once('value')
            ]);
            const sVal = sSnap.val();
            const rVal = rSnap.val();

            const balField = currency === 'USD' ? 'balanceUSD' : 'balanceKRW';
            const sBal = Number(sVal[balField]) || 0;
            const rBal = Number(rVal[balField]) || 0;

            if (sBal < numAmount) return res.status(400).json({ error: "INSUFFICIENT_FUNDS" });

            const updates: any = {};
            updates[`users/${sKey}/${balField}`] = sBal - numAmount;
            updates[`users/${rKey}/${balField}`] = rBal + numAmount;
            
            const sTx = [...(sVal.transactions || []), { id: txIdBase, type: 'transfer', amount: -numAmount, currency, description: senderMemo || `이체 (${rVal.name})`, date: now }];
            const rTx = [...(rVal.transactions || []), { id: txIdBase+1, type: 'transfer', amount: numAmount, currency, description: receiverMemo || `입금 (${sVal.name})`, date: now }];
            
            updates[`users/${sKey}/transactions`] = sTx;
            updates[`users/${rKey}/transactions`] = rTx;
            
            await db.ref().update(sanitizeUpdates(updates));
            return res.status(200).json({ success: true });
        }

        if (action === 'exchange') {
            const { userId, fromCurrency, toCurrency, amount } = payload;
            const numAmount = Number(amount);
            const userKey = await findUserKey(userId);
            if (!userKey) return res.status(404).json({ error: "USER_NOT_FOUND" });

            const userRef = db.ref(`users/${userKey}`);
            const userSnap = await userRef.once('value');
            const user = userSnap.val();

            const settingsSnap = await db.ref('settings').once('value');
            const rate = Number(settingsSnap.val()?.exchangeRate?.KRW_USD) || 1350;

            let finalAmount = 0;
            let fromBalance = 0;
            const currentKrw = Number(user.balanceKRW) || 0;
            const currentUsd = Number(user.balanceUSD) || 0;
            
            if (fromCurrency === 'KRW' && toCurrency === 'USD') {
                fromBalance = currentKrw;
                finalAmount = numAmount / rate;
            } else if (fromCurrency === 'USD' && toCurrency === 'KRW') {
                fromBalance = currentUsd;
                finalAmount = numAmount * rate;
            } else {
                return res.status(400).json({ error: "Invalid currency pair" });
            }

            if (fromBalance < numAmount) return res.status(400).json({ error: "INSUFFICIENT_FUNDS" });

            const updates: any = {};
            if (fromCurrency === 'KRW') {
                updates[`users/${userKey}/balanceKRW`] = currentKrw - numAmount;
                updates[`users/${userKey}/balanceUSD`] = currentUsd + finalAmount;
            } else {
                updates[`users/${userKey}/balanceUSD`] = currentUsd - numAmount;
                updates[`users/${userKey}/balanceKRW`] = currentKrw + finalAmount;
            }

            const txs = user.transactions || [];
            txs.push({ id: txIdBase, type: 'exchange', amount: -numAmount, currency: fromCurrency, description: `환전 (${fromCurrency}->${toCurrency})`, date: now });
            txs.push({ id: txIdBase + 1, type: 'exchange', amount: finalAmount, currency: toCurrency, description: `환전 입금`, date: now });
            updates[`users/${userKey}/transactions`] = txs;

            // [변경] 은행 잔고 반영 시 findBankKey 사용
            const bankKey = await findBankKey();
            if (bankKey && bankKey !== userKey) {
                const bankSnap = await db.ref(`users/${bankKey}`).once('value');
                const bank = bankSnap.val();
                if(bank) {
                    const bankKrw = Number(bank.balanceKRW) || 0;
                    const bankUsd = Number(bank.balanceUSD) || 0;

                    if (fromCurrency === 'KRW') {
                        updates[`users/${bankKey}/balanceKRW`] = bankKrw + numAmount;
                        updates[`users/${bankKey}/balanceUSD`] = bankUsd - finalAmount;
                    } else {
                        updates[`users/${bankKey}/balanceUSD`] = bankUsd + numAmount;
                        updates[`users/${bankKey}/balanceKRW`] = bankKrw - finalAmount;
                    }
                }
            }

            await db.ref().update(sanitizeUpdates(updates));
            return res.status(200).json({ success: true });
        }

        // ==========================================
        // [수정된 발권 로직] 무조건 요청자(Admin)에게 지급
        // ==========================================
        if (action === 'mint_currency') {
            const amount = Number(payload.amount || 0);
            const currency = payload.currency || 'KRW';
            const requesterId = payload.userId; 

            let targetKey: string | null = null;

            // 1. 요청자가 명시되었으면 그 요청자의 키를 찾음 (최우선)
            if (requesterId) {
                targetKey = await findUserKey(requesterId);
            }

            // 2. Fallback: 지정된 관리자 이메일 계정 찾기
            if (!targetKey) {
                targetKey = await findBankKey();
            }

            if (!targetKey) return res.status(500).json({ error: "Bank account not found. Please login as admin." });

            const userSnap = await db.ref(`users/${targetKey}`).once('value');
            const user = userSnap.val();
            
            const field = currency === 'KRW' ? 'balanceKRW' : 'balanceUSD';
            const current = Number(user[field]) || 0;
            
            const updates: any = {};
            updates[`users/${targetKey}/${field}`] = current + amount;
            
            const bankTxs = user.transactions || [];
            bankTxs.push({
                id: txIdBase,
                type: 'income',
                amount: amount,
                currency: currency,
                description: '화폐 발권 (Minting)',
                date: now
            });
            updates[`users/${targetKey}/transactions`] = bankTxs;

            await db.ref().update(sanitizeUpdates(updates));
            return res.status(200).json({ success: true });
        }

        if (action === 'purchase') {
            const { buyerId, items } = payload;
            const buyerKey = await findUserKey(buyerId);
            if (!buyerKey) return res.status(404).json({ error: "Buyer not found" });
            
            const buyerSnap = await db.ref(`users/${buyerKey}`).once('value');
            const buyer = buyerSnap.val();
            const buyerBal = Number(buyer.balanceKRW) || 0;
            
            let totalCost = 0;
            const updates: any = {};
            const bankKey = await findBankKey();
            
            const settingsSnap = await db.ref('settings').once('value');
            const settings = settingsSnap.val() || {};
            const vatRate = Number(settings.vat?.rate) || 0;
            const vatTargets = settings.vat?.targetMarts || [];

            let totalVat = 0;

            for (const item of items) {
                const itemCost = (Number(item.price) || 0) * (Number(item.quantity) || 1);
                totalCost += itemCost;
                
                const sellerKey = await findUserKey(item.sellerName);
                if (!sellerKey) continue;

                const sellerSnap = await db.ref(`users/${sellerKey}`).once('value');
                const seller = sellerSnap.val();
                
                const isVatTarget = vatTargets.includes('all') || vatTargets.includes(seller.name);
                const vat = isVatTarget ? Math.floor(itemCost * (vatRate / 100)) : 0;
                totalVat += vat;
                const netIncome = itemCost - vat;

                const currentSellerBalKey = `users/${sellerKey}/balanceKRW`;
                const currentSellerBal = updates[currentSellerBalKey] !== undefined 
                    ? updates[currentSellerBalKey] 
                    : (Number(seller.balanceKRW) || 0);
                
                updates[currentSellerBalKey] = currentSellerBal + netIncome;

                let sellerTxs = seller.transactions || [];
                if (updates[`users/${sellerKey}/transactions`]) sellerTxs = updates[`users/${sellerKey}/transactions`];
                
                sellerTxs.push({ id: txIdBase + Math.random(), type: 'income', amount: netIncome, currency: 'KRW', description: `판매: ${item.name}`, date: now });
                if (vat > 0) {
                    sellerTxs.push({ id: txIdBase + Math.random(), type: 'vat', amount: -vat, currency: 'KRW', description: `부가세 납부 (${item.name})`, date: now });
                }
                updates[`users/${sellerKey}/transactions`] = sellerTxs;

                if (seller.products && seller.products[item.id]) {
                    const currentStock = Number(seller.products[item.id].stock) || 0;
                    updates[`users/${sellerKey}/products/${item.id}/stock`] = Math.max(0, currentStock - item.quantity);
                }
            }

            if (buyerBal < totalCost) return res.status(400).json({ error: "INSUFFICIENT_FUNDS" });

            updates[`users/${buyerKey}/balanceKRW`] = buyerBal - totalCost;
            const buyerTxs = buyer.transactions || [];
            buyerTxs.push({ id: txIdBase, type: 'expense', amount: -totalCost, currency: 'KRW', description: `물품 구매 (총 ${items.length}건)`, date: now });
            updates[`users/${buyerKey}/transactions`] = buyerTxs;

            if (totalVat > 0 && bankKey) {
                const bankSnap = await db.ref(`users/${bankKey}`).once('value');
                const bank = bankSnap.val();
                if(bank) {
                    const bankBal = Number(bank.balanceKRW) || 0;
                    const currentBankBal = updates[`users/${bankKey}/balanceKRW`] !== undefined ? updates[`users/${bankKey}/balanceKRW`] : bankBal;
                    updates[`users/${bankKey}/balanceKRW`] = currentBankBal + totalVat;
                    
                    let bankTxs = bank.transactions || [];
                    if (updates[`users/${bankKey}/transactions`]) bankTxs = updates[`users/${bankKey}/transactions`];
                    bankTxs.push({ id: txIdBase + Math.random(), type: 'tax', amount: totalVat, currency: 'KRW', description: `부가세 징수`, date: now });
                    updates[`users/${bankKey}/transactions`] = bankTxs;
                }
            }

            await db.ref().update(sanitizeUpdates(updates));
            return res.status(200).json({ success: true });
        }

        // --- 지급 관련 로직 (배분) ---
        if (['distribute_weekly_pay', 'weekly_pay', 'distribute_welfare', 'grant_support'].includes(action)) { 
             const { userIds, amount: pAmount } = payload;
             const amount = Number(pAmount || 0);
             
             const bankKey = await findBankKey();
             if (!bankKey) return res.status(500).json({ error: "Bank account missing" });
             
             const bankSnap = await db.ref(`users/${bankKey}`).once('value');
             const bank = bankSnap.val();
             const bankBal = Number(bank.balanceKRW) || 0;

             const usersSnap = await db.ref('users').once('value');
             const users = usersSnap.val() || {};
             const updates: any = {};
             let totalPayout = 0;
             let count = 0;

             const targetKeys = userIds 
                ? await Promise.all(userIds.map((id:string) => findUserKey(id))) 
                : Object.keys(users);

             for (const key of targetKeys) {
                 if(!key) continue;
                 const user = users[key];
                 if (!user) continue;
                 if (key === bankKey) continue; // 은행 자신에게 지급하지 않음

                 let shouldPay = false;

                 if (action === 'distribute_weekly_pay' || action === 'weekly_pay') {
                     // 주급: 공무원, 교사, 또는 명시된 사용자
                     if (userIds || ['government', 'teacher', 'president', 'judge', 'prosecutor'].includes(user.type) || user.subType === 'teacher' || user.subType === 'govt') {
                         shouldPay = true;
                     }
                 } else if (action === 'distribute_welfare') {
                     // 복지: 시민만
                     if (user.type === 'citizen') {
                         shouldPay = true;
                     }
                 } else if (action === 'grant_support') {
                     // 지원금: 시민, 마트 등 대상
                     if (user.type === 'citizen' || user.type === 'mart') {
                         shouldPay = true;
                     }
                 }

                 if (shouldPay) {
                     totalPayout += amount;
                     updates[`users/${key}/balanceKRW`] = (Number(user.balanceKRW) || 0) + amount;
                     
                     const descMap: any = { 'weekly_pay': '주급', 'distribute_welfare': '복지 지원금', 'grant_support': '지원금' };
                     const txType = 'income';
                     
                     let txs = user.transactions || [];
                     txs.push({
                         id: txIdBase + Math.random(), 
                         type: txType, 
                         amount: amount, 
                         currency: 'KRW', 
                         description: descMap[action] || '지급', 
                         date: now
                     });
                     updates[`users/${key}/transactions`] = txs;
                     
                     const notifId = `n_${Date.now()}_${Math.random().toString(36).substr(2,5)}`;
                     updates[`users/${key}/notifications/${notifId}`] = {
                        id: notifId,
                        message: `${descMap[action] || '지원금'} ₩${amount.toLocaleString()}이 입금되었습니다.`,
                        read: false,
                        date: now,
                        type: 'info'
                     };

                     count++;
                 }
             }

             if (totalPayout > 0) {
                 // 은행 잔고 차감
                 updates[`users/${bankKey}/balanceKRW`] = bankBal - totalPayout;
                 const bankTxs = bank.transactions || [];
                 bankTxs.push({
                     id: txIdBase + Math.random(),
                     type: 'expense',
                     amount: -totalPayout,
                     currency: 'KRW',
                     description: `일괄 지급 (${count}명)`,
                     date: now
                 });
                 updates[`users/${bankKey}/transactions`] = bankTxs;
             }
             
             if (Object.keys(updates).length > 0) await db.ref().update(sanitizeUpdates(updates));
             return res.status(200).json({ success: true, count, totalPayout });
        }

        return res.status(200).json({ success: true });
    } catch (e: any) {
        console.error("API Error:", e);
        return res.status(500).json({ error: e.message });
    }
};
