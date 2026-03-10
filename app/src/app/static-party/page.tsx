'use client';

import React from 'react';
import StaticPartyList from '@/components/static-party-list';
import { Home, ChevronLeft } from 'lucide-react';
import Link from 'next/link';

export default function StaticPartyPage() {
    return (
        <main className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-200 font-sans selection:bg-purple-200 selection:text-purple-900">
            <div className="max-w-[1400px] mx-auto p-10">
                {/* Header Navigation */}
                <div className="flex items-center justify-between mb-12">
                    <Link
                        href="/"
                        className="flex items-center gap-2 text-slate-400 hover:text-indigo-500 font-bold transition-all group"
                    >
                        <div className="w-10 h-10 rounded-2xl bg-white dark:bg-slate-900 shadow-sm border border-slate-200 dark:border-slate-800 flex items-center justify-center group-hover:scale-110 transition-transform">
                            <ChevronLeft size={20} />
                        </div>
                        메인으로 돌아가기
                    </Link>

                    <div className="text-right">
                        <h1 className="text-sm font-black text-slate-300 dark:text-slate-700 uppercase tracking-[0.3em]">
                            Secret Management
                        </h1>
                    </div>
                </div>

                {/* Content */}
                <StaticPartyList />
            </div>

            {/* Background Decorative Elements */}
            <div className="fixed top-0 left-0 w-full h-full pointer-events-none z-[-1] overflow-hidden">
                <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-500/5 blur-[120px] rounded-full"></div>
                <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-amber-500/5 blur-[120px] rounded-full"></div>
            </div>
        </main>
    );
}
