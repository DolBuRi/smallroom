'use client';

import React, { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { ref, onValue, set, onDisconnect, runTransaction, push, serverTimestamp } from 'firebase/database';
import { Users, BarChart3, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';

export default function VisitorStats() {
    const { user, isAdmin } = useAuth();
    const [onlineCount, setOnlineCount] = useState<number>(0);
    const [todayCount, setTodayCount] = useState<number>(0);
    const [todayAdminCount, setTodayAdminCount] = useState<number>(0);
    const [onlineAdminCount, setOnlineAdminCount] = useState<number>(0);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // 1. Today's Visitors Logic (General & Admin)
    useEffect(() => {
        if (!mounted) return;

        const todayStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const todayRef = ref(db, `statistics/daily/${todayStr}`);
        const todayAdminRef = ref(db, `statistics/daily_admin/${todayStr}`);
        const totalRef = ref(db, `statistics/total`);

        // A. General Visitor Increment
        // We only run this check once on mount (or if date changed, theoretically)
        const visitedKey = `visited_${todayStr}`;
        if (!localStorage.getItem(visitedKey)) {
            runTransaction(todayRef, (current) => (current || 0) + 1)
                .then(() => {
                    localStorage.setItem(visitedKey, 'true');
                    runTransaction(totalRef, (current) => (current || 0) + 1);
                })
                .catch((err) => console.error("Visitor Inc Error", err));
        }

        // B. Admin Visitor Increment
        // Runs whenever isAdmin status is confirmed
        if (isAdmin) {
            const visitedAdminKey = `visited_admin_${todayStr}`;
            if (!localStorage.getItem(visitedAdminKey)) {
                runTransaction(todayAdminRef, (current) => (current || 0) + 1)
                    .then(() => localStorage.setItem(visitedAdminKey, 'true'))
                    .catch((err) => console.error("Admin Inc Error", err));
            }
        }

        // Listen for updates
        const unsubscribeToday = onValue(todayRef, (snap) => setTodayCount(snap.val() || 0));
        const unsubscribeAdmin = onValue(todayAdminRef, (snap) => setTodayAdminCount(snap.val() || 0));

        return () => {
            unsubscribeToday();
            unsubscribeAdmin();
        };
    }, [mounted, isAdmin]);
    // Dependency on isAdmin is crucial: if user logs in, this effect re-runs to trigger Admin Increment.
    // General Increment is protected by localStorage so it won't double-count on re-run.

    // 2. Current Online Users Logic (Presence)
    useEffect(() => {
        if (!mounted) return;

        const connectedRef = ref(db, '.info/connected');
        const presenceListRef = ref(db, 'presence');

        // Use a new ref for this session/mount
        const myPresenceRef = push(presenceListRef);

        const unsubscribeConnected = onValue(connectedRef, (snap) => {
            if (snap.val() === true) {
                // Remove on disconnect
                onDisconnect(myPresenceRef).remove();

                // Set presence
                set(myPresenceRef, {
                    connectedAt: serverTimestamp(),
                    user: user?.uid || 'anon',
                    isAdmin: !!isAdmin,
                    agent: navigator.userAgent
                });
            }
        });

        const unsubscribePresence = onValue(presenceListRef, (snap) => {
            if (snap.exists()) {
                const data = snap.val();
                setOnlineCount(Object.keys(data).length);

                const adminCount = Object.values(data).filter((p: any) => p.isAdmin === true).length;
                setOnlineAdminCount(adminCount);
            } else {
                setOnlineCount(0);
                setOnlineAdminCount(0);
            }
        });

        return () => {
            unsubscribeConnected();
            unsubscribePresence();
            // CRITICAL: Immediately remove my presence when this specific effect cleans up (e.g. user change or unmount)
            set(myPresenceRef, null);
        };
    }, [mounted, user, isAdmin]); // If user/isAdmin changes, we unmount old ref and mount new ref.

    if (!mounted) return null;

    return (
        <div className="w-[220px] bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl border border-indigo-100 dark:border-slate-700 rounded-2xl p-4 shadow-lg shadow-indigo-500/10 relative overflow-hidden animate-in zoom-in slide-in-from-left-4 duration-500">
            {/* Header Badge */}
            <div className="flex items-center gap-2 mb-3">
                <div className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </div>
                <span className="text-[10px] font-bold tracking-wider text-indigo-500 dark:text-indigo-400 uppercase">
                    Live Stats
                </span>
            </div>

            {/* Stats Grid */}
            <div className="space-y-2">
                {/* Today Row */}
                <div className="flex justify-between items-baseline bg-indigo-50/50 dark:bg-slate-900/50 px-3 py-1.5 rounded-lg border border-indigo-100/50 dark:border-slate-700/50">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Today</span>
                    <span className="text-sm font-black text-slate-800 dark:text-white tabular-nums">
                        {todayCount.toLocaleString()}
                        {todayAdminCount > 0 && <span className="text-[10px] text-indigo-400 ml-1 font-bold">({todayAdminCount})</span>}
                    </span>
                </div>

                {/* Online Row */}
                <div className="flex justify-between items-baseline bg-emerald-50/50 dark:bg-slate-900/50 px-3 py-1.5 rounded-lg border border-emerald-100/50 dark:border-slate-700/50">
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Online</span>
                    <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {onlineCount.toLocaleString()}
                        {onlineAdminCount > 0 && <span className="text-[10px] text-emerald-500 ml-1 font-bold">({onlineAdminCount})</span>}
                    </span>
                </div>
            </div>
        </div>
    );
}
