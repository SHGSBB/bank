
export interface UserPreferences {
    theme?: 'system' | 'light' | 'dark';
    isEasyMode?: boolean;
    skipPinForCommonActions?: boolean;
    vibration?: boolean;
    assetDisplayMode?: 'full' | 'rounded';
    biometricEnabled?: boolean;
    saveLoginHistory?: boolean;
    use2FA?: boolean;
}

export interface IDCard {
    issueDate: string;
    address: string;
    residentNumber?: string;
}

export interface Transaction {
    id: number | string;
    type: 'income' | 'expense' | 'transfer' | 'exchange' | 'tax' | 'loan' | 'savings' | 'vat' | 'seize' | 'auction' | 'stock_buy' | 'stock_sell' | 'dividend' | 'fine' | 'cashback';
    amount: number;
    currency: 'KRW' | 'USD';
    description: string;
    date: string;
}

export interface LedgerItem {
    id: string;
    date: string; // YYYY-MM-DD
    type: 'income' | 'expense';
    category: string;
    description: string;
    amount: number;
    isScheduled: boolean; // 예정 내역 여부
    isCompleted?: boolean; // 실제 실행 여부
}

export interface ScheduledTransfer {
    id: string;
    type: 'reserved' | 'recurring';
    fromUser: string;
    toUser: string;
    amount: number;
    description?: string;
    status: 'active' | 'completed' | 'cancelled';
    
    // For Reserved
    scheduledTime?: string; // ISO String
    
    // For Recurring
    recurringConfig?: {
        startDate: string;
        endDate: string;
        frequencyType: 'daily' | 'weekly' | 'monthly';
        frequencyValue: number; // e.g., every 3 days, or day of week (0-6), or day of month (1-31)
        nextRunTime: string;
    };
}

export interface PendingTax {
    id: string;
    sessionId: string;
    amount: number;
    type: 'real_estate' | 'income' | 'asset' | 'fine' | 'acquisition';
    dueDate: string;
    status: 'pending' | 'paid';
    breakdown: string;
    penalty?: number;
}

export interface StockHolding {
    quantity: number;
    averagePrice: number;
}

export interface Loan {
    id: string;
    amount: number;
    interestRate: { rate: number, periodWeeks: number };
    applyDate: string;
    repaymentDate: string;
    status: 'pending' | 'approved' | 'rejected' | 'repaid' | 'collateral_pending';
    collateral?: string | null;
}

export interface ProductVariant {
    name: string;
    priceKRW: number;
    priceUSD: number;
}

export interface Product {
    id: string;
    name: string;
    price: number;
    priceUSD?: number;
    description?: string;
    image?: string | null;
    stock?: number;
    isOnEvent?: boolean;
    eventDiscountPercent?: number;
    variants?: ProductVariant[];
    priceDisplayMethod?: 'min' | 'avg';
}

export type UserSubType = 'personal' | 'business' | 'govt' | 'teacher';
export type GovtBranch = 'executive' | 'legislative' | 'judicial';

export interface User {
    name: string;
    id?: string;
    email?: string;
    password?: string;
    type: 'citizen' | 'mart' | 'government' | 'admin' | 'teacher' | 'root' | 'official';
    subType?: UserSubType;
    balanceKRW: number;
    balanceUSD: number;
    pin?: string | null;
    pinLength?: number;
    profilePic?: string | null;
    nickname?: string;
    customJob?: string;
    statusMessage?: string;
    phoneNumber?: string;
    isOnline?: boolean;
    lastActive?: number;
    lastSessionId?: string;
    approvalStatus?: 'pending' | 'approved' | 'rejected';
    isSuspended?: boolean;
    failedLoginAttempts?: number;
    lockoutUntil?: number;
    bankruptcyStatus?: 'pending' | 'approved' | 'rejected';
    linkedAccounts?: string[];
    linkedUser?: string;
    jointOwners?: string[];
    govtBranch?: GovtBranch[];
    govtRole?: string;
    isPresident?: boolean;
    isHeadOfDept?: boolean;
    isCorporation?: boolean;
    products?: Record<string, Product>;
    gender?: 'male' | 'female';
    birthDate?: string;
    idCard?: IDCard;
    preferences?: UserPreferences;
    transactions?: Transaction[];
    ledger?: Record<string, LedgerItem>; // 가계부
    autoTransfers?: Record<string, ScheduledTransfer>; // 자동이체
    notifications?: ToastNotification[] | Record<string, ToastNotification>;
    pendingTaxes?: PendingTax[];
    pendingTax?: PendingTax;
    pendingRent?: RentRequest;
    assetHistory?: AssetHistoryPoint[];
    stockHoldings?: Record<string, StockHolding>;
    realizedStockProfit?: number;
    loans?: Loan[] | Record<string, Loan>;
    blockedUsers?: string[];
    unreadMessageCount?: number;
    consents?: Record<string, boolean>;
    countryId?: string;
    fcmToken?: string;
}

export interface ToastNotification {
    id: string;
    message: string;
    read: boolean;
    isPersistent?: boolean;
    date: string;
    type: 'info' | 'success' | 'warning' | 'error' | 'tax';
    title?: string;
    action?: string | null;
    actionData?: any;
    isPaid?: boolean;
    timestamp: number;
}

export interface AssetHistoryPoint {
    date: string;
    totalValue: number;
}

export interface TaxSession {
    id: string;
    type: 'real_estate' | 'income' | 'asset' | 'fine' | 'acquisition';
    amount: number;
    totalTarget: number;
    collectedAmount: number;
    startDate: string;
    dueDate: string;
    status: 'active' | 'closed';
    targetUsers: string[];
    paidUsers: string[];
}

export interface SignupSession {
    id: string;
    name: string;
    phone: string;
    code: string;
    createdAt: number;
    status: 'active' | 'expired';
    attempts?: number;
}

export interface StickyNote {
    id: string;
    content: string;
    x: number;
    y: number;
    color: string;
    author: string;
}

export interface Ad {
    id: string;
    businessName: string;
    content: string;
    imageUrl?: string;
    fee: number;
    status: 'pending' | 'active' | 'ended';
    type?: 'banner' | 'popup';
    owner?: string;
    startDate?: number;
}

export interface PolicyRequest {
    id: string;
    type: 'tax_rate' | 'interest_rate' | 'standard';
    requester: string;
    data: any;
    description: string;
    status: 'pending' | 'approved' | 'rejected';
    requestedAt: string;
    targetValue?: any;
    proposer?: string;
    timestamp?: number;
    votes?: Record<string, string>;
}

export interface MintingRequest {
    id: string;
    amount: number;
    currency: 'KRW' | 'USD';
    requester: string;
    status: 'pending' | 'approved' | 'rejected';
    timestamp?: number;
    requestedBy?: string;
}

export interface RealEstateCell {
    id: number;
    owner: string | null;
    tenant: string | null;
    price: number;
    isMerged?: boolean;
    isJointOwnership?: boolean;
    jointOwners?: string[];
}

export interface RealEstateOffer {
    id: string;
    propertyId: number;
    from: string;
    to: string;
    price: number;
    status: 'pending' | 'accepted' | 'rejected';
}

export interface RentRequest {
    propertyId: number;
    owner: string;
    amount: number;
    cartId?: string;
}

export interface Announcement {
    id: number;
    content: string;
    category?: AnnouncementCategory;
    isImportant: boolean;
    showOnStartup?: boolean;
    displayPeriodDays: number;
    date: string;
}

export type AnnouncementCategory = 'general' | 'service_stop' | 'service_end' | 'terms_update' | 'standard_update';

export interface TermDeposit {
    id: string;
    owner: string;
    amount: number;
    startDate: string;
    endDate: string;
    interestRate: number;
    status: 'active' | 'withdrawn' | 'completed';
    type: 'regular' | 'term' | 'installment';
}

export interface CartItem extends Product {
    cartId: string;
    quantity: number;
    sellerName: string;
    selectedVariant?: ProductVariant;
    selected?: boolean;
}

export interface ProgressiveRule {
    threshold: number;
    type: 'percent' | 'fixed';
    value: number;
}

export interface CompetencyWages {
    prosecutor: number;
    legislator: number;
    speaker: number;
    judge: number;
    chiefJustice: number;
    [key: string]: number;
}

export interface WelfareStandards {
    targetThreshold: number;
    housingSupport: number;
    additionalRules?: string; 
    housingSupportRules?: string;
}

export interface Standards {
    taxRateProperty: number;
    taxRateIncome: number;
    taxRateAcquisition?: number;
    weeklyWage: number;
    cleanerWage: number;
    competencyWageEnabled?: boolean;
    competencyWages?: CompetencyWages;
    welfare?: WelfareStandards;
    progressivePropertyRules?: ProgressiveRule[];
    progressiveIncomeRules?: ProgressiveRule[];
}

export interface Application {
    id: string;
    type: 'loan' | 'savings' | 'ipo';
    applicantName: string;
    amount: number;
    requestedDate: string;
    status: 'pending' | 'approved' | 'rejected';
    loanId?: string;
    savingsType?: 'regular' | 'term' | 'installment';
    collateral?: string | null;
    collateralStatus?: 'proposed_by_user' | 'proposed_by_admin' | 'accepted';
    durationWeeks?: number;
}

export interface ExchangeConfig {
    pairs: { KRW_USD: boolean };
    rates: { KRW_USD: number };
    isAutoStopEnabled?: boolean;
    autoStopThresholdUSD?: number;
    autoMintLimit?: number;
}

export interface Country {
    id: string;
    name: string;
    currency: 'KRW' | 'USD';
}

export interface AuctionBid {
    bidder: string;
    amount: number;
    timestamp: number;
    contributors?: { name: string, amount: number }[];
}

export interface Auction {
    id?: string;
    isActive: boolean;
    status: 'active' | 'ended' | 'deferred';
    startTime: string;
    endTime?: number;
    timerDuration?: number;
    item: { name: string, description: string, image?: string | null };
    startingPrice: number;
    currentPrice: number;
    winner?: string;
    winningBid?: number;
    bids: AuctionBid[];
    teams?: Record<string, { name: string, status: 'pending' | 'accepted' }[]>;
    isPaused?: boolean;
}

export interface StockHistory {
    date: string;
    price: number;
}

export interface StockOrder {
    id: string;
    userName: string;
    price: number;
    quantity: number;
    timestamp: number;
}

export interface Stock {
    id: string;
    name: string;
    currentPrice: number;
    openPrice: number;
    totalShares: number;
    history: StockHistory[];
    buyOrders?: Record<string, StockOrder>;
    sellOrders?: Record<string, StockOrder>;
}

export interface SavingsRate {
    rate: number;
    periodWeeks: number;
}

export interface SavingsConfig {
    regular: SavingsRate;
    term: SavingsRate;
    installment: SavingsRate;
    rate?: number;
    periodWeeks?: number;
}

export interface Judgement {
    id: string;
    judgeName: string;
    targetUser: string;
    content: string;
    timestamp: string;
    status: 'pending' | 'executed' | 'commuted';
    ministerNote?: string;
}

export interface AppInfo {
    version: string;
    developer: string;
    program: string;
    support: string;
    lastUpdate: string;
    customFields?: { label: string; value: string }[];
}

export interface ChatAttachment {
    type: 'image' | 'file' | 'proposal' | 'application' | 'share_user' | 'share_id' | 'transfer_request';
    value: string;
    data?: any;
}

export interface ChatMessage {
    id: string;
    sender: string;
    text: string;
    timestamp: number;
    attachment?: ChatAttachment;
    threadId?: string; // Links to parent message
    type?: 'system' | 'user' | 'thread_root' | 'conclusion' | 'notice';
    reactions?: Record<string, string>; // user: emoji
    isNotice?: boolean;
    negotiationStatus?: 'pending' | 'accepted' | 'rejected' | 'closed';
}

export interface ChatNotice {
    id: string;
    messageId: string;
    text: string;
    author: string;
    timestamp: number;
}

export interface Chat {
    id: string;
    participants: string[];
    type: 'private' | 'group' | 'feedback';
    groupName?: string;
    lastMessage?: string;
    lastTimestamp?: number;
    messages?: Record<string, ChatMessage>;
    category?: string;
    isPinned?: boolean; // Pinned to top of list
    isMuted?: boolean;
    coverImage?: string;
    notices?: ChatNotice[];
}

export interface DB {
    users: Record<string, User>;
    settings: {
        transactionLimit?: number;
        transferLimit?: number;
        serviceStatus?: 'active' | 'maintenance' | 'ended';
        betaChannel?: 'Stable' | 'Developer Beta' | 'Public Beta';
        automation?: { enabled: boolean, lastRunDate?: string };
        isFrozen?: boolean;
        signupRestricted?: boolean;
        requireSignupApproval?: boolean;
        bypassPin?: boolean;
        taxSeparation?: boolean;
        loadingDelays?: { light: number, heavy: number };
        lockedFeatures?: Record<string, boolean>;
        exchangeRate: { KRW_USD: number };
        exchangeRateHistory?: { date: string, rate: number }[];
        exchangeConfig?: ExchangeConfig;
        loanInterestRate: { periodWeeks: number, rate: number };
        savingsInterest: SavingsConfig;
        vat?: { rate: number, targetMarts: string[] };
        cashback?: { enabled: boolean, rate: number };
        consents?: Record<string, { title: string, content: string, isMandatory?: boolean }>;
        stockMarket?: {
            isOpen: boolean;
            openTime: string;
            closeTime: string;
            isManualOverride: boolean;
            sungSpiEnabled: boolean;
            sungSpiBasePoint: number;
            mode?: 'simple' | 'original';
        };
        standards?: Standards;
        welfareTiers?: { threshold: number, amount: number }[];
        stickyNotes?: StickyNote[];
        appInfo?: AppInfo;
        mintingRestriction?: { krwDisabled: boolean, usdDisabled: boolean };
    };
    realEstate: {
        grid: RealEstateCell[];
        offers?: Record<string, RealEstateOffer>;
        recentTransactions?: any[];
    };
    countries?: Record<string, Country>;
    announcements?: Announcement[];
    ads?: Ad[];
    bonds?: any[];
    pendingApplications?: Record<string, Application>;
    termDeposits?: Record<string, TermDeposit>;
    mintingRequests?: Record<string, MintingRequest>;
    policyRequests?: Record<string, PolicyRequest>;
    taxSessions?: Record<string, TaxSession>;
    auction?: Auction;
    deferredAuctions?: Auction[];
    signupSessions?: Record<string, SignupSession>;
    stocks?: Record<string, Stock>;
    judgements?: Record<string, Judgement>;
    chatRooms?: Record<string, Chat>;
    chatMessages?: Record<string, Record<string, ChatMessage>>;
    chats?: Record<string, Chat>;
}

export const DEFAULT_DB: DB = {
    users: {},
    settings: {
        exchangeRate: { KRW_USD: 1350 },
        loanInterestRate: { periodWeeks: 4, rate: 5 },
        savingsInterest: { 
            regular: { periodWeeks: 0, rate: 1 },
            term: { periodWeeks: 4, rate: 3 },
            installment: { periodWeeks: 8, rate: 5 }
        },
        appInfo: {
            version: '1.0.0',
            developer: '성화은행 개발팀',
            program: 'Digital Banking System',
            support: 'support@bank.sh',
            lastUpdate: new Date().toISOString()
        }
    },
    realEstate: { grid: [] }
};
