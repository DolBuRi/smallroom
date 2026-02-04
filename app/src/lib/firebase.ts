import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
    apiKey: "AIzaSyBQRLioN1Oza-IhmRWWDO27uuteVznSdwE",
    authDomain: "aion2-guild.firebaseapp.com",
    databaseURL: "https://aion2-guild-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "aion2-guild",
    storageBucket: "aion2-guild.firebasestorage.app",
    messagingSenderId: "1017743230130",
    appId: "1:1017743230130:web:a55df102eb0eef9775b5ab",
    measurementId: "G-HX4ZCCZTQB"
};

// Initialize Defaults
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getDatabase(app);
const googleProvider = new GoogleAuthProvider();

// --- Secondary App for Alerter Integration ---
// TODO: 유저분, 여기에 '아이온2 알리미' 프로젝트의 설정을 넣어주세요!
const alerterConfig = {
    // 유저가 제공한 정확한 주소
    databaseURL: "https://aion2-timer-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "aion2-timer"
};

let alerterApp;
try {
    alerterApp = getApp("alerter");
} catch (e) {
    alerterApp = initializeApp(alerterConfig, "alerter");
}
const alerterDb = getDatabase(alerterApp);

export { app, auth, db, googleProvider, alerterDb };
