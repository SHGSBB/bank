import * as admin from 'firebase-admin';

// 환경 변수에 있는 JSON 문자열을 객체로 변환해서 사용
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    // 프로젝트 주소 (반드시 확인!)
    databaseURL: "https://sunghwa-cffff-default-rtdb.asia-southeast1.firebasedatabase.app"
  });
}

export const db = admin.database();