import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged, User } from "firebase/auth";
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

// 웹 브라우저 환경에서 익명 로그인 보장
export const ensureAuth = (): Promise<User> => {
    return new Promise((resolve, reject) => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                unsubscribe();
                resolve(user);
            }
        });
        
        signInAnonymously(auth).catch(reject);
    });
};

export { app, auth, db };
