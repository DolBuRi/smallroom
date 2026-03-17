'use client';

import { useState } from 'react';
import { Search, Server, Shield, Zap } from 'lucide-react';

export default function TestScrapingPage() {
    const [nickname, setNickname] = useState('');
    const [result, setResult] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);

    const addLog = (msg: string) => setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);

    const handleTest = async () => {
        if (!nickname) return;
        setLoading(true);
        setResult(null);
        setLogs([]);

        try {
            addLog(`서버 조회 요청 시작: ${nickname}`);

            const res = await fetch('/api/test-server-fetch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nickname })
            });

            const data = await res.json();

            if (data.success) {
                addLog('✅ 조회 성공!');
                setResult(data.data);
            } else {
                addLog(`❌ 실패: ${data.error}`);
                if (data.details) addLog(`상세: ${data.details.substring(0, 100)}...`);
            }

        } catch (e) {
            addLog(`❌ 에러 발생: ${e}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 p-10 flex flex-col items-center">
            <div className="max-w-2xl w-full bg-white rounded-3xl shadow-xl border border-slate-200 p-8">
                <h1 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-2">
                    <Zap className="text-amber-500" />
                    서버 사이드 조회 테스트 (NO Extension)
                </h1>

                <div className="flex gap-2 mb-8">
                    <input
                        type="text"
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        placeholder="캐릭터명 입력 (예: 사신대행이치고)"
                        className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        onKeyDown={(e) => e.key === 'Enter' && handleTest()}
                    />
                    <button
                        onClick={handleTest}
                        disabled={loading}
                        className="px-6 py-3 bg-indigo-600 text-white font-black rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center gap-2"
                    >
                        {loading ? '조회중...' : '서버로 조회'}
                    </button>
                </div>

                {/* 결과 뷰 */}
                {result && (
                    <div className="bg-indigo-50 rounded-2xl p-6 border border-indigo-100 mb-6 animate-in fade-in slide-in-from-bottom-2">
                        <h3 className="text-indigo-900 font-black text-lg mb-4">조회 결과 (Raw JSON)</h3>
                        <pre className="text-xs font-mono text-indigo-800 bg-white/50 p-4 rounded-xl overflow-auto max-h-60 custom-scrollbar">
                            {JSON.stringify(result, null, 2)}
                        </pre>
                    </div>
                )}

                {/* 로그 뷰 */}
                <div className="bg-slate-900 rounded-2xl p-6 shadow-inner">
                    <h3 className="text-slate-400 font-bold text-xs uppercase tracking-widest mb-3">System Logs</h3>
                    <div className="font-mono text-sm space-y-2 h-40 overflow-y-auto custom-scrollbar">
                        {logs.length === 0 && <span className="text-slate-600 italic">대기 중...</span>}
                        {logs.map((log, i) => (
                            <div key={i} className={`break-all ${log.includes('❌') ? 'text-red-400' : log.includes('✅') ? 'text-green-400' : 'text-slate-300'}`}>
                                {log}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="mt-6 text-center text-xs text-slate-400 font-medium">
                    * 이 페이지는 로컬 테스트 전용이며 실제 배포에는 영향을 주지 않습니다.
                </div>
            </div>
        </div>
    );
}
