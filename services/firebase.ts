import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyALSxku0E37Jw3gj50PvBpAbXZXIc5CW_g",
  authDomain: "ads-dashboard-verifier.firebaseapp.com",
  projectId: "ads-dashboard-verifier",
  storageBucket: "ads-dashboard-verifier.firebasestorage.app",
  messagingSenderId: "410191227631",
  appId: "1:410191227631:web:801483f1b54c9d6f73891a",
  measurementId: "G-BG6EWPSRW0"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const analytics = getAnalytics(app);

// Configure Google Provider with BigQuery scopes
const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/bigquery.readonly');

export { auth, db, googleProvider };