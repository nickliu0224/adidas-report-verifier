import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyALSxku0E37Jw3gj50PvBpAbXZXIc5CW_g",
  authDomain: "ads-dashboard-verifier.firebaseapp.com",
  projectId: "ads-dashboard-verifier",
  storageBucket: "ads-dashboard-verifier.firebasestorage.app",
  messagingSenderId: "410191227631",
  appId: "1:410191227631:web:801483f1b54c9d6f73891a",
  measurementId: "G-BG6EWPSRW0"
};

// 1. 初始化 Firebase App (防止重複初始化)
// 如果已經有初始化過的 app 就直接用，沒有才初始化
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// 2. 初始化服務並明確傳入 app
const auth = getAuth(app);
const db = getFirestore(app);

// 3. Analytics 處理 (加上支援度檢查，避免在某些環境報錯)
isSupported().then((supported) => {
  if (supported) {
    getAnalytics(app);
  }
});

// 4. 設定 Google Provider
const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/bigquery.readonly');

// 5. 匯出實例
export { app, auth, db, googleProvider };