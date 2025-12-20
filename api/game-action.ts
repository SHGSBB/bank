
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
        if (action === 'fetch_initial_data') {
            const snapshot = await db.ref('/').once('value');
            return res.status(200).json(snapshot.val() || {});
        }

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

        const financialActions = ['transfer', 'exchange', 'purchase', 'mint_currency', 'collect_tax', 'weekly_pay', 'distribute_welfare'];
        if (financialActions.includes(action)) {
            
            if (action === 'mint_currency') {
                const { amount, currency } = payload;
                const bankRef = db.ref('users/한국은행'); // Assuming standard name
                let bankSnap = await bankRef.once('value');
                
                // If BOK account doesn't exist, create it (Fix for minting bug)
                if (!bankSnap.exists()) {
                    await bankRef.set({
                        name: '한국은행',
                        type: 'admin',
                        balanceKRW: 0,
                        balanceUSD: 0
                    });
                    bankSnap = await bankRef.once('value');
                }

                const field = currency === 'KRW' ? 'balanceKRW' : 'balanceUSD';
                const current = bankSnap.val()[field] || 0;
                await bankRef.update({ [field]: current + amount });
                
                return res.status(200).json({ success: true, balance: current + amount });
            }

            if (action === 'weekly_pay' || action === 'distribute_welfare') {
                const { amount, userIds, targetUser } = payload; // userIds for weekly, targetUser for welfare
                const total = action === 'weekly_pay' ? amount * (userIds || []).length : amount;
                
                const bankRef = db.ref('users/한국은행');
                const bankSnap = await bankRef.once('value');
                if(!bankSnap.exists()) return res.status(400).json({error: "Bank account not found"});
                
                const bankBalance = bankSnap.val().balanceKRW || 0;
                if (bankBalance < total) return res.status(400).json({ error: "BANK_INSUFFICIENT_FUNDS" });

                await bankRef.update({ balanceKRW: bankBalance - total });
                
                // Distribute Logic handled in client mostly, but here we deducted bank balance.
                // In a full implementation, we should iterate users here. 
                // For this simulation, assuming client handles user credit after success, 
                // BUT better to handle credit here to be safe.
                
                if (action === 'weekly_pay' && userIds) {
                    for(const uid of userIds) {
                        // Assuming uid is name for legacy reasons or we resolve to ID
                        // This logic relies on exact key match in 'users' node
                        await db.ref(`users/${uid}/balanceKRW`).transaction(cur => (cur || 0) + amount);
                    }
                }
                if (action === 'distribute_welfare' && targetUser) {
                    await db.ref(`users/${targetUser}/balanceKRW`).transaction(cur => (cur || 0) + amount);
                }

                return res.status(200).json({ success: true });
            }

            if (action === 'collect_tax') {
                const { taxSessionId, taxes, dueDate } = payload;
                if (!taxes || !Array.isArray(taxes)) return res.status(400).json({ error: "Invalid tax data" });

                // Loop through taxes and add to user's pendingTaxes
                for (const tax of taxes) {
                    const userRef = db.ref(`users/${tax.userId}`);
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
                        const pendingTaxes = userSnap.val().pendingTaxes || [];
                        await userRef.update({ pendingTaxes: [...pendingTaxes, newTaxItem] });
                    }
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
