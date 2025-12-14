
import { VercelRequest, VercelResponse } from '@vercel/node';
import * as admin from 'firebase-admin';
import * as bcrypt from 'bcryptjs';
import { db } from './db/db.js'; // Shared admin db instance

// 👇 CORS 설정 함수
const setCors = (res: VercelResponse) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

export default async (req: VercelRequest, res: VercelResponse) => {
    setCors(res); // 👈 함수 맨 시작 부분에서 실행!

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    const { action, payload } = req.body;

    try {
        // [Security 1] Fetch Initial Data (Sanitized)
        if (action === 'fetch_initial_data') {
            const snapshot = await db.ref().once('value');
            const fullData = snapshot.val() || {};

            if (fullData.users) {
                Object.keys(fullData.users).forEach(key => {
                    const u = fullData.users[key];
                    if (u) {
                        u.password = ""; // Remove password
                        u.pin = "";      // Remove PIN
                    }
                });
            }
            return res.status(200).json(fullData);
        }

        // [Security 2] Register or Update Password (Encrypted)
        if (action === 'register_or_update_pw') {
            const { userId, password, pin } = payload;
            const updates: any = {};
            
            if (password) {
                const hash = await bcrypt.hash(password, 10);
                updates[`users/${userId}/password`] = hash;
            }
            if (pin) {
                // PIN is stored as-is for now, or could be hashed if desired
                updates[`users/${userId}/pin`] = pin; 
            }
            
            if (Object.keys(updates).length > 0) {
                await db.ref().update(updates);
            }
            return res.status(200).json({ success: true });
        }

        // [Security 3] Server-side Login Verification
        if (action === 'login') {
            const { userId, password } = payload;
            
            // 1. Fetch user (with password)
            // Use loginId query or direct fetch depending on structure. 
            // Assuming payload.userId is the database Key (Name) or Login ID. 
            // For safety, we search by ID field if it exists, otherwise assume Key.
            
            let user = null;
            let userKey = '';

            // Try direct fetch first (assuming userId is the key/name)
            const snapshot = await db.ref(`users/${userId}`).once('value');
            if (snapshot.exists()) {
                user = snapshot.val();
                userKey = userId;
            } else {
                // Try searching by 'id' field
                const querySnap = await db.ref('users').orderByChild('id').equalTo(userId).limitToFirst(1).once('value');
                if (querySnap.exists()) {
                    const data = querySnap.val();
                    userKey = Object.keys(data)[0];
                    user = data[userKey];
                }
            }

            if (!user) return res.status(400).json({ error: "User not found" });

            // 2. Compare Password
            let match = false;
            
            // Check if password exists
            if (user.password) {
                // Try bcrypt comparison first
                // Note: bcrypt.compare throws if data is invalid bcrypt hash, so we wrap in try/catch or assume plain text fallback logic
                const isHash = user.password.startsWith('$2'); 
                
                if (isHash) {
                    match = await bcrypt.compare(password, user.password);
                } else {
                    // Fallback for legacy plain text passwords
                    match = (user.password === password);
                }
            }

            if (!match) {
                return res.status(401).json({ error: "Wrong password" });
            }

            // 3. Return sanitized user
            user.password = "";
            user.pin = "";
            // Ensure key is included if needed by client
            user.name = userKey; 
            
            return res.status(200).json({ success: true, user });
        }

        // --- EXISTING GAME LOGIC ---

        // --- 1. Basic Transfer ---
        if (action === 'transfer') {
            const { senderId, receiverId, amount, senderMemo, receiverMemo } = payload;
            await db.ref('users').transaction((users) => {
                if (!users || !users[senderId] || !users[receiverId]) return users;
                const sender = users[senderId];
                const receiver = users[receiverId];
                if (sender.balanceKRW < amount) return; // Abort

                sender.balanceKRW -= amount;
                receiver.balanceKRW += amount;

                const date = new Date().toISOString();
                const now = Date.now();
                if (!sender.transactions) sender.transactions = [];
                sender.transactions.push({ id: now, type: 'expense', amount: -amount, currency: 'KRW', description: senderMemo, date });
                if (!receiver.transactions) receiver.transactions = [];
                receiver.transactions.push({ id: now + 1, type: 'income', amount: amount, currency: 'KRW', description: receiverMemo, date });
                return users;
            });
            return res.status(200).json({ success: true });
        }

        // --- 2. Purchase (Mart) with Cashback ---
        if (action === 'purchase') {
            const { buyerId, items } = payload; // items: { sellerName, name, quantity, price, id }[]
            
            await db.ref().transaction((data) => {
                if (!data || !data.users || !data.users[buyerId]) return data;
                const buyer = data.users[buyerId];
                const bank = data.users['한국은행'];
                const vatRate = data.settings?.vat?.rate || 0;
                const vatTargets = data.settings?.vat?.targetMarts || [];
                const cashback = data.settings?.cashback || { enabled: false, rate: 0 };

                let totalCost = 0;
                let cashbackTotal = 0;

                // Validate total cost first
                items.forEach((item: any) => {
                    const isVatTarget = vatTargets.includes('all') || vatTargets.includes(item.sellerName);
                    const basePrice = item.price * item.quantity;
                    const vat = isVatTarget ? Math.floor(basePrice * (vatRate / 100)) : 0;
                    totalCost += (basePrice + vat);
                    
                    if (cashback.enabled && cashback.rate > 0) {
                        cashbackTotal += Math.floor((basePrice + vat) * (cashback.rate / 100));
                    }
                });

                if (buyer.balanceKRW < totalCost) return; // Abort

                const date = new Date().toISOString();
                let txId = Date.now();

                // Process Items
                items.forEach((item: any) => {
                    const seller = data.users[item.sellerName];
                    if (!seller) return;

                    const isVatTarget = vatTargets.includes('all') || vatTargets.includes(item.sellerName);
                    const basePrice = item.price * item.quantity;
                    const vat = isVatTarget ? Math.floor(basePrice * (vatRate / 100)) : 0;
                    const total = basePrice + vat;

                    buyer.balanceKRW -= total;
                    seller.balanceKRW += basePrice;
                    
                    if (vat > 0 && bank) {
                        bank.balanceKRW += vat;
                        if (!bank.transactions) bank.transactions = [];
                        bank.transactions.push({ id: txId++, type: 'tax', amount: vat, currency: 'KRW', description: `VAT (${seller.name})`, date });
                    }

                    if (!buyer.transactions) buyer.transactions = [];
                    buyer.transactions.push({ id: txId++, type: 'expense', amount: -total, currency: 'KRW', description: `구매: ${item.name} (${item.quantity}개)`, date });

                    if (!seller.transactions) seller.transactions = [];
                    seller.transactions.push({ id: txId++, type: 'income', amount: basePrice, currency: 'KRW', description: `판매: ${item.name} (${item.quantity}개)`, date });
                    
                    // Deduct Stock if tracked
                    if (seller.products && seller.products[item.id]) {
                        if (seller.products[item.id].stock > 0) {
                            seller.products[item.id].stock = Math.max(0, seller.products[item.id].stock - item.quantity);
                        }
                    }
                });

                // Apply Cashback
                if (cashbackTotal > 0 && bank && bank.balanceKRW >= cashbackTotal) {
                    buyer.balanceKRW += cashbackTotal;
                    bank.balanceKRW -= cashbackTotal;
                    
                    buyer.transactions.push({ id: txId++, type: 'cashback', amount: cashbackTotal, currency: 'KRW', description: `캐시백 환급 (${cashback.rate}%)`, date });
                    bank.transactions.push({ id: txId++, type: 'expense', amount: -cashbackTotal, currency: 'KRW', description: `캐시백 지급 (${buyer.name})`, date });
                }

                return data;
            });
            return res.status(200).json({ success: true });
        }

        // --- 3. Exchange ---
        if (action === 'exchange') {
            const { userId, fromCurrency, toCurrency, amount } = payload;
            
            await db.ref().transaction((data) => {
                if (!data || !data.users || !data.users[userId]) return data;
                const user = data.users[userId];
                const bank = data.users['한국은행'];
                const rates = data.settings.exchangeRate;
                const config = data.settings.exchangeConfig;

                // Rate Calculation
                let rate = 0;
                if (fromCurrency === 'KRW' && toCurrency === 'USD') rate = 1 / rates.KRW_USD;
                else if (fromCurrency === 'USD' && toCurrency === 'KRW') rate = rates.KRW_USD;
                
                if (rate === 0) return; // Invalid pair

                const finalToAmount = amount * rate;
                const fromKey = fromCurrency === 'KRW' ? 'balanceKRW' : 'balanceUSD';
                const toKey = toCurrency === 'KRW' ? 'balanceKRW' : 'balanceUSD';

                if (user[fromKey] < amount) return; // Insufficient funds

                // Auto Minting Logic check for Bank
                if (bank[toKey] < finalToAmount) {
                    if (config?.autoMintLimit && (finalToAmount - bank[toKey]) < config.autoMintLimit) {
                        bank[toKey] += (finalToAmount - bank[toKey]) * 1.5; // Mint deficit + buffer
                    } else {
                        return; // Bank bankrupt
                    }
                }

                user[fromKey] -= amount;
                user[toKey] += finalToAmount;
                bank[fromKey] += amount;
                bank[toKey] -= finalToAmount;

                const date = new Date().toISOString();
                const txId = Date.now();
                if (!user.transactions) user.transactions = [];
                user.transactions.push(
                    { id: txId, type: 'exchange', amount: -amount, currency: fromCurrency, description: `환전 (${fromCurrency}->${toCurrency})`, date },
                    { id: txId+1, type: 'exchange', amount: finalToAmount, currency: toCurrency, description: `환전 (${fromCurrency}->${toCurrency})`, date }
                );

                return data;
            });
            return res.status(200).json({ success: true });
        }

        // --- 4. Savings (Apply / Withdraw) ---
        if (action === 'apply_savings') {
            const { application } = payload; 
            await db.ref(`pendingApplications/${application.id}`).set(application);
            return res.status(200).json({ success: true });
        }

        if (action === 'withdraw_savings') {
            const { userId, depositId } = payload;
            await db.ref().transaction((data) => {
                if (!data.users[userId] || !data.termDeposits[depositId]) return data;
                const deposit = data.termDeposits[depositId];
                if (deposit.owner !== userId || deposit.status !== 'active') return;

                deposit.status = 'withdrawn';
                data.users[userId].balanceKRW += deposit.amount;
                
                const date = new Date().toISOString();
                if (!data.users[userId].transactions) data.users[userId].transactions = [];
                data.users[userId].transactions.push({
                    id: Date.now(), type: 'savings', amount: deposit.amount, currency: 'KRW', description: '예금 중도해지 (원금 반환)', date
                });
                
                return data;
            });
            return res.status(200).json({ success: true });
        }

        // --- 5. Loan (Apply / Repay) ---
        if (action === 'apply_loan') {
            const { application } = payload;
            await db.ref(`pendingApplications/${application.id}`).set(application);
            return res.status(200).json({ success: true });
        }

        if (action === 'repay_loan') {
            const { userId, loanId } = payload;
            await db.ref().transaction((data) => {
                const user = data.users?.[userId];
                if (!user || !user.loans) return data;
                
                // Find loan in array or object
                const loanKey = Object.keys(user.loans).find(k => user.loans[k].id === loanId);
                const loan = loanKey ? user.loans[loanKey] : null;

                if (!loan || loan.status !== 'approved') return;

                const repayAmount = Math.floor(loan.amount * (1 + loan.interestRate.rate / 100));
                if (user.balanceKRW < repayAmount) return; // Insufficient

                user.balanceKRW -= repayAmount;
                loan.status = 'repaid';
                
                // Pay Bank
                if (data.users['한국은행']) {
                    data.users['한국은행'].balanceKRW += repayAmount;
                }

                const date = new Date().toISOString();
                if (!user.transactions) user.transactions = [];
                user.transactions.push({
                    id: Date.now(), type: 'loan', amount: -repayAmount, currency: 'KRW', description: '대출 상환', date
                });

                return data;
            });
            return res.status(200).json({ success: true });
        }

        // --- 6. Real Estate (Buy Offer / Pay Rent) ---
        if (action === 'accept_offer') {
            const { offerId } = payload;
            await db.ref().transaction((data) => {
                const offer = data.realEstate?.offers?.[offerId];
                if (!offer || offer.status !== 'pending') return data;

                const buyer = data.users[offer.from];
                const seller = data.users[offer.to];
                const prop = data.realEstate.grid.find((p: any) => p.id === offer.propertyId);

                if (!buyer || !seller || !prop) return;
                if (buyer.balanceKRW < offer.price) {
                    offer.status = 'rejected'; // Insufficient funds auto-reject
                    return data; 
                }

                // Execute
                buyer.balanceKRW -= offer.price;
                seller.balanceKRW += offer.price;
                
                prop.owner = buyer.name;
                prop.tenant = null;
                prop.isJointOwnership = false;
                
                const date = new Date().toISOString();
                const now = Date.now();
                if(!buyer.transactions) buyer.transactions = [];
                buyer.transactions.push({id: now, type: 'expense', amount: -offer.price, currency: 'KRW', description: `부동산 #${prop.id} 구매`, date});
                
                if(!seller.transactions) seller.transactions = [];
                seller.transactions.push({id: now+1, type: 'income', amount: offer.price, currency: 'KRW', description: `부동산 #${prop.id} 판매`, date});

                offer.status = 'accepted';
                
                if(!data.realEstate.recentTransactions) data.realEstate.recentTransactions = [];
                data.realEstate.recentTransactions.unshift({ id: prop.id, seller: seller.name, buyer: buyer.name, price: offer.price, date });

                return data;
            });
            return res.status(200).json({ success: true });
        }

        if (action === 'pay_rent') {
            const { userId, ownerId, amount, propertyId } = payload;
            await db.ref().transaction((data) => {
                const tenant = data.users[userId];
                const owner = data.users[ownerId];
                if (!tenant || !owner) return;
                
                if (tenant.balanceKRW < amount) return; // Fail

                tenant.balanceKRW -= amount;
                owner.balanceKRW += amount;
                
                delete tenant.pendingRent; // Clear request

                const date = new Date().toISOString();
                const now = Date.now();
                if(!tenant.transactions) tenant.transactions = [];
                tenant.transactions.push({id: now, type: 'expense', amount: -amount, currency: 'KRW', description: `임대료 납부 (#${propertyId})`, date});
                
                if(!owner.transactions) owner.transactions = [];
                owner.transactions.push({id: now+1, type: 'income', amount: amount, currency: 'KRW', description: `임대료 수입 (#${propertyId})`, date});

                return data;
            });
            return res.status(200).json({ success: true });
        }

        // --- 7. Admin Features (Minting / Welfare) ---
        if (action === 'mint_currency') {
            const { amount, currency } = payload;
            await db.ref('users/한국은행').transaction((bank) => {
                if (!bank) return bank;
                if (currency === 'KRW') bank.balanceKRW += amount;
                else bank.balanceUSD += amount;
                
                if(!bank.transactions) bank.transactions = [];
                bank.transactions.push({
                    id: Date.now(), type: 'income', amount, currency, description: '화폐 발권 (Minting)', date: new Date().toISOString()
                });
                return bank;
            });
            return res.status(200).json({ success: true });
        }

        if (action === 'distribute_welfare') {
            const { targetUser, amount } = payload;
            await db.ref('users').transaction((users) => {
                const user = users[targetUser];
                const bank = users['한국은행'];
                if (!user || !bank) return users;
                
                if (bank.balanceKRW < amount) return;

                user.balanceKRW += amount;
                bank.balanceKRW -= amount;

                const date = new Date().toISOString();
                if(!user.transactions) user.transactions = [];
                user.transactions.push({ id: Date.now(), type: 'income', amount, currency: 'KRW', description: '복지 지원금', date });
                
                if(!bank.transactions) bank.transactions = [];
                bank.transactions.push({ id: Date.now()+1, type: 'expense', amount: -amount, currency: 'KRW', description: `${targetUser} 복지금`, date });

                return users;
            });
            return res.status(200).json({ success: true });
        }

        // --- Legacy Actions (Weekly Pay / Tax) ---
        if (action === 'weekly_pay') {
            const { amount, userIds } = payload;
            const bankId = '한국은행';
            
            await db.ref('users').transaction((users) => {
                if (!users || !users[bankId]) return users;
                const bank = users[bankId];
                userIds.forEach((uid: string) => {
                    if (users[uid]) {
                        users[uid].balanceKRW += amount;
                        bank.balanceKRW -= amount;
                        
                        const date = new Date().toISOString();
                        const now = Date.now() + Math.random();

                        if (!users[uid].transactions) users[uid].transactions = [];
                        users[uid].transactions.push({
                            id: now, type: 'income', amount: amount, currency: 'KRW', description: '주급 수령', date
                        });
                        
                        if (!users[uid].notifications) users[uid].notifications = [];
                        users[uid].notifications.unshift({
                            id: now.toString(), message: `주급 ₩${amount.toLocaleString()}가 지급되었습니다.`, read: false, isPersistent: false, date
                        });
                    }
                });
                return users;
            });
            return res.status(200).json({ success: true });
        }

        if (action === 'collect_tax') {
            const { taxSessionId, taxes, dueDate } = payload;
            const updates: any = {};
            
            taxes.forEach((tax: any) => {
                const taxId = `t_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                const pendingTax = {
                    id: taxId,
                    sessionId: taxSessionId,
                    amount: tax.amount,
                    type: tax.type,
                    dueDate: dueDate,
                    status: 'pending',
                    breakdown: tax.breakdown
                };
                const userRef = db.ref(`users/${tax.userId}/pendingTaxes`);
                const newRef = userRef.push();
                updates[`users/${tax.userId}/pendingTaxes/${newRef.key}`] = pendingTax;
                
                const notifRef = db.ref(`users/${tax.userId}/notifications`).push();
                updates[`users/${tax.userId}/notifications/${notifRef.key}`] = {
                    id: notifRef.key,
                    message: `[세금 고지] ${tax.type} ₩${tax.amount.toLocaleString()}가 부과되었습니다.`,
                    read: false, 
                    isPersistent: true,
                    date: new Date().toISOString(),
                    action: 'tax_pay',
                    actionData: pendingTax
                };
            });

            await db.ref().update(updates);
            return res.status(200).json({ success: true });
        }

        return res.status(400).send('Unknown action');

    } catch (error) {
        console.error("Game Action Error:", error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};
