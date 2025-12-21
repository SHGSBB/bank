
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
        // [OPTIMIZATION] Do NOT fetch root ('/'). Fetch only lightweight essentials.
        if (action === 'fetch_initial_data') {
            const [
                settingsSnap, 
                realEstateSnap, 
                announcementsSnap, 
                adsSnap, 
                stocksSnap, 
                auctionSnap,
                countriesSnap
            ] = await Promise.all([
                db.ref('settings').once('value'),
                db.ref('realEstate/grid').once('value'), // Only fetch grid, avoid transaction logs if any
                db.ref('announcements').limitToLast(20).once('value'),
                db.ref('ads').once('value'),
                db.ref('stocks').once('value'),
                db.ref('auction').once('value'),
                db.ref('countries').once('value')
            ]);

            // Construct minimal response
            const data = {
                settings: settingsSnap.val() || {},
                realEstate: { grid: realEstateSnap.val() || [] },
                announcements: announcementsSnap.val() || {},
                ads: adsSnap.val() || {},
                stocks: stocksSnap.val() || {},
                auction: auctionSnap.val() || {},
                countries: countriesSnap.val() || {},
                // Explicitly EXCLUDE users, chats, transactions
            };
            
            return res.status(200).json(data);
        }

        // Extremely lightweight self-refresh
        if (action === 'fetch_my_lite_info') {
            const { userId } = payload;
            if (!userId) return res.status(400).json({});
            const safeKey = toSafeId(userId);
            const snap = await db.ref(`users/${safeKey}`).once('value');
            const u = snap.val();
            
            if (!u) return res.status(404).json({});

            // [EXTREME REDUCTION] Strip all heavy arrays
            if (u.transactions) delete u.transactions; 
            if (u.ledger) delete u.ledger;
            if (u.assetHistory) delete u.assetHistory;
            if (u.notifications) delete u.notifications; // Load separately if needed
            // Only send profilePic if it's a URL (short), not Base64 (long)
            if (u.profilePic && u.profilePic.startsWith('data:')) u.profilePic = null; 

            return res.status(200).json(u);
        }

        // Action for Admin to fetch all users efficiently (Super Lightweight)
        if (action === 'fetch_all_users_light') {
            const snapshot = await db.ref('users').once('value');
            const users = snapshot.val() || {};
            
            // Strict field selection
            const lightweightUsers: Record<string, any> = {};
            
            Object.keys(users).forEach(key => {
                const u = users[key];
                lightweightUsers[key] = {
                    name: u.name,
                    id: u.id,
                    email: u.email,
                    type: u.type,
                    subType: u.subType,
                    // Minimal financials for admin list
                    balanceKRW: u.balanceKRW || 0,
                    balanceUSD: u.balanceUSD || 0,
                    loans: u.loans || {}, 
                    approvalStatus: u.approvalStatus,
                    govtRole: u.govtRole,
                    customJob: u.customJob,
                    // EXCLUDE: profilePic, transactions, notifications, ledger, assetHistory
                };
            });
            
            return res.status(200).json({ users: lightweightUsers });
        }

        if (action === 'fetch_my_transactions') {
            const { userId, limit = 50 } = payload;
            const safeKey = toSafeId(userId);
            // Fetch only transactions
            const snap = await db.ref(`users/${safeKey}/transactions`).limitToLast(limit).once('value');
            return res.status(200).json({ transactions: Object.values(snap.val() || {}) });
        }
        
        if (action === 'fetch_wealth_stats') {
            const [usersSnap, settingsSnap, realEstateSnap] = await Promise.all([
                // We still need all users for accurate stats, but we process on server
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

            const { userId } = payload || {};
            let myRank = null;
            let myPercentile = null;
            
            if (userId) {
                assetList.sort((a,b) => b.total - a.total);
                const rankIndex = assetList.findIndex(a => a.id === userId);
                if (rankIndex !== -1) {
                    myRank = rankIndex + 1;
                    myPercentile = Math.max(1, Math.round((myRank / assetList.length) * 100));
                }
            }

            return res.status(200).json({ 
                buckets, 
                totalCount: citizens.length,
                myRank,
                myPercentile
            });
        }

        if (action === 'fetch_linked_accounts') { 
            const { linkedIds } = payload || {};
            if (!linkedIds || !Array.isArray(linkedIds) || linkedIds.length === 0) {
                return res.status(200).json({ accounts: [] });
            }

            const accounts = [];
            for (const id of linkedIds) {
                try {
                    if (!id) continue;
                    const safeKey = toSafeId(id);
                    const snap = await db.ref(`users/${safeKey}`).once('value');
                    let user = snap.val();

                    if (!user) {
                        const emailSnap = await db.ref('users').orderByChild('email').equalTo(id).limitToFirst(1).once('value');
                        if (emailSnap.exists()) {
                            const val = emailSnap.val();
                            user = Object.values(val)[0];
                        }
                    }

                    if (user) {
                        accounts.push({
                            id: user.id || id,
                            email: user.email || id,
                            name: user.name,
                            // Send minimal profile pic or nothing if too large
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
            
            // Only push transaction to history, limit history length if possible (RTDB doesn't support easy array push limit without reading)
            // We read sVal/rVal anyway, so we can limit.
            
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

        // Catch-all success
        return res.status(200).json({ success: true }); 

    } catch (e: any) {
        console.error("Server Action Error:", e);
        return res.status(500).json({ error: e.message });
    }
};
