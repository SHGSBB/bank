import { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from './db.js';

// [설정] CORS 및 헤더 설정
const setCors = (res: VercelResponse) => {
    res.setHeader('Access-Control-Allow-Origin', 'https://sunghwa-cffff.web.app'); // 프론트엔드 주소 확인 필요
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
};

// [유틸] ID 안전 변환
const toSafeId = (id: string) => 
    (id || '').trim().toLowerCase()
    .replace(/[@.+]/g, '_')
    .replace(/[#$\[\]]/g, '_');

// [유틸] 사용자 실제 키 찾기 (이메일/ID/이름 기반)
const findRealUserKey = async (identifier: string, allUsersCache?: any): Promise<string | null> => {
    if (!identifier) return null;
    const safeInput = toSafeId(identifier);
    
    let users = allUsersCache;
    if (!users) {
        const snap = await db.ref('users').once('value');
        users = snap.val() || {};
    }

    if (users[safeInput]) return safeInput;

    const foundKey = Object.keys(users).find(key => {
        const u = users[key];
        if (!u) return false;
        if (u.email && (u.email === identifier || toSafeId(u.email) === safeInput)) return true;
        if (u.id && (u.id === identifier || toSafeId(u.id) === safeInput)) return true;
        if (u.name === identifier) return true;
        return false;
    });

    return foundKey || null;
};

// [메인 핸들러]
export default async (req: VercelRequest, res: VercelResponse) => {
    setCors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
    if (!db) return res.status(503).json({ error: 'DATABASE_UNAVAILABLE' });

    const { action, payload } = req.body || {};
    if (!action) return res.status(400).json({ error: "MISSING_ACTION" });

    try {
        const now = new Date().toISOString();
        
        // =========================================================
        // [1] DB 구조 복구 (기존 로직 유지)
        // =========================================================
        if (action === 'fix_database_structure') {
            const snapshot = await db.ref('users').once('value');
            const users = snapshot.val() || {};
            const updates: any = {};
            let fixedCount = 0;
            const grouped: Record<string, string[]> = {}; 

            Object.keys(users).forEach(key => {
                const u = users[key];
                const email = u.email || (key.includes('_') && key.includes('@') ? key.replace(/_/g, '.') : null); 
                if (email && email.includes('@')) {
                    const safeKey = toSafeId(email);
                    if (!grouped[safeKey]) grouped[safeKey] = [];
                    grouped[safeKey].push(key);
                }
            });

            for (const [targetKey, keys] of Object.entries(grouped)) {
                let mergedUser: any = { 
                    balanceKRW: 0, balanceUSD: 0, transactions: [], notifications: [], products: {}
                };
                keys.sort((a, b) => (a === targetKey ? 1 : -1));

                for (const k of keys) {
                    const u = users[k];
                    if (u.email) mergedUser.email = u.email;
                    if (u.id) mergedUser.id = u.id;
                    if (u.name) mergedUser.name = u.name;
                    if (u.password) mergedUser.password = u.password;
                    if (u.pin) { mergedUser.pin = u.pin; mergedUser.pinLength = u.pinLength; }
                    if (u.type) mergedUser.type = u.type;
                    if (u.subType) mergedUser.subType = u.subType;
                    if (u.govtRole) mergedUser.govtRole = u.govtRole;
                    if (u.approvalStatus && u.approvalStatus !== 'pending') mergedUser.approvalStatus = u.approvalStatus;

                    mergedUser.balanceKRW = Math.max(mergedUser.balanceKRW, u.balanceKRW || 0);
                    mergedUser.balanceUSD = Math.max(mergedUser.balanceUSD, u.balanceUSD || 0);
                    
                    if (u.transactions) mergedUser.transactions = [...mergedUser.transactions, ...(Array.isArray(u.transactions) ? u.transactions : Object.values(u.transactions))];
                    if (u.notifications) mergedUser.notifications = { ...mergedUser.notifications, ...u.notifications };
                    if (u.products) mergedUser.products = { ...mergedUser.products, ...u.products };
                    
                    if (k !== targetKey) {
                        updates[`users/${k}`] = null;
                        fixedCount++;
                    }
                }
                updates[`users/${targetKey}`] = mergedUser;
            }

            if (Object.keys(updates).length > 0) await db.ref().update(updates);
            return res.status(200).json({ success: true, message: `DB 복구 완료: ${fixedCount}개 노드 통합됨` });
        }

        // =========================================================
        // [2] 회원가입 승인/거절 (관리자)
        // =========================================================
        if (action === 'approve_user') {
            const { userId, approve } = payload;
            const targetKey = await findRealUserKey(userId);
            if (!targetKey) return res.status(404).json({ error: "USER_NOT_FOUND" });

            if (approve) {
                await db.ref(`users/${targetKey}`).update({ approvalStatus: 'approved' });
                const notifId = `n_${Date.now()}`;
                await db.ref(`users/${targetKey}/notifications/${notifId}`).set({
                    id: notifId, message: "회원가입이 승인되었습니다.", read: false, date: now, type: 'success', timestamp: Date.now()
                });
            } else {
                await db.ref(`users/${targetKey}`).remove();
            }
            return res.status(200).json({ success: true });
        }

        // =========================================================
        // [3] 화폐 발권 (한국은행/관리자)
        // =========================================================
        if (action === 'mint_currency') {
            const amount = Number(payload.amount || 0);
            const currency = payload.currency || 'KRW';
            const field = currency === 'KRW' ? 'balanceKRW' : 'balanceUSD';
            
            const allUsersSnap = await db.ref('users').once('value');
            const users = allUsersSnap.val() || {};
            
            let targetKey = await findRealUserKey(payload.userId, users);
            if (!targetKey) {
                targetKey = Object.keys(users).find(k => users[k].govtRole === '한국은행장' || users[k].name === '한국은행' || users[k].type === 'root') || null;
            }

            if (!targetKey) return res.status(404).json({ error: "Admin/Bank account not found." });

            await db.ref(`users/${targetKey}/${field}`).transaction((curr) => (curr || 0) + amount);
            
            const txId = `tx_${Date.now()}`;
            await db.ref(`users/${targetKey}/transactions/${txId}`).set({ 
                id: Date.now(), type: 'income', amount: amount, currency, description: '화폐 발권 (Minting)', date: now 
            });

            return res.status(200).json({ success: true });
        }

        // =========================================================
        // [4] 이체 (송금)
        // =========================================================
        if (action === 'transfer') {
            const { senderId, receiverId, amount, senderMemo, receiverMemo, currency = 'KRW' } = payload;
            const numAmount = Number(amount);
            
            const allUsersSnap = await db.ref('users').once('value');
            const allUsers = allUsersSnap.val();

            const sKey = await findRealUserKey(senderId, allUsers);
            const rKey = await findRealUserKey(receiverId, allUsers);
            
            if (!sKey || !rKey) return res.status(404).json({ error: "사용자를 찾을 수 없습니다." });
            if (sKey === rKey) return res.status(400).json({ error: "자신에게 이체할 수 없습니다." });
            
            const sVal = allUsers[sKey];
            const rVal = allUsers[rKey];
            const balField = currency === 'USD' ? 'balanceUSD' : 'balanceKRW';

            if ((Number(sVal[balField]) || 0) < numAmount) return res.status(400).json({ error: "잔액 부족" });

            const updates: any = {};
            updates[`users/${sKey}/${balField}`] = Number(sVal[balField] || 0) - numAmount;
            updates[`users/${rKey}/${balField}`] = Number(rVal[balField] || 0) + numAmount;
            
            const txId = Date.now();
            updates[`users/${sKey}/transactions/tx_${txId}_s`] = { 
                id: txId, type: 'transfer', amount: -numAmount, currency, description: senderMemo || `이체 (${rVal.name})`, date: now 
            };
            updates[`users/${rKey}/transactions/tx_${txId}_r`] = { 
                id: txId+1, type: 'transfer', amount: numAmount, currency, description: receiverMemo || `입금 (${sVal.name})`, date: now 
            };
            updates[`users/${rKey}/notifications/n_${txId}`] = {
                id: `n_${txId}`, message: `${sVal.name}님으로부터 ₩${numAmount.toLocaleString()} 입금되었습니다.`,
                read: false, date: now, type: 'success', timestamp: Date.now()
            };

            await db.ref().update(updates);
            return res.status(200).json({ success: true });
        }

        // =========================================================
        // [5] 구매 (마트/상점)
        // =========================================================
        if (action === 'purchase') {
            const { buyerId, items } = payload;
            const allUsersSnap = await db.ref('users').once('value');
            const allUsers = allUsersSnap.val();

            const buyerKey = await findRealUserKey(buyerId, allUsers);
            if (!buyerKey) return res.status(404).json({ error: "Buyer not found" });

            let totalCost = 0;
            const updates: any = {};
            const txIdBase = Date.now();

            for (const [idx, item] of items.entries()) {
                const cost = item.price * item.quantity;
                totalCost += cost;
                
                const sellerKey = await findRealUserKey(item.sellerName, allUsers);
                if (sellerKey) {
                    const sellerBal = allUsers[sellerKey].balanceKRW || 0;
                    updates[`users/${sellerKey}/balanceKRW`] = sellerBal + cost;
                    updates[`users/${sellerKey}/transactions/tx_${txIdBase}_${idx}_s`] = {
                        id: txIdBase + idx, type: 'income', amount: cost, currency: 'KRW', description: `판매: ${item.name} (${item.quantity}개)`, date: now
                    };
                }
            }

            const buyerBal = allUsers[buyerKey].balanceKRW || 0;
            if (buyerBal < totalCost) return res.status(400).json({ error: "Insufficient funds" });

            updates[`users/${buyerKey}/balanceKRW`] = buyerBal - totalCost;
            updates[`users/${buyerKey}/transactions/tx_${txIdBase}_b`] = {
                id: txIdBase, type: 'expense', amount: -totalCost, currency: 'KRW', description: `구매: ${items.length}건 (총 ₩${totalCost.toLocaleString()})`, date: now
            };

            await db.ref().update(updates);
            return res.status(200).json({ success: true });
        }

        // =========================================================
        // [6] 주급 지급 (NEW)
        // =========================================================
        if (action === 'give_weekly_pay') {
            const { amount, targetGroup, currency = 'KRW' } = payload;
            const allUsersSnap = await db.ref('users').once('value');
            const users = allUsersSnap.val() || {};
            const updates: any = {};
            let count = 0;
            const txIdBase = Date.now();

            Object.keys(users).forEach((key, idx) => {
                const u = users[key];
                if (!u) return;
                let isTarget = false;
                if (targetGroup === 'all') isTarget = true;
                else if (targetGroup === 'citizen' && u.type === 'citizen') isTarget = true;
                else if (targetGroup === 'govt' && u.type === 'government') isTarget = true;
                
                if (u.type === 'admin' || u.type === 'root') isTarget = false;

                if (isTarget) {
                    const field = currency === 'USD' ? 'balanceUSD' : 'balanceKRW';
                    const currentBal = Number(u[field] || 0);
                    updates[`users/${key}/${field}`] = currentBal + Number(amount);
                    updates[`users/${key}/transactions/tx_${txIdBase}_${idx}`] = {
                        id: txIdBase + idx, type: 'income', amount: Number(amount), currency, description: `주급 지급`, date: now
                    };
                    updates[`users/${key}/notifications/n_${txIdBase}_${idx}`] = {
                        id: `n_${txIdBase}_${idx}`, message: `주급이 지급되었습니다. (+${Number(amount).toLocaleString()})`, read: false, date: now, type: 'info', timestamp: Date.now()
                    };
                    count++;
                }
            });
            if (count > 0) await db.ref().update(updates);
            return res.status(200).json({ success: true, message: `${count}명 지급 완료` });
        }

        // =========================================================
        // [7] 세금 징수 (NEW)
        // =========================================================
        if (action === 'collect_tax') {
            const { rate } = payload;
            const taxRate = Number(rate) / 100;
            const allUsersSnap = await db.ref('users').once('value');
            const users = allUsersSnap.val() || {};
            const updates: any = {};
            let count = 0;
            let totalCollected = 0;
            const txIdBase = Date.now();

            Object.keys(users).forEach((key, idx) => {
                const u = users[key];
                if (!u || u.type === 'admin' || u.type === 'root' || u.type === 'government') return;
                const currentBal = Number(u.balanceKRW || 0);
                if (currentBal > 0) {
                    const taxAmount = Math.floor(currentBal * taxRate);
                    if (taxAmount > 0) {
                        updates[`users/${key}/balanceKRW`] = currentBal - taxAmount;
                        updates[`users/${key}/transactions/tx_${txIdBase}_${idx}`] = {
                            id: txIdBase + idx, type: 'expense', amount: -taxAmount, currency: 'KRW', description: `세금 징수 (${rate}%)`, date: now
                        };
                        count++;
                        totalCollected += taxAmount;
                    }
                }
            });
            if (count > 0) await db.ref().update(updates);
            return res.status(200).json({ success: true, message: `${count}명 징수 완료` });
        }

        // =========================================================
        // [8] 지원금/예산 지급 (NEW)
        // =========================================================
        if (action === 'give_grant') {
            const { targetUserId, amount, reason, currency = 'KRW' } = payload;
            const targetKey = await findRealUserKey(targetUserId);
            if (!targetKey) return res.status(404).json({ error: "User not found" });

            const field = currency === 'USD' ? 'balanceUSD' : 'balanceKRW';
            const numAmount = Number(amount);

            await db.ref(`users/${targetKey}/${field}`).transaction((curr) => (curr || 0) + numAmount);
            await db.ref(`users/${targetKey}/transactions/tx_${Date.now()}`).set({
                id: Date.now(), type: 'income', amount: numAmount, currency, description: reason || '지원금 지급', date: now
            });
            return res.status(200).json({ success: true });
        }

        // =========================================================
        // [9] 대출/신청 관리 (NEW)
        // =========================================================
        if (action === 'process_loan') {
            const { userId, loanId, decision } = payload;
            const targetKey = await findRealUserKey(userId);
            if (!targetKey) return res.status(404).json({ error: "User not found" });

            const loanRef = db.ref(`users/${targetKey}/loans`);
            const snap = await loanRef.once('value');
            const loans = snap.val() || [];
            
            let loanKey: string | null = null;
            let targetLoan: any = null;

            if (Array.isArray(loans)) {
                const idx = loans.findIndex(l => l.id === loanId);
                if (idx !== -1) { loanKey = idx.toString(); targetLoan = loans[idx]; }
            } else {
                loanKey = Object.keys(loans).find(k => loans[k].id === loanId) || null;
                if (loanKey) targetLoan = loans[loanKey];
            }

            if (!targetLoan || !loanKey) return res.status(404).json({ error: "Loan not found" });

            const updates: any = {};
            updates[`users/${targetKey}/loans/${loanKey}/status`] = decision;
            
            if (decision === 'approved') {
                const field = targetLoan.currency === 'USD' ? 'balanceUSD' : 'balanceKRW';
                const amount = Number(targetLoan.amount);
                const userSnap = await db.ref(`users/${targetKey}/${field}`).once('value');
                const currentBal = Number(userSnap.val() || 0);
                
                updates[`users/${targetKey}/${field}`] = currentBal + amount;
                updates[`users/${targetKey}/loans/${loanKey}/startDate`] = now;
                updates[`users/${targetKey}/transactions/tx_${Date.now()}`] = {
                    id: Date.now(), type: 'income', amount, currency: targetLoan.currency, description: `대출 실행`, date: now
                };
            }
            await db.ref().update(updates);
            return res.status(200).json({ success: true });
        }

        // =========================================================
        // [10] 운영/시스템 설정 (NEW)
        // =========================================================
        if (action === 'update_settings') {
            const { settings } = payload;
            if (!settings) return res.status(400).json({ error: "No settings provided" });
            await db.ref('settings').update(settings);
            return res.status(200).json({ success: true });
        }

        // =========================================================
        // [11] 주식 관리 (NEW)
        // =========================================================
        if (action === 'manage_stock') {
            const { stockId, price, fluctuation } = payload;
            await db.ref(`stocks/${stockId}`).update({
                currentPrice: Number(price),
                fluctuation: fluctuation || 0,
                lastUpdated: now
            });
            return res.status(200).json({ success: true });
        }

        // =========================================================
        // [12] 부동산 관리 (NEW)
        // =========================================================
        if (action === 'manage_real_estate') {
            const { regionId, ownerId, price } = payload;
            const updates: any = {};
            if (ownerId) updates[`realEstate/grid/${regionId}/owner`] = ownerId;
            if (price) updates[`realEstate/grid/${regionId}/price`] = Number(price);
            if (Object.keys(updates).length > 0) await db.ref().update(updates);
            return res.status(200).json({ success: true });
        }

        // =========================================================
        // [13] 국채 발행 (NEW)
        // =========================================================
        if (action === 'issue_bond') {
             const { name, rate, price, duration, totalAmount } = payload;
             const bondId = `bond_${Date.now()}`;
             await db.ref(`bonds/${bondId}`).set({
                 id: bondId, name, rate: Number(rate), price: Number(price), duration: Number(duration),
                 totalAmount: Number(totalAmount), soldAmount: 0, date: now, status: 'active'
             });
             return res.status(200).json({ success: true });
        }

        // =========================================================
        // [14] 사용자 전체 조회 (경량화)
        // =========================================================
        if (action === 'fetch_all_users_light') {
            const snapshot = await db.ref('users').once('value');
            const users = snapshot.val() || {};
            const lightweightUsers: Record<string, any> = {};
            Object.keys(users).forEach(key => {
                const u = users[key];
                if (!u.email && !u.id && !u.name) return;
                lightweightUsers[key] = {
                    name: u.name, id: u.id, email: u.email, type: u.type, subType: u.subType,
                    balanceKRW: u.balanceKRW || 0, balanceUSD: u.balanceUSD || 0,
                    loans: u.loans || {}, approvalStatus: u.approvalStatus, govtRole: u.govtRole,
                    customJob: u.customJob, products: u.products, isSuspended: u.isSuspended,
                    linkedAccounts: u.linkedAccounts
                };
            });
            return res.status(200).json({ users: lightweightUsers });
        }

        // 매칭되는 Action 없을 경우
        return res.status(200).json({ success: true, message: "No Action Matched (Default OK)" });

    } catch (e: any) {
        console.error("API Error:", e);
        return res.status(500).json({ error: e.message });
    }
};