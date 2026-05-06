'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Shield, Lock, User } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { loginWithCredentials } = useAuth();
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await loginWithCredentials(id, pw);
      router.push('/dashboard');
    } catch (error) {
      alert('로그인 실패: 아이디와 비밀번호를 확인해 주세요.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container-custom py-24 flex justify-center">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl p-10 shadow-xl shadow-slate-100">
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 mx-auto mb-6">
            <Shield size={32} />
          </div>
          <h1 className="text-2xl font-black text-slate-900 mb-2">관리자 로그인</h1>
          <p className="text-sm text-slate-500">데이터 관리를 위해 인증이 필요합니다.</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">아이디</label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
              <input 
                type="text" 
                value={id}
                onChange={(e) => setId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
                placeholder="Admin ID"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">비밀번호</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
              <input 
                type="password" 
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-12 pr-4 py-3 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <button 
            type="submit"
            disabled={isLoading}
            className="w-full py-4 bg-indigo-600 text-white font-black rounded-xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50"
          >
            {isLoading ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  );
}
