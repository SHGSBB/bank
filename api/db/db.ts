
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database'; // 👈 Realtime Database 사용 시

// 1. 환경 변수 가져오기
const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

// 2. 안전장치: 키가 없으면 에러 발생 (서버 로그로 확인 가능)
if (!rawKey) {
  throw new Error("🚨 Vercel 환경 변수(FIREBASE_SERVICE_ACCOUNT_KEY)가 없습니다!");
}

const serviceAccount = JSON.parse(rawKey);

// 3. 앱 초기화 (중복 실행 방지: getApps() 사용)
if (getApps().length === 0) {
  initializeApp({
    credential: cert(serviceAccount),
    databaseURL: "https://sunghwa-cffff-default-rtdb.asia-southeast1.firebasedatabase.app"
  });
}

// 4. DB 내보내기
export const db = getDatabase();
