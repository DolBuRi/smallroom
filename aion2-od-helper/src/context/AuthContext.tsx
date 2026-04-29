'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged, 
  User,
  signInAnonymously
} from 'firebase/auth';
import { auth } from '@/lib/firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  loginWithCredentials: (id: string, pw: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      // Simple admin check: if not anonymous, consider admin for this tool
      setIsAdmin(!!user && !user.isAnonymous);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginWithCredentials = async (id: string, pw: string) => {
    const email = id.includes('@') ? id : `${id}@aion2.com`;
    await signInWithEmailAndPassword(auth, email, pw);
  };

  const logout = async () => {
    await signOut(auth);
    await signInAnonymously(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, loginWithCredentials, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
