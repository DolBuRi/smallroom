import React, { useState } from 'react';
import { Calculator, Coins, ArrowRight, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function MarketCalculator() {
    const [price, setPrice] = useState<number | ''>('');
    const [marketType, setMarketType] = useState<'normal' | 'world'>('normal');

    const numericPrice = typeof price === 'number' ? price : 0;

    // Fee Calculations
    const registrationFee = Math.floor(numericPrice * 0.02);
    const exchangeRate = marketType === 'normal' ? 0.10 : 0.20;
    const exchangeFee = Math.floor(numericPrice * exchangeRate);
    const totalFee = registrationFee + exchangeFee;
    const finalAmount = numericPrice - totalFee;

    const formatNumber = (num: number) => num.toLocaleString();

    // Equivalent Price Calculation
    // Total Fees Including Reg: Normal = 12% (0.12), World = 22% (0.22)
    // Multipliers (Net Profit Rate): Normal = 0.88, World = 0.78
    // Target Net = PriceA * MultiplierA
    // Equiv PriceB = Target Net / MultiplierB

    const multiplierNormal = 0.88;
    const multiplierWorld = 0.78;

    let equivalentPrice = 0;
    let otherMarketName = '';

    if (numericPrice > 0) {
        if (marketType === 'normal') {
            // Calculate required price in World Market to match this profit
            const currentNet = numericPrice * multiplierNormal;
            equivalentPrice = Math.ceil(currentNet / multiplierWorld);
            otherMarketName = '월드 거래소';
        } else {
            // Calculate required price in Normal Market to match this profit
            const currentNet = numericPrice * multiplierWorld;
            equivalentPrice = Math.ceil(currentNet / multiplierNormal);
            otherMarketName = '일반 거래소';
        }
    }

    return (
        <div className="space-y-6 pb-20 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h2 className="text-4xl font-black text-slate-900 dark:text-white flex items-center gap-3 tracking-tight">
                        <Calculator className="text-emerald-500" size={32} />
                        거래소 수수료 계산기
                    </h2>
                    <p className="text-slate-500 dark:text-slate-300 text-sm font-medium mt-[17px]">
                        물품 판매 시 수령 금액을 미리 계산해보세요.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Input Section */}
                <div className="glass-panel p-6 space-y-6">
                    <div>
                        <label className="block text-sm font-bold text-slate-500 dark:text-slate-300 mb-2">판매 금액</label>
                        <div className="relative">
                            <input
                                type="text"
                                value={numericPrice > 0 ? numericPrice.toLocaleString() : ''}
                                onChange={(e) => {
                                    const val = e.target.value.replace(/[^0-9]/g, '');
                                    setPrice(val ? parseInt(val) : '');
                                }}
                                placeholder="판매할 금액을 입력하세요"
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-4 pl-12 font-black text-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all tabular-nums"
                            />
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                                <Coins size={20} />
                            </div>
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">키나</span>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-slate-500 dark:text-slate-300 mb-2">거래소 타입</label>
                        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-700/50 rounded-xl">
                            <button
                                onClick={() => setMarketType('normal')}
                                className={cn(
                                    "py-3 rounded-lg text-sm font-bold transition-all",
                                    marketType === 'normal'
                                        ? "bg-white dark:bg-emerald-600 text-emerald-600 dark:text-white shadow-sm"
                                        : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                )}
                            >
                                일반 거래소 (10%)
                            </button>
                            <button
                                onClick={() => setMarketType('world')}
                                className={cn(
                                    "py-3 rounded-lg text-sm font-bold transition-all",
                                    marketType === 'world'
                                        ? "bg-white dark:bg-emerald-600 text-emerald-600 dark:text-white shadow-sm"
                                        : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                )}
                            >
                                월드 거래소 (20%)
                            </button>
                        </div>
                    </div>

                    {/* Comparison Hint */}
                    {numericPrice > 0 && (
                        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/40 rounded-2xl p-4 flex items-start gap-3">
                            <div className="bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 p-2 rounded-full shrink-0">
                                <ArrowRight size={16} />
                            </div>
                            <div>
                                <h4 className="font-bold text-amber-900 dark:text-amber-200 text-sm">타 거래소 환산 금액</h4>
                                <p className="text-xs text-amber-700 dark:text-amber-300 mt-1 leading-relaxed">
                                    동일한 수익을 얻으려면 <span className="font-bold">{otherMarketName}</span>에서는<br />
                                    최소 <span className="text-amber-600 dark:text-amber-400 font-black text-sm">{formatNumber(equivalentPrice)} 키나</span>에 팔아야 합니다.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Result Section */}
                <div className="glass-panel p-6 bg-emerald-50/50 dark:bg-slate-800/50 border-emerald-100 dark:border-slate-700/50 space-y-6">
                    <h3 className="text-lg font-black text-slate-800 dark:text-slate-200 flex items-center gap-2">
                        <Wallet size={20} className="text-emerald-600 dark:text-emerald-500" />
                        계산 결과
                    </h3>

                    <div className="space-y-4">
                        <div className="flex justify-between items-center p-4 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700">
                            <span className="text-sm font-bold text-slate-500 dark:text-slate-400">등록 수수료 (2%)</span>
                            <span className="font-bold text-slate-700 dark:text-slate-200">{formatNumber(registrationFee)} 키나</span>
                        </div>
                        <div className="flex justify-between items-center p-4 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700">
                            <div className="flex flex-col">
                                <span className="text-sm font-bold text-slate-500 dark:text-slate-400">거래소 수수료 ({marketType === 'normal' ? '10%' : '20%'})</span>
                            </div>
                            <span className="font-bold text-slate-700 dark:text-slate-200">{formatNumber(exchangeFee)} 키나</span>
                        </div>

                        <div className="h-px bg-slate-200 dark:bg-slate-700 my-4"></div>

                        <div className="flex justify-between items-center px-4">
                            <span className="text-sm font-bold text-slate-400 dark:text-slate-500">총 수수료 합계</span>
                            <span className="font-bold text-red-500 dark:text-red-400">-{formatNumber(totalFee)} 키나</span>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-lg shadow-emerald-100 dark:shadow-none border border-emerald-100 dark:border-slate-700 mt-6">
                        <span className="block text-center text-sm font-bold text-emerald-600 dark:text-emerald-400 mb-1">최종 수령 금액</span>
                        <div className="text-center text-3xl font-black text-slate-900 dark:text-white tracking-tight tabular-nums break-words">
                            {formatNumber(finalAmount)} <span className="text-lg font-bold text-slate-400 dark:text-slate-500">키나</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
