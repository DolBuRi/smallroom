'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { User, signInWithPopup, signOut, onAuthStateChanged, signInAnonymously, signInWithEmailAndPassword } from 'firebase/auth';
import { auth, googleProvider } from '@/lib/firebase';

interface AuthContextType {
    user: User | null;
    loading: boolean;
    isAdmin: boolean;
    login: () => Promise<void>; // Keep for backward compatibility or remove
    loginWithCredentials: (id: string, pw: string) => Promise<void>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    loading: true,
    isAdmin: false,
    login: async () => { },
    loginWithCredentials: async () => { },
    logout: async () => { },
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            if (currentUser) {
                // If user is logged in (either anonymously or via custom auth)
                setUser(currentUser);
                setIsAdmin(!currentUser.isAnonymous);
                setLoading(false);
            } else {
                // No user found, authenticate anonymously automatically
                signInAnonymously(auth).then(() => {
                    console.log("Signed in anonymously for database access.");
                }).catch((error) => {
                    console.error("Anonymous authentication failed:", error);
                    setLoading(false);
                });
            }
        });

        return () => unsubscribe();
    }, []);

    const login = async () => {
        // Deprecated or redirect to credential login
    };

    const loginWithCredentials = async (id: string, pw: string) => {
        // Automatically append @admin.com if not present, to allow simple ID usage
        const email = id.includes('@') ? id : `${id}@admin.com`;
        await signInWithEmailAndPassword(auth, email, pw);
    };

    const logout = async () => {
        try {
            await signOut(auth);
            // After logout, it will trigger onAuthStateChanged(null)
            // which will trigger signInAnonymously() again.
            // This is correct behavior for this app (always needs DB access).
        } catch (error) {
            console.error("Logout failed", error);
        }
    };

    return (
        <AuthContext.Provider value={{ user, loading, isAdmin, login, logout, loginWithCredentials }}>
            {children}
        </AuthContext.Provider>
    );
}
