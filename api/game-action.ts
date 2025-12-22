
import { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from './db.js';

const setCors = (res: VercelResponse) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

const toSafeId = (id: string) => 
    (id || '').trim().toLowerCase()
    .replace(/[@.+]/g, '_')
    .replace(/[#$\[\]]/g, '_');

export default async (req: VercelRequest, res: VercelResponse) => {
    setCors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    
    if (!db) {
        return res.status(503).json({ error: 'DATABASE_UNAVAILABLE' });
    }

    const { action, payload } = req.body || {};

    if (!action) {
        return res.status(400).json({ error: "MISSING_ACTION" });
    }

    try {
        // [OPTIMIZATION] Fetch lightweight essentials + pendingApplications
        if (action === 'fetch_initial_data') {
            const [
                settingsSnap, 
                realEstateSnap, 
                announcementsSnap, 
                adsSnap, 
                stocksSnap, 
                auctionSnap,
                countriesSnap,
                pendingAppsSnap // 👈 Added
            ] = await Promise.all([
                db.ref('settings').once('value'),
                db.ref('realEstate/grid').once('value'),
                db.ref('announcements').limitToLast(20).once('value'),
                db.ref('ads').once('value'),
                db.ref('stocks').once('value'),
                db.ref('auction').once('value'),
                db.ref('countries').once('value'),
                db.ref('pendingApplications').once('value') // 👈 Added
            ]);

            const annVal = announcementsSnap.val() || {};
            const announcements = Array.isArray(annVal) ? annVal : Object.values(annVal);

            const data = {
                settings: settingsSnap.val() || {},
                realEstate: { grid: realEstateSnap.val() || [] },
                announcements: announcements,
                ads: adsSnap.val() || {},
                stocks: stocksSnap.val() || {},
                auction: auctionSnap.val() || {},
                countries: countriesSnap.val() || {},
                pendingApplications: pendingAppsSnap.val() || {} // 👈 Added
            };
            
            return res.status(200).json(data);
        }

        // Lightweight self-refresh
        if (action === 'fetch_my_lite_info') {
            const { userId } = payload;
            if (!userId) return res.status(400).json({});
            const safeKey = toSafeId(userId);
            const snap = await db.ref(`users/${safeKey}`).once('value');
            const u = snap.val();
            
            if (!u) return res.status(404).json({});

            if (u.transactions) delete u.transactions; 
            if (u.ledger) delete u.ledger;
            if (u.assetHistory) delete u.assetHistory;
            if (u.notifications) delete u.notifications;
            if (u.profilePic && u.profilePic.startsWith('data:')) u.profilePic = null; 
            
            // Normalize Arrays
            if (u.pendingTaxes && !Array.isArray(u.pendingTaxes)) u.pendingTaxes = Object.values(u.pendingTaxes);
            if (u.loans && !Array.isArray(u.loans)) u.loans = Object.values(u.loans);

            return res.status(200).json(u);
        }

        // Admin User Approval
        if (action === 'approve_user') {
            const { targetId } = payload;
            const safeKey = toSafeId(targetId);
            await db.ref(`users/${safeKey}`).update({ approvalStatus: 'approved' });
            return res.status(200).json({ success: true });
        }
        
        if (action === 'reject_user') {
             const { targetId } = payload;
             const safeKey = toSafeId(targetId);
             await db.ref(`users/${safeKey}`).remove();
             return res.status(200).json({ success: true });
        }

        // Financial Management (Bulk Actions)
        if (action === 'distribute_weekly_pay' || action === 'distribute_welfare' || action === 'collect_tax' || action === 'weekly_pay') {
             const { amount, type, userIds } = payload; // userIds is optional list
             const usersSnap = await db.ref('users').once('value');
             const users = usersSnap.val() || {};
             const updates: any = {};
             let count = 0;

             // If explicit user list provided (e.g. from WeeklyPayTab), use it
             const targetKeys = userIds ? userIds.map((id: string) => toSafeId(id)) : Object.keys(users);

             targetKeys.forEach((key: string) => {
                 const user = users[key];
                 if (!user) return;

                 if (action === 'distribute_weekly_pay' || action === 'weekly_pay') {
                     // Pay to everyone in list or specific roles if no list
                     if (userIds || ['government', 'teacher', 'president', 'judge', 'prosecutor'].includes(user.type) || user.subType === 'teacher') {
                         updates[`users/${key}/balanceKRW`] = (user.balanceKRW || 0) + amount;
                         // Add transaction record if needed (omitted for brevity in bulk op, or handled by client notification)
                         count++;
                     }
                 } else if (action === 'distribute_welfare') {
                     if (user.type === 'citizen') {
                         updates[`users/${key}/balanceKRW`] = (user.balanceKRW || 0) + amount;
                         count++;
                     }
                 } else if (action === 'collect_tax') {
                     // Logic for tax collection is usually handled by `collect_tax` separate handler below, 
                     // but if this generic block is used:
                     if (user.type !== 'admin' && user.type !== 'root') {
                         const taxAmount = Math.floor((user.balanceKRW || 0) * (amount / 100));
                         if (taxAmount > 0) {
                             updates[`users/${key}/balanceKRW`] = (user.balanceKRW || 0) - taxAmount;
                             count++;
                         }
                     }
                 }
             });
             
             if (Object.keys(updates).length > 0) await db.ref().update(updates);
             return res.status(200).json({ success: true, count });
        }

        // Specific Tax Collection with Session
        if (action === 'collect_tax' && payload.taxSessionId) {
            const { taxSessionId, taxes, dueDate } = payload;
            const updates: any = {};
            
            // Create Session
            updates[`taxSessions/${taxSessionId}`] = {
                id: taxSessionId,
                type: taxes[0]?.type || 'tax',
                amount: taxes.reduce((s: number, t: any) => s + t.amount, 0),
                startDate: new Date().toISOString(),
                dueDate: dueDate,
                status: 'active',
                targetUsers: taxes.map((t:any) => t.userId)
            };

            // Distribute pending taxes
            for (const tax of taxes) {
                const safeKey = toSafeId(tax.userId);
                const userRef = `users/${safeKey}`;
                // We need to fetch current pending taxes to append, or use a new ID strategy
                // Since we can't read-modify-write easily in bulk without transaction, 
                // we'll push to a list. But RTDB array push is tricky. 
                // We will assume the client or a separate process handles specific user updates,
                // OR we accept we might overwrite if not careful.
                // Better approach for bulk: Use a unique ID for the tax entry
                const taxId = `${taxSessionId}_${safeKey}`;
                updates[`users/${safeKey}/pendingTaxes/${taxId}`] = {
                    id: taxId,
                    sessionId: taxSessionId,
                    amount: tax.amount,
                    type: tax.type,
                    dueDate: dueDate,
                    status: 'pending',
                    breakdown: tax.breakdown
                };
                
                // Add notification
                const notifId = `notif_${Date.now()}_${Math.random().toString(36).substr(2,5)}`;
                updates[`users/${safeKey}/notifications/${notifId}`] = {
                    id: notifId,
                    message: `새로운 세금 고지서가 도착했습니다: ₩${tax.amount.toLocaleString()}`,
                    read: false,
                    date: new Date().toISOString(),
                    type: 'tax',
                    timestamp: Date.now()
                };
            }
            await db.ref().update(updates);
            return res.status(200).json({ success: true });
        }

        // Admin Settings Update
        if (action === 'update_settings') {
            const { settings } = payload;
            await db.ref('settings').update(settings);
            return res.status(200).json({ success: true });
        }

        // --- Existing Actions (Transfer, Mint, etc) ---

        if (action === 'fetch_all_users_light') {
            const snapshot = await db.ref('users').once('value');
            const users = snapshot.val() || {};
            const lightweightUsers: Record<string, any> = {};
            Object.keys(users).forEach(key => {
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
                };
            });
            return res.status(200).json({ users: lightweightUsers });
        }

        if (action === 'fetch_my_transactions') {
            const { userId, limit = 50 } = payload;
            const safeKey = toSafeId(userId);
            const snap = await db.ref(`users/${safeKey}/transactions`).limitToLast(limit).once('value');
            return res.status(200).json({ transactions: Object.values(snap.val() || {}) });
        }
        
        if (action === 'fetch_wealth_stats') {
            const [usersSnap, settingsSnap, realEstateSnap] = await Promise.all([
                db.ref('users').once('value'),
                db.ref('settings/exchangeRate').once('value'),
                db.ref('realEstate/grid').once('value')
            ]);
            const users = usersSnap.val() || {};
            const exchangeRate = settingsSnap.val()?.KRW_USD || 1350;
            const grid = realEstateSnap.val() || [];
            const citizens = Object.values(users).filter((u: any) => u.type === 'citizen');
            const assetList = citizens.map((c: any) => {
                const krw = c.balanceKRW || 0;
                const usd = (c.balanceUSD || 0) * exchangeRate;
                const propVal = grid.filter((p: any) => p.owner === c.name).reduce((s: number, p: any) => s + (p.price || 0), 0);
                return { total: krw + usd + propVal, id: c.id || c.email };
            });
            assetList.sort((a,b) => a.total - b.total);
            const buckets = [0,0,0,0,0];
            const maxVal = Math.max(...assetList.map(a => a.total)) || 1;
            assetList.forEach(item => {
                const idx = Math.min(4, Math.floor((item.total / (maxVal * 1.01)) * 5));
                buckets[idx]++;
            });
            return res.status(200).json({ buckets, totalCount: citizens.length });
        }

        if (action === 'fetch_linked_accounts') { 
            const { linkedIds } = payload || {};
            if (!linkedIds || !Array.isArray(linkedIds) || linkedIds.length === 0) return res.status(200).json({ accounts: [] });
            const accounts = [];
            for (const id of linkedIds) {
                try {
                    if (!id) continue;
                    const safeKey = toSafeId(id);
                    const snap = await db.ref(`users/${safeKey}`).once('value');
                    let user = snap.val();
                    if (!user) {
                        const emailSnap = await db.ref('users').orderByChild('email').equalTo(id).limitToFirst(1).once('value');
                        if (emailSnap.exists()) user = Object.values(emailSnap.val())[0];
                    }
                    if (user) {
                        accounts.push({
                            id: user.id || id,
                            email: user.email || id,
                            name: user.name,
                            profilePic: (user.profilePic && user.profilePic.length < 500) ? user.profilePic : null 
                        });
                    }
                } catch(e) {}
            }
            return res.status(200).json({ accounts });
        }
        
        if (action === 'link_account') { 
            const { myEmail, targetId } = payload;
            const myKey = toSafeId(myEmail);
            const targetKey = toSafeId(targetId);
            let targetUser = (await db.ref(`users/${targetKey}`).once('value')).val();
            if (!targetUser) {
                 const q = await db.ref('users').orderByChild('id').equalTo(targetId).limitToFirst(1).once('value');
                 if (q.exists()) targetUser = Object.values(q.val())[0];
            }
            if (!targetUser) return res.status(404).json({ error: "사용자를 찾을 수 없습니다." });
            const targetEmail = targetUser.email || targetUser.id;
            if (targetEmail === myEmail) return res.status(400).json({ error: "자기 자신을 연동할 수 없습니다." });
            const myRef = db.ref(`users/${myKey}`);
            const mySnap = await myRef.once('value');
            const me = mySnap.val();
            const currentLinks = me.linkedAccounts || [];
            if (currentLinks.includes(targetEmail)) return res.status(400).json({ error: "이미 연동된 계정입니다." });
            await myRef.update({ linkedAccounts: [...currentLinks, targetEmail] });
            return res.status(200).json({ success: true });
        }
        
        if (action === 'unlink_account') { 
            const { myEmail, targetName } = payload;
            const myKey = toSafeId(myEmail);
            const myRef = db.ref(`users/${myKey}`);
            const me = (await myRef.once('value')).val();
            let currentLinks = me.linkedAccounts || [];
            const safeLinks = [];
            for (const link of currentLinks) {
                 const safeKey = toSafeId(link);
                 let user = (await db.ref(`users/${safeKey}`).once('value')).val();
                 if(!user) {
                     const q = await db.ref('users').orderByChild('email').equalTo(link).limitToFirst(1).once('value');
                     if(q.exists()) user = Object.values(q.val())[0];
                 }
                 if (user && user.name === targetName) continue;
                 safeLinks.push(link);
            }
            await myRef.update({ linkedAccounts: safeLinks });
            return res.status(200).json({ success: true }); 
        }

        if (action === 'mint_currency') {
            const { amount, currency } = payload;
            const usersRef = db.ref('users');
            const usersSnap = await usersRef.once('value');
            const users = usersSnap.val() || {};
            let bankEntry = Object.entries(users).find(([k, u]: [string, any]) => u.id === 'bok' || u.email === 'bok@bank.sh') ||
                            Object.entries(users).find(([k, u]: [string, any]) => u.name === '한국은행');
            let bankKey = bankEntry ? bankEntry[0] : 'bok_official';
            if (!bankEntry) {
                const newBank = {
                    id: 'bok', name: '한국은행', type: 'admin', email: 'bok@bank.sh', 
                    balanceKRW: currency === 'KRW' ? amount : 0, balanceUSD: currency === 'USD' ? amount : 0
                };
                await db.ref(`users/${bankKey}`).set(newBank);
            } else {
                const field = currency === 'KRW' ? 'balanceKRW' : 'balanceUSD';
                const currentBalance = (users[bankKey] as any)[field] || 0;
                const updates: any = {};
                updates[`users/${bankKey}/${field}`] = currentBalance + amount;
                await db.ref().update(updates);
            }
            return res.status(200).json({ success: true });
        }

        if (action === 'transfer') {
            const { senderId, receiverId, amount, senderMemo, receiverMemo, currency = 'KRW' } = payload;
            const findKey = async (identifier: string) => {
                const safe = toSafeId(identifier);
                const directCheck = await db.ref(`users/${safe}`).once('value');
                if (directCheck.exists()) return safe;
                const allSnap = await db.ref('users').once('value');
                const users = allSnap.val() || {};
                return Object.keys(users).find(k => users[k].id === identifier || users[k].email === identifier || users[k].name === identifier);
            };
            const sKey = await findKey(senderId);
            const rKey = await findKey(receiverId);
            if (!sKey || !rKey) return res.status(404).json({ error: "USER_NOT_FOUND" });
            const sRef = db.ref(`users/${sKey}`);
            const rRef = db.ref(`users/${rKey}`);
            const sVal = (await sRef.once('value')).val();
            const rVal = (await rRef.once('value')).val();
            const balanceField = currency === 'USD' ? 'balanceUSD' : 'balanceKRW';
            if ((sVal[balanceField] || 0) < amount) return res.status(400).json({ error: "INSUFFICIENT_FUNDS" });
            const now = new Date().toISOString();
            const txId = Date.now();
            const updates: any = {};
            updates[`users/${sKey}/${balanceField}`] = (sVal[balanceField] || 0) - amount;
            updates[`users/${rKey}/${balanceField}`] = (rVal[balanceField] || 0) + amount;
            let sTx = sVal.transactions || [];
            if(sTx.length > 50) sTx = sTx.slice(-50);
            sTx.push({ id: txId, type: 'transfer', amount: -amount, currency, description: senderMemo || `이체 (${rVal.name})`, date: now });
            let rTx = rVal.transactions || [];
            if(rTx.length > 50) rTx = rTx.slice(-50);
            rTx.push({ id: txId+1, type: 'transfer', amount: amount, currency, description: receiverMemo || `입금 (${sVal.name})`, date: now });
            updates[`users/${sKey}/transactions`] = sTx;
            updates[`users/${rKey}/transactions`] = rTx;
            await db.ref().update(updates);
            return res.status(200).json({ success: true });
        }

        if (action === 'place_bid') {
             const { amount, bidder } = payload;
             const auctionRef = db.ref('auction');
             const auctionSnap = await auctionRef.once('value');
             const auction = auctionSnap.val();
             if (!auction || !auction.isActive || auction.status !== 'active' || auction.isPaused) return res.status(400).json({ error: "AUCTION_CLOSED" });
             if (amount <= auction.currentPrice) return res.status(400).json({ error: "BID_TOO_LOW" });
             const usersSnap = await db.ref('users').once('value');
             const users = usersSnap.val() || {};
             const userKey = Object.keys(users).find(k => users[k].name === bidder);
             if (!userKey || users[userKey].balanceKRW < amount) return res.status(400).json({ error: "INSUFFICIENT_FUNDS" });
             const now = Date.now();
             let newEndTime = auction.endTime;
             if (newEndTime - now < 30000) newEndTime = now + 30000;
             const updates: any = {};
             updates['auction/currentPrice'] = amount;
             updates['auction/endTime'] = newEndTime;
             updates['auction/bids'] = [...(auction.bids || []), { bidder, amount, timestamp: now }];
             await db.ref().update(updates);
             return res.status(200).json({ success: true });
        }

        return res.status(200).json({ success: true }); 

    } catch (e: any) {
        console.error("Server Action Error:", e);
        return res.status(500).json({ error: e.message });
    }
};
