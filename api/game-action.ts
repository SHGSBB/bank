
import { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from './db.js';

// CORS 설정
const setCors = (res: VercelResponse) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

// ID 안전 변환
const toSafeId = (id: string) => 
    (id || '').trim().toLowerCase()
    .replace(/[@.+]/g, '_')
    .replace(/[#$\[\]]/g, '_');

export default async (req: VercelRequest, res: VercelResponse) => {
    setCors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    
    if (!db) return res.status(503).json({ error: 'DATABASE_UNAVAILABLE' });

    const { action, payload } = req.body || {};
    if (!action) return res.status(400).json({ error: "MISSING_ACTION" });

    try {
        // [1] 초기 데이터 조회
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

        // [2] 내 정보 조회 (Lite)
        if (action === 'fetch_my_lite_info') {
            const { userId } = payload;
            if (!userId) return res.status(400).json({});
            const safeKey = toSafeId(userId);
            const u = (await db.ref(`users/${safeKey}`).once('value')).val();
            if (!u) return res.status(404).json({});

            delete u.transactions;
            delete u.notifications;
            if (u.profilePic?.startsWith('data:')) u.profilePic = null;
            return res.status(200).json(u);
        }

        // 🔴 [3] 복구된 기능: 전체 사용자 조회 (관리자용)
        if (action === 'fetch_all_users_light') {
            const snapshot = await db.ref('users').once('value');
            const users = snapshot.val() || {};
            const lightweightUsers: Record<string, any> = {};
            
            Object.keys(users).forEach(key => {
                const u = users[key];
                // 관리자 목록에 필요한 정보만 골라서 전송
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
                    products: u.products // 마트 상품 관리 위해 필요
                };
            });
            return res.status(200).json({ users: lightweightUsers });
        }

        // [4] 재정 관리 통합 (주급, 복지, 세금징수, 지원금)
        if (['distribute_weekly_pay', 'weekly_pay', 'distribute_welfare', 'grant_support'].includes(action) || 
           (action === 'collect_tax' && !payload.taxSessionId)) { 
             
             const { userIds } = payload;
             const amount = Number(payload.amount || 0);
             
             const usersSnap = await db.ref('users').once('value');
             const users = usersSnap.val() || {};
             const updates: any = {};
             let count = 0;

             const targetKeys = userIds ? userIds.map((id: string) => toSafeId(id)) : Object.keys(users);

             targetKeys.forEach((key: string) => {
                 const user = users[key];
                 if (!user) return;
                 let newBalance = Number(user.balanceKRW || 0);
                 let shouldUpdate = false;

                 if (action === 'distribute_weekly_pay' || action === 'weekly_pay') {
                     if (userIds || ['government', 'teacher', 'president', 'judge', 'prosecutor'].includes(user.type) || user.subType === 'teacher') {
                         newBalance += amount;
                         shouldUpdate = true;
                     }
                 } else if (action === 'distribute_welfare') {
                     if (user.type === 'citizen') {
                         newBalance += amount;
                         shouldUpdate = true;
                     }
                 } else if (action === 'grant_support') {
                     newBalance += amount;
                     shouldUpdate = true;
                 } else if (action === 'collect_tax') {
                     if (user.type !== 'admin' && user.type !== 'root') {
                         const tax = Math.floor(newBalance * (amount / 100));
                         if (tax > 0) {
                             newBalance -= tax;
                             shouldUpdate = true;
                         }
                     }
                 }

                 if (shouldUpdate) {
                     updates[`users/${key}/balanceKRW`] = newBalance;
                     count++;
                 }
             });
             
             if (Object.keys(updates).length > 0) await db.ref().update(updates);
             return res.status(200).json({ success: true, count });
        }

        // [5] 세금 고지서 발송
        if (action === 'collect_tax' && payload.taxSessionId) {
            const { taxSessionId, taxes, dueDate } = payload;
            const updates: any = {};
            
            updates[`taxSessions/${taxSessionId}`] = {
                id: taxSessionId,
                type: taxes[0]?.type || 'tax',
                amount: taxes.reduce((s: number, t: any) => s + Number(t.amount), 0),
                startDate: new Date().toISOString(),
                dueDate: dueDate,
                status: 'active',
                targetUsers: taxes.map((t:any) => t.userId)
            };

            for (const tax of taxes) {
                const safeKey = toSafeId(tax.userId);
                const taxId = `${taxSessionId}_${safeKey}`;
                updates[`users/${safeKey}/pendingTaxes/${taxId}`] = {
                    id: taxId,
                    sessionId: taxSessionId,
                    amount: Number(tax.amount),
                    type: tax.type,
                    dueDate: dueDate,
                    status: 'pending',
                    breakdown: tax.breakdown
                };
                const notifId = `n_${Date.now()}_${Math.random().toString(36).substr(2,5)}`;
                updates[`users/${safeKey}/notifications/${notifId}`] = {
                    id: notifId,
                    message: `세금 고지서 도착: ₩${Number(tax.amount).toLocaleString()}`,
                    read: false,
                    date: new Date().toISOString(),
                    type: 'tax'
                };
            }
            await db.ref().update(updates);
            return res.status(200).json({ success: true });
        }

        // [6] 국채 발행
        if (action === 'issue_bond') {
            const { name, principal, rate, maturityDate, totalAmount } = payload;
            const bondId = `bond_${Date.now()}`;
            await db.ref(`bonds/${bondId}`).set({
                id: bondId,
                name,
                principal: Number(principal),
                rate: Number(rate),
                maturityDate,
                totalAmount: Number(totalAmount),
                soldAmount: 0,
                status: 'active',
                issuedAt: new Date().toISOString()
            });
            return res.status(200).json({ success: true });
        }

        // [7] 상품 등록
        if (action === 'register_product') {
            const { userId, product } = payload;
            const safeKey = toSafeId(userId);
            await db.ref(`users/${safeKey}/products/${product.id}`).set(product);
            return res.status(200).json({ success: true });
        }

        // [8] 화폐 발행 (한국은행)
        if (action === 'mint_currency') {
            const amount = Number(payload.amount || 0);
            const currency = payload.currency || 'KRW';
            
            let bankKey = 'bok';
            let bankSnap = await db.ref(`users/${bankKey}`).once('value');
            
            if (!bankSnap.exists()) {
                bankKey = 'bok_official';
                bankSnap = await db.ref(`users/${bankKey}`).once('value');
            }

            if (!bankSnap.exists()) {
                await db.ref(`users/bok`).set({
                    id: 'bok', name: '한국은행', type: 'admin', email: 'bok@bank.sh', 
                    balanceKRW: currency === 'KRW' ? amount : 0, 
                    balanceUSD: currency === 'USD' ? amount : 0
                });
            } else {
                const field = currency === 'KRW' ? 'balanceKRW' : 'balanceUSD';
                const current = Number(bankSnap.val()[field] || 0);
                await db.ref(`users/${bankKey}/${field}`).set(current + amount);
            }
            return res.status(200).json({ success: true });
        }

        // [9] 사용자 승인/거절
        if (action === 'approve_user') {
            await db.ref(`users/${toSafeId(payload.targetId)}`).update({ approvalStatus: 'approved' });
            return res.status(200).json({ success: true });
        }
        if (action === 'reject_user') {
             await db.ref(`users/${toSafeId(payload.targetId)}`).remove();
             return res.status(200).json({ success: true });
        }

        // [10] 설정 업데이트
        if (action === 'update_settings') {
            await db.ref('settings').update(payload.settings);
            return res.status(200).json({ success: true });
        }

        // [11] 송금
        if (action === 'transfer') {
            const { senderId, receiverId, amount, senderMemo, receiverMemo, currency = 'KRW' } = payload;
            const numAmount = Number(amount);
            
            const findKey = async (id: string) => {
                const s = toSafeId(id);
                if ((await db.ref(`users/${s}`).once('value')).exists()) return s;
                const all = (await db.ref('users').once('value')).val() || {};
                return Object.keys(all).find(k => all[k].id === id || all[k].email === id || all[k].name === id);
            };

            const sKey = await findKey(senderId);
            const rKey = await findKey(receiverId);
            
            if (!sKey || !rKey) return res.status(404).json({ error: "USER_NOT_FOUND" });
            
            const sVal = (await db.ref(`users/${sKey}`).once('value')).val();
            const rVal = (await db.ref(`users/${rKey}`).once('value')).val();
            const balField = currency === 'USD' ? 'balanceUSD' : 'balanceKRW';

            if ((sVal[balField] || 0) < numAmount) return res.status(400).json({ error: "INSUFFICIENT_FUNDS" });

            const updates: any = {};
            updates[`users/${sKey}/${balField}`] = Number(sVal[balField]) - numAmount;
            updates[`users/${rKey}/${balField}`] = Number(rVal[balField]) + numAmount;
            
            const now = new Date().toISOString();
            const txId = Date.now();
            let sTx = sVal.transactions || [];
            if(sTx.length > 50) sTx = sTx.slice(-50);
            sTx.push({ id: txId, type: 'transfer', amount: -numAmount, currency, description: senderMemo || `이체 (${rVal.name})`, date: now });
            
            let rTx = rVal.transactions || [];
            if(rTx.length > 50) rTx = rTx.slice(-50);
            rTx.push({ id: txId+1, type: 'transfer', amount: numAmount, currency, description: receiverMemo || `입금 (${sVal.name})`, date: now });
            
            updates[`users/${sKey}/transactions`] = sTx;
            updates[`users/${rKey}/transactions`] = rTx;
            
            await db.ref().update(updates);
            return res.status(200).json({ success: true });
        }

        // [12] 경매 입찰
        if (action === 'place_bid') {
             const { amount, bidder } = payload;
             const numAmount = Number(amount);
             const aucRef = db.ref('auction');
             const auc = (await aucRef.once('value')).val();
             
             if (!auc || !auc.isActive || auc.status !== 'active') return res.status(400).json({ error: "CLOSED" });
             if (numAmount <= auc.currentPrice) return res.status(400).json({ error: "LOW_BID" });
             
             const updates: any = {};
             const now = Date.now();
             updates['auction/currentPrice'] = numAmount;
             updates['auction/bids'] = [...(auc.bids || []), { bidder, amount: numAmount, timestamp: now }];
             if (auc.endTime - now < 30000) updates['auction/endTime'] = now + 30000;
             
             await db.ref().update(updates);
             return res.status(200).json({ success: true });
        }

        // [13] 계정 연동 (복구됨)
        if (action === 'fetch_linked_accounts') { 
            const { linkedIds } = payload || {};
            if (!linkedIds || !Array.isArray(linkedIds) || linkedIds.length === 0) return res.status(200).json({ accounts: [] });
            const accounts = [];
            for (const id of linkedIds) {
                try {
                    const safeKey = toSafeId(id);
                    const user = (await db.ref(`users/${safeKey}`).once('value')).val();
                    if (user) accounts.push({ id: user.id, email: user.email, name: user.name, profilePic: user.profilePic });
                } catch(e) {}
            }
            return res.status(200).json({ accounts });
        }
        
        if (action === 'link_account') { 
            const { myEmail, targetId } = payload;
            const myKey = toSafeId(myEmail);
            const targetKey = toSafeId(targetId);
            
            const targetUser = (await db.ref(`users/${targetKey}`).once('value')).val();
            if (!targetUser) return res.status(404).json({ error: "사용자를 찾을 수 없습니다." });
            
            const myRef = db.ref(`users/${myKey}`);
            const me = (await myRef.once('value')).val();
            const currentLinks = me.linkedAccounts || [];
            
            if (currentLinks.includes(targetUser.email)) return res.status(400).json({ error: "이미 연동된 계정입니다." });
            await myRef.update({ linkedAccounts: [...currentLinks, targetUser.email] });
            return res.status(200).json({ success: true });
        }

        if (action === 'unlink_account') { 
            const { myEmail, targetName } = payload;
            const myRef = db.ref(`users/${toSafeId(myEmail)}`);
            const me = (await myRef.once('value')).val();
            
            // 이름으로 찾아서 삭제하는 복잡한 로직은 생략하고, 이메일 기반이 정확하나 요청대로 유지
            // (실제로는 이메일로 지우는게 안전합니다)
            const safeLinks = [];
            for (const link of (me.linkedAccounts || [])) {
                 const u = (await db.ref(`users/${toSafeId(link)}`).once('value')).val();
                 if (u && u.name !== targetName) safeLinks.push(link);
            }
            await myRef.update({ linkedAccounts: safeLinks });
            return res.status(200).json({ success: true }); 
        }

        return res.status(200).json({ success: true });
    } catch (e: any) {
        console.error("API Error:", e);
        return res.status(500).json({ error: e.message });
    }
};
