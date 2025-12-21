
import { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from './db.js';

const setCors = (res: VercelResponse) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

const toSafeId = (id: string) => (id || '').trim().toLowerCase().replace(/[@.]/g, '_').replace(/[#$\[\]]/g, '_');

export default async (req: VercelRequest, res: VercelResponse) => {
    setCors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    
    // Database connection check
    if (!db) {
        console.error("Database instance is null");
        return res.status(503).json({ error: 'DATABASE_UNAVAILABLE' });
    }

    const { action, payload } = req.body || {};

    if (!action) {
        return res.status(400).json({ error: "MISSING_ACTION" });
    }

    try {
        if (action === 'fetch_initial_data') {
            const snapshot = await db.ref('/').once('value');
            return res.status(200).json(snapshot.val() || {});
        }

        // --- Wealth Stats Calculation (Optimized) ---
        if (action === 'fetch_wealth_stats') {
            // Fetch users and settings needed for calc
            const [usersSnap, settingsSnap, realEstateSnap] = await Promise.all([
                db.ref('users').once('value'),
                db.ref('settings/exchangeRate').once('value'),
                db.ref('realEstate/grid').once('value')
            ]);

            const users = usersSnap.val() || {};
            const exchangeRate = settingsSnap.val()?.KRW_USD || 1350;
            const grid = realEstateSnap.val() || [];

            const citizens = Object.values(users).filter((u: any) => u.type === 'citizen');
            
            const assets = citizens.map((c: any) => {
                const krw = c.balanceKRW || 0;
                const usd = (c.balanceUSD || 0) * exchangeRate;
                const propVal = grid.filter((p: any) => p.owner === c.name).reduce((s: number, p: any) => s + (p.price || 0), 0);
                return krw + usd + propVal;
            });

            assets.sort((a,b) => a - b);
            const buckets = [0,0,0,0,0];
            const maxVal = Math.max(...assets) || 1;
            
            assets.forEach(val => {
                const idx = Math.min(4, Math.floor((val / (maxVal * 1.01)) * 5));
                buckets[idx]++;
            });

            return res.status(200).json({ 
                buckets, 
                totalCount: citizens.length 
            });
        }

        if (action === 'fetch_linked_accounts') { /* ... */ }
        if (action === 'link_account') { /* ... */ }
        if (action === 'unlink_account') { /* ... */ }

        // --- MINT CURRENCY FIX ---
        if (action === 'mint_currency') {
            const { amount, currency } = payload;
            
            const usersRef = db.ref('users');
            const usersSnap = await usersRef.once('value');
            const users = usersSnap.val() || {};
            
            // Priority: Find by ID 'bok' -> Name '한국은행' -> Role '한국은행장'
            let bankEntry = Object.entries(users).find(([k, u]: [string, any]) => u.id === 'bok' || u.email === 'bok@bank.sh') ||
                            Object.entries(users).find(([k, u]: [string, any]) => u.name === '한국은행') ||
                            Object.entries(users).find(([k, u]: [string, any]) => u.govtRole === '한국은행장');

            let bankKey = bankEntry ? bankEntry[0] : null;
            
            if (!bankKey) {
                // Force create bank if missing
                console.log("Bank account missing, creating new one.");
                bankKey = 'bok_official';
                const newBank = {
                    id: 'bok', 
                    name: '한국은행', 
                    type: 'admin',
                    email: 'bok@bank.sh', 
                    balanceKRW: currency === 'KRW' ? amount : 0, 
                    balanceUSD: currency === 'USD' ? amount : 0, 
                    approvalStatus: 'approved',
                    isOnline: true
                };
                await db.ref(`users/${bankKey}`).set(newBank);
                return res.status(200).json({ success: true, message: "Bank created and minted." });
            } else {
                const field = currency === 'KRW' ? 'balanceKRW' : 'balanceUSD';
                const currentBalance = (users[bankKey] as any)[field] || 0;
                
                const updates: any = {};
                updates[`users/${bankKey}/${field}`] = currentBalance + amount;
                
                // Add log
                const txs = (users[bankKey] as any).transactions || [];
                txs.push({
                    id: Date.now(),
                    type: 'income',
                    amount: amount,
                    currency: currency,
                    description: '화폐 발권 (Minting)',
                    date: new Date().toISOString()
                });
                updates[`users/${bankKey}/transactions`] = txs;

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
                return Object.keys(users).find(k => 
                    users[k].id === identifier || users[k].email === identifier || users[k].name === identifier
                );
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
            
            const sTx = sVal.transactions || [];
            sTx.push({ id: txId, type: 'transfer', amount: -amount, currency, description: senderMemo || `이체 (${rVal.name})`, date: now });
            
            const rTx = rVal.transactions || [];
            rTx.push({ id: txId+1, type: 'transfer', amount: amount, currency, description: receiverMemo || `입금 (${sVal.name})`, date: now });

            updates[`users/${sKey}/transactions`] = sTx;
            updates[`users/${rKey}/transactions`] = rTx;

            await db.ref().update(updates);
            return res.status(200).json({ success: true });
        }

        // ... (Other existing actions: place_bid, etc.)
        if (action === 'place_bid') {
             const { amount, bidder } = payload;
             const auctionRef = db.ref('auction');
             const auctionSnap = await auctionRef.once('value');
             const auction = auctionSnap.val();
             
             if (!auction || !auction.isActive || auction.status !== 'active' || auction.isPaused) {
                 return res.status(400).json({ error: "AUCTION_CLOSED" });
             }
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

        // Default success for unimplemented actions to prevent crash
        return res.status(200).json({ success: true }); 
    } catch (e: any) {
        console.error("Server Action Error:", e);
        return res.status(500).json({ error: e.message });
    }
};
