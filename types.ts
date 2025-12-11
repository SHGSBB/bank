
export interface Transaction {
  id: number;
  type: 'income' | 'expense' | 'transfer' | 'exchange' | 'tax' | 'loan' | 'savings' | 'vat' | 'seize' | 'auction' | 'stock_buy' | 'stock_sell' | 'dividend' | 'fine' | 'rent' | 'mart' | 'wage';
  amount: number;
  currency: 'KRW' | 'USD';
  description: string;
  date: string;
}

export interface ToastNotification {
    id: string;
    title: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error' | 'tax';
    duration?: number;
    action?: {
        label: string;
        onClick: () => void;
    };
    isPersistent?: boolean;
    isPaid?: boolean; // For tax
    timestamp: number;
}

export interface GameNotification { 
  id: string;
  message: string;
  read: boolean;
  isPersistent: boolean;
  duration?: number;
  date: string;
  action?: 'auction_join' | 'auction_win' | 'auction_invite' | 'chat' | 'tax_pay' | 'rent_pay';
  actionData?: any;
}

export interface ProductOption {
    name: string; 
    values: string[]; 
}

export interface Product {
  id: string;
  name: string;
  price: number; 
  priceUSD?: number; 
  priceAdditionalKRW?: number; 
  image?: string | null;
  description?: string;
  stock?: number; 
  isOnEvent?: boolean;
  eventDiscountPercent?: number;
  options?: ProductOption[]; 
}

export interface CartItem extends Product {
    cartId: string;
    quantity: number;
    sellerName: string;
    selectedOptions?: Record<string, string>; 
}

export interface Loan {
  id: string;
  amount: number;
  interestRate: { rate: number; periodWeeks: number };
  applyDate: string;
  repaymentDate: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'repaid' | 'collateral_pending';
  collateral: string | null;
  type?: 'general' | 'mortgage'; 
}

export type UserSubType = 'personal' | 'business' | 'govt' | 'teacher';
export type GovtBranch = 'executive' | 'legislative' | 'judicial';

export interface UserPreferences {
    skipPinForCommonActions?: boolean;
    assetDisplayMode?: 'full' | 'hidden' | 'rounded'; 
    vibration?: boolean;
    theme?: 'light' | 'dark' | 'system';
    dndStart?: string; 
    dndEnd?: string; 
    saveLoginHistory?: boolean; 
}

export interface IDCard {
    status: 'none' | 'pending' | 'active';
    issueDate?: string;
    address?: string; 
    residentNumber?: string; 
}

export interface AssetHistoryPoint {
    date: string;
    totalValue: number;
}

export interface PendingTax {
    id: string; 
    sessionId: string;
    amount: number;
    type: 'property' | 'income' | 'asset' | 'real_estate'; 
    dueDate: string;
    isOverdue?: boolean;
    penalty?: number;
    status?: 'pending' | 'paid';
    breakdown?: string; 
}

export interface RentRequest {
    id: string;
    propertyId: number;
    owner: string;
    tenant: string;
    amount: number;
    dueDate: string;
    status: 'pending' | 'paid';
}

export interface User {
  name: string; 
  nickname?: string; 
  id: string | null;
  password?: string | null;
  balanceKRW: number;
  balanceUSD: number;
  type: 'admin' | 'mart' | 'citizen' | 'government' | 'teacher' | 'root' | string;
  subType?: UserSubType;
  pin: string | null;
  pinLength?: 4 | 6; 
  profilePic?: string | null;
  transactions?: Transaction[];
  notifications?: Record<string, GameNotification> | GameNotification[]; 
  products?: Record<string, Product>;
  loans?: Record<string, Loan> | Loan[];
  consents?: Record<string, boolean>;
  
  countryId?: string;
  
  customJob?: string;
  statusMessage?: string; 
  phoneNumber?: string | null;
  email?: string;
  
  linkedAccounts?: string[]; 
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  govtBranch?: GovtBranch;
  isHeadOfDept?: boolean;
  isPresident?: boolean; 
  jointOwners?: string[];
  birthDate?: string;

  failedLoginAttempts?: number;
  lockoutUntil?: number; 
  isSuspended?: boolean;
  bankruptcyStatus?: 'none' | 'pending' | 'bankrupt';
  
  preferences?: UserPreferences;

  isCorporation?: boolean; 
  stockHoldings?: Record<string, { quantity: number, averagePrice: number }>; 
  realizedStockProfit?: number; 
  
  assetHistory?: AssetHistoryPoint[];

  pendingTaxes?: PendingTax[]; 
  pendingTax?: PendingTax; 
  pendingRent?: RentRequest;

  isOnline?: boolean;
  lastActive?: number;
  lastSessionId?: string; 

  idCard?: IDCard;
  
  unreadMessageCount?: number;
}

export interface Country {
    id: string;
    name: string;
    currency: 'KRW' | 'USD';
}

export interface RealEstateCell {
  id: number;
  owner: string | null;
  tenant: string | null;
  price: number;
  isJointOwnership: boolean;
  jointOwners?: string[];
  isMerged: boolean;
}

export interface RealEstateOffer {
  id: string;
  propertyId: number;
  from: string;
  to: string;
  price: number;
  status: 'pending' | 'accepted' | 'rejected';
}

export type AnnouncementCategory = 'general' | 'service_stop' | 'service_end' | 'terms_update' | 'standard_update';

export interface Announcement {
  id: number;
  category: AnnouncementCategory;
  content: string;
  isImportant: boolean;
  showOnStartup: boolean;
  displayPeriodDays: number;
  date: string;
}

export interface TermDeposit {
    id: string;
    owner: string;
    amount: number;
    startDate: string;
    endDate: string; 
    interestRate: number;
    status: 'active' | 'withdrawn' | 'matured';
    type: 'regular' | 'term' | 'installment'; 
    monthlyPayment?: number; 
    nextPaymentDate?: string; 
}

export interface Application {
    id: string;
    type: 'loan' | 'savings' | 'ipo' | 'id_card' | 'bankruptcy'; 
    applicantName: string;
    amount: number;
    loanId?: string; 
    requestedDate: string;
    status?: 'processed' | 'pending' | 'negotiating';
    
    savingsType?: 'regular' | 'term' | 'installment';
    savingsPeriod?: number; 
    
    collateral?: string;
    collateralStatus?: 'none' | 'proposed_by_admin' | 'proposed_by_user' | 'accepted';
    
    loanType?: 'general' | 'mortgage'; 
}

export interface ProgressiveRule {
    threshold: number; 
    type: 'percent' | 'fixed'; 
    value: number; 
}

export interface Standards {
    taxRateProperty: number; 
    taxRateIncome: number; 
    weeklyWage: number;
    cleanerWage: number;
    progressivePropertyRules?: ProgressiveRule[];
    progressiveIncomeRules?: ProgressiveRule[]; 
}

export interface VATSettings {
    rate: number;
    targetMarts: string[];
}

export interface ExchangeConfig {
    pairs: {
        KRW_USD: boolean;
    };
    rates: {
        KRW_USD: number;
    };
    autoStopThresholdUSD?: number;
    isAutoStopEnabled?: boolean;
    autoMintLimit?: number; 
}

export interface AuctionBid {
    bidder: string;
    amount: number;
    timestamp: number;
    contributors?: { name: string; amount: number }[]; 
}

export interface AuctionTeamMember {
    name: string;
    status: 'pending' | 'accepted' | 'rejected';
}

export interface Auction {
    id?: string; 
    isActive: boolean;
    isPaused?: boolean; 
    item: {
        name: string;
        description: string;
        image?: string | null;
    };
    startingPrice: number;
    currentPrice: number;
    startTime: string; 
    endTime?: number; 
    timerDuration?: number; 
    status: 'pending' | 'active' | 'ended' | 'deferred';
    bids: AuctionBid[];
    winner?: string | null;
    winningBid?: number;
    teams?: Record<string, AuctionTeamMember[]>; 
}

export interface SignupSession {
    id: string; 
    name: string;
    phone: string;
    code: string; 
    createdAt: number;
    attempts: number;
}

export interface StickyNote {
    id: string;
    text: string;
    x: number; 
    y: number;
    color: string;
}

export interface StockHistory {
    date: string; 
    price: number;
}

export interface Stock {
    id: string; 
    name: string;
    ownerName: string;
    totalShares: number;
    currentPrice: number;
    openPrice: number; 
    previousClosePrice: number;
    history: StockHistory[];
}

export interface StockMarketSettings {
    isOpen: boolean;
    openTime: string; 
    closeTime: string; 
    isManualOverride: boolean; 
    sungSpiEnabled?: boolean;
    sungSpiBasePoint?: number;
}

export interface ChatAttachment {
    type: 'tab' | 'ad_proposal' | 'id_card' | 'ui_element';
    value: string; 
    data?: any; 
}

export interface ChatReaction {
    type: 'love' | 'like' | 'dislike' | 'laugh' | 'emphasize' | 'question';
    sender: string;
}

export interface ChatMessage {
    id: string;
    sender: string;
    text: string;
    timestamp: number;
    attachment?: ChatAttachment;
    readBy?: string[];
    replyTo?: string; 
    reactions?: Record<string, ChatReaction>; 
    isDeleted?: boolean;
    isEdited?: boolean;
}

export interface Chat {
    id: string;
    participants: string[]; 
    type?: 'private' | 'group' | 'feedback'; 
    groupName?: string;
    // Messages removed from here to separate bandwidth
    lastMessage?: string;
    lastTimestamp?: number;
    feedbackStatus?: 'open' | 'closed'; 
    messages?: Record<string, ChatMessage>; // Legacy optional support or for client-side aggregation
}

export interface Ad {
    id: string;
    businessName: string;
    imageUrl: string;
    fee: number;
    startDate: string;
    endDate: string;
    isActive: boolean;
}

export interface PolicyRequest {
    id: string;
    type: 'tax_rate' | 'interest_rate' | 'standard';
    requester: string; 
    data: any; 
    description: string;
    status: 'pending' | 'approved' | 'rejected';
    requestedAt: string;
}

export interface TaxSession {
    id: string;
    type: 'property' | 'income' | 'asset' | 'real_estate';
    amount: number; 
    totalTarget: number;
    collectedAmount: number;
    startDate: string;
    dueDate?: string;
    status: 'active' | 'ended';
    targetUsers: string[]; 
    paidUsers: string[];
}

export interface Settings {
    betaChannel?: 'Developer Beta' | 'Public Beta' | 'Stable';
    chatEnabled?: boolean; 
    exchangeRate: { KRW_USD: number }; 
    exchangeConfig?: ExchangeConfig;
    exchangeRateHistory?: { date: string; rate: number }[];
    savingsInterest: { rate: number; periodWeeks: number };
    loanInterestRate: { rate: number; periodWeeks: number };
    welfareTiers: { threshold: number; amount: number }[];
    consents: Record<string, { title: string; content: string; isMandatory?: boolean }>;
    vat?: VATSettings;
    isFrozen?: boolean;
    signupRestricted?: boolean;
    bypassPin?: boolean;
    transferLimit?: number;
    lockedFeatures?: Record<string, boolean>;
    standards?: Standards;
    isResetDone?: boolean;
    isUserListWiped_Final_v1?: boolean;
    isUserListWiped_Final_v2?: boolean;
    loadingDelays?: {
        light: number; 
        heavy: number; 
    };
    stickyNotes?: StickyNote[];
    sectionOrder?: string[]; 
    stockMarket?: StockMarketSettings;
    taxSeparation?: boolean; 
    serviceStatus?: 'active' | 'maintenance' | 'ended'; 
    automation?: { 
        enabled: boolean;
        lastRunDate?: string; 
    };
}

export interface MintingRequest {
    id: string;
    amount: number;
    currency: 'KRW' | 'USD';
    status: 'pending' | 'approved' | 'rejected';
    requestedAt: string;
}

export interface DB {
  users: Record<string, User>;
  settings: Settings;
  realEstate: {
    grid: RealEstateCell[];
    recentTransactions: any[];
    offers: Record<string, RealEstateOffer>;
  };
  countries?: Record<string, Country>;
  announcements: Announcement[];
  ads?: Ad[]; 
  bonds: any[]; 
  pendingApplications: Record<string, Application>;
  termDeposits: Record<string, TermDeposit>;
  mintingRequests?: Record<string, MintingRequest>;
  policyRequests?: Record<string, PolicyRequest>;
  taxSessions?: Record<string, TaxSession>;
  
  auction?: Auction;
  deferredAuctions?: Auction[]; 
  signupSessions?: Record<string, SignupSession>;
  
  stocks?: Record<string, Stock>;
  
  // Separated Chat
  chatRooms?: Record<string, Chat>;
  chatMessages?: Record<string, Record<string, ChatMessage>>;
  
  // Legacy chat (optional for migration)
  chats?: Record<string, Chat>;
  
  asset_histories?: Record<string, AssetHistoryPoint[]>;
}

export const DEFAULT_DB: DB = {
  users: {
      '한국은행': { 
          name: '한국은행', 
          id: 'admin', 
          password: 'admin', 
          balanceKRW: 100000000000, 
          balanceUSD: 100000000, 
          type: 'admin', 
          pin: '0000', 
          pinLength: 4,
          approvalStatus: 'approved',
          linkedAccounts: []
      }
  },
  settings: {
      betaChannel: 'Public Beta',
      chatEnabled: true,
      exchangeRate: { KRW_USD: 1350 },
      exchangeConfig: {
          pairs: { KRW_USD: true },
          rates: { KRW_USD: 1350 },
          isAutoStopEnabled: false,
          autoMintLimit: 1000000000 
      },
      exchangeRateHistory: [{ date: new Date().toISOString(), rate: 1350 }],
      savingsInterest: { rate: 2.5, periodWeeks: 4 },
      loanInterestRate: { rate: 5.0, periodWeeks: 2 },
      welfareTiers: [],
      vat: { rate: 0, targetMarts: [] },
      isFrozen: false,
      signupRestricted: false,
      bypassPin: false,
      transferLimit: 1000000,
      lockedFeatures: {},
      standards: {
          taxRateProperty: 1,
          taxRateIncome: 10,
          weeklyWage: 50000,
          cleanerWage: 30000,
          progressivePropertyRules: [],
          progressiveIncomeRules: []
      },
      consents: {
        personalInfo: { 
            title: '[필수] 개인정보 수집 및 이용 동의', 
            content: `<h3>제 1조 (목적)</h3><p>본 약관은 성화 은행...</p>`,
            isMandatory: true
        }
      },
      loadingDelays: {
          light: 0.4,
          heavy: 1.2
      },
      isResetDone: false,
      isUserListWiped_Final_v1: false,
      isUserListWiped_Final_v2: false,
      stickyNotes: [],
      sectionOrder: [],
      stockMarket: {
          isOpen: true,
          openTime: "09:00",
          closeTime: "15:30",
          isManualOverride: false,
          sungSpiEnabled: true,
          sungSpiBasePoint: 1000
      },
      taxSeparation: false,
      serviceStatus: 'active',
      automation: { enabled: false }
  },
  countries: {},
  realEstate: { grid: [], recentTransactions: [], offers: {} },
  announcements: [],
  ads: [],
  bonds: [],
  pendingApplications: {},
  termDeposits: {},
  mintingRequests: {},
  policyRequests: {},
  taxSessions: {},
  auction: {
      isActive: false,
      item: { name: '', description: '', image: null },
      startingPrice: 0,
      currentPrice: 0,
      startTime: '',
      status: 'ended',
      bids: []
  },
  deferredAuctions: [],
  signupSessions: {},
  stocks: {},
  chatRooms: {},
  chatMessages: {},
  asset_histories: {}
};
