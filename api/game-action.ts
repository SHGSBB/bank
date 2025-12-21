
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
        // [1] 초기 데이터 조회 (Data Diet: 타인 정보 경량화)
        if (action === 'fetch_initial_data') {
            const { currentUserId, currentEmail } = payload || {}; // SafeID and Raw Email

            const [
                settingsSnap, reSnap, stocksSnap, countrySnap, adSnap, 
                announceSnap, bondSnap, taxSnap, auctionSnap, deferredSnap,
                pendingAppSnap, usersSnap
            ] = await Promise.all([
                db.ref('settings').once('value'),
                db.ref('realEstate').once('value'),
                db.ref('stocks').once('value'),
                db.ref('countries').once('value'),
                db.ref('ads').once('value'),
                db.ref('announcements').once('value'),
                db.ref('bonds').once('value'),
                db.ref('taxSessions').once('value'),
                db.ref('auction').once('value'),
                db.ref('deferredAuctions').once('value'),
                db.ref('pendingApplications').once('value'),
                db.ref('users').once('value')
            ]);

            const rawUsers = usersSnap.val() || {};
            const optimizedUsers: any = {};

            Object.keys(rawUsers).forEach(key => {
                const u = rawUsers[key];
                // Match by SafeID key OR by Email property to ensure we catch "Me"
                const isMe = (currentUserId && key === currentUserId) || (currentEmail && u.email === currentEmail);

                if (isMe) {
                    // 내 정보는 상세 포함 (거래내역 최근 100개 제한)
                    const transactions = Array.isArray(u.transactions) ? u.transactions.slice(-100) : [];
                    optimizedUsers[key] = { ...u, transactions };
                } else {
                    // 타인은 필수 정보만 포함
                    optimizedUsers[key] = {
                        name: u.name,
                        id: u.id,
                        email: u.email,
                        type: u.type,
                        subType: u.subType,
                        customJob: u.customJob,
                        profilePic: u.profilePic,
                        govtRole: u.govtRole,
                        govtBranch: u.govtBranch,
                        approvalStatus: u.approvalStatus,
                        balanceKRW: u.balanceKRW,
                        balanceUSD: u.balanceUSD,
                        // 무거운 데이터 제거
                        transactions: [], 
                        notifications: [],
                        ledger: {},
                        autoTransfers: {},
                        messages: {} 
                    };
                }
            });

            return res.status(200).json({
                users: optimizedUsers,
                settings: settingsSnap.val() || {},
                realEstate: reSnap.val() || { grid: [] },
                stocks: stocksSnap.val() || {},
                countries: countrySnap.val() || {},
                ads: adSnap.val() || [],
                announcements: announceSnap.val() || [],
                bonds: bondSnap.val() || [],
                taxSessions: taxSnap.val() || {},
                auction: auctionSnap.val() || null,
                deferredAuctions: deferredSnap.val() || [],
                pendingApplications: pendingAppSnap.val() || {}
            });
        }

        // [2] 유저 단일 검색 (Client Data Download 방지용)
        if (action === 'fetch_user') {
            const { query: q } = payload;
            const searchKey = (q || "").trim().toLowerCase();
            const safeKey = toSafeId(searchKey);
            
            // 1. SafeKey 직접 조회
            let snap = await db.ref(`users/${safeKey}`).once('value');
            let user = snap.val();

            // 2. ID/Email/Name 필드 검색 (인덱스 활용 시도)
            if (!user) {
                const qEmail = await db.ref('users').orderByChild('email').equalTo(searchKey).limitToFirst(1).once('value');
                if (qEmail.exists()) user = Object.values(qEmail.val())[0];
                else {
                    const qId = await db.ref('users').orderByChild('id').equalTo(searchKey).limitToFirst(1).once('value');
                    if (qId.exists()) user = Object.values(qId.val())[0];
                    else {
                        const qName = await db.ref('users').orderByChild('name').equalTo(q).limitToFirst(1).once('value');
                        if (qName.exists()) user = Object.values(qName.val())[0];
                    }
                }
            }

            if (user) return res.status(200).json({ user });
            return res.status(404).json({ error: "USER_NOT_FOUND" });
        }

        // [3] 계정 연동 정보 조회 (병렬 조회 최적화)
        if (action === 'fetch_linked_accounts') {
            const { linkedIds } = payload;
            if (!linkedIds || !Array.isArray(linkedIds) || linkedIds.length === 0) return res.status(200).json({ accounts: [] });

            const accounts = [];
            const promises = linkedIds.map(async (linkKey: string) => {
                if(!linkKey) return null;
                const lowerKey = String(linkKey).toLowerCase().trim();
                const safeKey = toSafeId(lowerKey);
                
                // 1. Direct Lookup
                let snap = await db.ref(`users/${safeKey}`).once('value');
                let val = snap.val();
                
                // 2. Fallback Search
                if (!val) {
                    const qEmail = await db.ref('users').orderByChild('email').equalTo(lowerKey).limitToFirst(1).once('value');
                    if (qEmail.exists()) val = Object.values(qEmail.val())[0];
                    else {
                        const qId = await db.ref('users').orderByChild('id').equalTo(lowerKey).limitToFirst(1).once('value');
                        if (qId.exists()) val = Object.values(qId.val())[0];
                    }
                }
                return val;
            });

            const results = await Promise.all(promises);
            
            for (const userData of results) {
                if (userData) {
                    accounts.push({
                        name: userData.name || '알 수 없음',
                        email: userData.email,
                        id: userData.id,
                        profilePic: userData.profilePic || null,
                        type: userData.type,
                        customJob: userData.customJob || ""
                    });
                }
            }
            return res.status(200).json({ accounts });
        }

        // [4] 계정 연동하기 
        if (action === 'link_account') {
            const { myEmail, targetId } = payload;
            const mySafeId = toSafeId(myEmail);
            
            // 내 정보 조회
            const mySnap = await db.ref(`users/${mySafeId}`).once('value');
            const myUser = mySnap.val();
            if (!myUser) return res.status(404).json({ error: "SENDER_NOT_FOUND" });

            // 상대방 찾기 (ID/Email)
            let targetUser = null;
            let targetSafeId = toSafeId(targetId);
            let tSnap = await db.ref(`users/${targetSafeId}`).once('value');
            
            if (tSnap.exists()) {
                targetUser = tSnap.val();
            } else {
                const qId = await db.ref('users').orderByChild('id').equalTo(targetId).limitToFirst(1).once('value');
                if (qId.exists()) {
                    targetSafeId = Object.keys(qId.val())[0];
                    targetUser = qId.val()[targetSafeId];
                }
            }

            if (!targetUser) return res.status(404).json({ error: "TARGET_NOT_FOUND" });
            if (targetSafeId === mySafeId) return res.status(400).json({ error: "CANNOT_LINK_SELF" });

            const myEmailToSave = myUser.email || myUser.id; 
            const targetEmailToSave = targetUser.email || targetUser.id;

            const myLinks = Array.isArray(myUser.linkedAccounts) ? myUser.linkedAccounts : [];
            const targetLinks = Array.isArray(targetUser.linkedAccounts) ? targetUser.linkedAccounts : [];

            if (!myLinks.includes(targetEmailToSave)) {
                await db.ref(`users/${mySafeId}/linkedAccounts`).set([...myLinks, targetEmailToSave]);
            }
            if (!targetLinks.includes(myEmailToSave)) {
                await db.ref(`users/${targetSafeId}/linkedAccounts`).set([...targetLinks, myEmailToSave]);
            }

            return res.status(200).json({ success: true });
        }

        // [5] 연동 해제
        if (action === 'unlink_account') {
            const { myEmail, targetName } = payload; // targetName으로 해제 요청
            const mySafeId = toSafeId(myEmail);
            const myUserSnap = await db.ref(`users/${mySafeId}`).once('value');
            const myUser = myUserSnap.val();
            
            if (!myUser) return res.status(404).json({ error: "USER_NOT_FOUND" });
            
            // 상대방 찾기 (이름으로)
            const qName = await db.ref('users').orderByChild('name').equalTo(targetName).limitToFirst(1).once('value');
            let targetEmail = null;
            let targetId = null;
            
            if (qName.exists()) {
                const tUser = Object.values(qName.val())[0] as any;
                targetEmail = tUser.email;
                targetId = tUser.id;
            }

            let newLinks = (myUser.linkedAccounts || []).filter((e: string) => e !== targetEmail && e !== targetId);
            await db.ref(`users/${mySafeId}/linkedAccounts`).set(newLinks);
            return res.status(200).json({ success: true });
        }

        // [6] 금융 액션들 (기존 로직 유지)
        const financialActions = ['transfer', 'exchange', 'purchase', 'mint_currency', 'collect_tax', 'weekly_pay', 'distribute_welfare', 'pay_rent'];
        if (financialActions.includes(action)) {
             if (action === 'purchase') {
                const { buyerId, items } = payload;
                // Buyer Lookup (optimized)
                const qBuyer = await db.ref('users').orderByChild('name').equalTo(buyerId).limitToFirst(1).once('value');
                if (!qBuyer.exists()) return res.status(404).json({ error: "Buyer not found" });
                const buyerKey = Object.keys(qBuyer.val())[0];
                const buyer = qBuyer.val()[buyerKey];

                const settingsSnap = await db.ref('settings').once('value');
                const vatSettings = settingsSnap.val()?.vat || { rate: 0, targetMarts: [] };
                
                let totalCost = 0;
                const sellerUpdates: any = {};
                const bankRef = db.ref('users/한국은행');
                let vatTotal = 0;

                for (const item of items) {
                    const itemTotal = item.price * item.quantity;
                    let itemVat = 0;
                    if (vatSettings.targetMarts.includes('all') || vatSettings.targetMarts.includes(item.sellerName)) {
                        itemVat = Math.floor(itemTotal * (vatSettings.rate / 100));
                    }
                    totalCost += itemTotal + itemVat;
                    vatTotal += itemVat;

                    // Seller Lookup (optimized)
                    const qSeller = await db.ref('users').orderByChild('name').equalTo(item.sellerName).limitToFirst(1).once('value');
                    if (qSeller.exists()) {
                        const sellerKey = Object.keys(qSeller.val())[0];
                        if (!sellerUpdates[sellerKey]) sellerUpdates[sellerKey] = { amount: 0, currentBalance: qSeller.val()[sellerKey].balanceKRW || 0 };
                        sellerUpdates[sellerKey].amount += itemTotal;
                    }
                }

                if (buyer.balanceKRW < totalCost) return res.status(400).json({ error: "Insufficient funds" });

                await db.ref(`users/${buyerKey}`).update({ balanceKRW: buyer.balanceKRW - totalCost });
                
                for (const sKey in sellerUpdates) {
                    const sData = sellerUpdates[sKey];
                    await db.ref(`users/${sKey}`).update({ balanceKRW: sData.currentBalance + sData.amount });
                }
                
                if (vatTotal > 0) {
                    const bankSnap = await bankRef.once('value');
                    await bankRef.update({ balanceKRW: (bankSnap.val().balanceKRW || 0) + vatTotal });
                }
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
