'use client';

import { useAionData } from '@/hooks/useAionData';
import { Plus, Trash2, Save, Gem } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';

export default function AccountsPage() {
  const { accounts, loading, addAccount, updateAccount, deleteAccount } = useAionData();

  const handleAddAccount = () => {
    addAccount();
  };

  return (
    <div className="container-custom py-10">
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white mb-1 tracking-tight">계정 관리</h1>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 font-bold">
            게임 계정을 등록하고 슈고 티켓·주간 횟수를 관리하세요.
          </p>
        </div>
        <button 
          onClick={handleAddAccount}
          className="px-5 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black rounded-lg hover:bg-slate-800 dark:hover:bg-slate-100 transition-all flex items-center gap-2 text-[11px] shadow-sm"
        >
          <Plus size={16} /> 계정 추가
        </button>
      </div>

      {loading ? (
        <div className="py-24 text-center text-slate-300 dark:text-slate-700 italic text-sm">로딩 중...</div>
      ) : accounts.length === 0 ? (
        <div className="py-24 text-center text-slate-300 dark:text-slate-600 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-3xl">
          <p className="mb-4">등록된 계정이 없습니다.</p>
          <button 
            onClick={handleAddAccount}
            className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
          >
            새 계정 추가하기
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4 gap-6 pb-20">
          {accounts.map((acc) => (
            <AccountCard 
              key={acc.id} 
              account={acc} 
              onUpdate={(data) => updateAccount(acc.id, data)}
              onDelete={() => deleteAccount(acc.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AccountCard({ account, onUpdate, onDelete }: { account: any, onUpdate: (data: any) => void, onDelete: () => void }) {
  const [localName, setLocalName] = useState(account.name);
  const [isSaving, setIsSaving] = useState(false);
  
  useEffect(() => {
    setLocalName(account.name);
  }, [account.name]);

  const handleSave = async () => {
    setIsSaving(true);
    await onUpdate({ name: localName });
    setIsSaving(false);
  };

  return (
    <div className="card-flat p-6 flex flex-col gap-5 rounded-[28px]">
      {/* Account Name & Membership */}
      <div className="space-y-3">
        <div className="flex justify-between items-center px-1">
          <label className="text-[10px] font-black text-slate-400 dark:text-neutral-500 uppercase tracking-tighter">계정 이름</label>
          <span className="px-2 py-0.5 bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-neutral-500 rounded-lg text-[9px] font-black uppercase tracking-tighter border border-slate-100 dark:border-slate-700">
            {account.name ? `№ ${account.name.length % 5 + 1}` : '신규'}
          </span>
        </div>
        <input 
          type="text" 
          value={localName}
          onChange={(e) => setLocalName(e.target.value)}
          placeholder="계정 이름 입력"
          className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:border-slate-300 dark:focus:border-slate-600 transition-all shadow-sm"
        />
        <div className="flex items-center justify-between p-3.5 bg-slate-50/50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 rounded-2xl">
           <div className="flex items-center gap-2">
             <div className="p-1.5 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-lg shadow-sm">
               <Gem size={14} className="text-slate-400 dark:text-slate-500" />
             </div>
             <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">멤버십</span>
           </div>
           <button 
             onClick={() => onUpdate({ membership: !account.membership })}
             className={cn(
               "w-11 h-6 rounded-full relative transition-all duration-300 border border-slate-100 dark:border-slate-700",
               account.membership ? "bg-indigo-500 border-indigo-400" : "bg-slate-200 dark:bg-slate-800"
             )}
           >
             <div className={cn(
               "absolute top-1 w-3.5 h-3.5 bg-white rounded-full transition-all duration-300 shadow-sm",
               account.membership ? "right-1" : "left-1"
             )} />
           </button>
        </div>
      </div>

      <div className="h-[1px] bg-slate-50 dark:bg-slate-800 w-full" />

      {/* Shugo Tickets */}
      <div className="space-y-4">
        <span className="text-[10px] font-black text-slate-700 dark:text-slate-400 px-1 uppercase tracking-tight">슈고 티켓</span>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 px-1">기본 / 최대 14</span>
            <input 
              type="number" 
              value={account.shugoBasic}
              onChange={(e) => onUpdate({ shugoBasic: parseInt(e.target.value) || 0 })}
              className="w-full bg-slate-50/50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 rounded-xl px-4 py-2 text-[13px] font-black text-slate-900 dark:text-white focus:outline-none focus:border-slate-200 dark:focus:border-slate-600"
            />
          </div>
          <div className="space-y-1.5">
            <span className="text-[9px] font-bold text-slate-400 dark:text-neutral-500 px-1">추가 / 최대 100</span>
            <input 
              type="number" 
              value={account.shugoExtra}
              onChange={(e) => onUpdate({ shugoExtra: parseInt(e.target.value) || 0 })}
              className="w-full bg-slate-50/50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 rounded-xl px-4 py-2 text-[13px] font-black text-slate-900 dark:text-white focus:outline-none focus:border-slate-200 dark:focus:border-slate-600"
            />
          </div>
        </div>
      </div>

      {/* Invasion Tickets */}
      <div className="space-y-4">
        <span className="text-[10px] font-black text-slate-700 dark:text-slate-400 px-1 uppercase tracking-tight">침공 티켓</span>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 px-1">기본 / 최대 7</span>
            <input 
              type="number" 
              value={account.invasionBasic}
              onChange={(e) => onUpdate({ invasionBasic: parseInt(e.target.value) || 0 })}
              className="w-full bg-slate-50/50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 rounded-xl px-4 py-2 text-[13px] font-black text-slate-900 dark:text-white focus:outline-none focus:border-slate-200 dark:focus:border-slate-600"
            />
          </div>
          <div className="space-y-1.5">
            <span className="text-[9px] font-bold text-slate-400 dark:text-neutral-500 px-1">추가 / 최대 100</span>
            <input 
              type="number" 
              value={account.invasionExtra}
              onChange={(e) => onUpdate({ invasionExtra: parseInt(e.target.value) || 0 })}
              className="w-full bg-slate-50/50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 rounded-xl px-4 py-2 text-[13px] font-black text-slate-900 dark:text-white focus:outline-none focus:border-slate-200 dark:focus:border-slate-600"
            />
          </div>
        </div>
      </div>

      {/* Expedition/Transcendence Counts */}
      <div className="space-y-4">
        <span className="text-[10px] font-black text-slate-700 dark:text-slate-400 px-1 uppercase tracking-tight">이번 주 횟수</span>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 px-1">원정 / 경고 63+</span>
            <input 
              type="number" 
              value={account.expeditionCount}
              onChange={(e) => onUpdate({ expeditionCount: parseInt(e.target.value) || 0 })}
              className="w-full bg-slate-50/50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 rounded-xl px-4 py-2 text-[13px] font-black text-slate-900 dark:text-white focus:outline-none focus:border-slate-200 dark:focus:border-slate-600"
            />
          </div>
          <div className="space-y-1.5">
            <span className="text-[9px] font-bold text-slate-400 dark:text-neutral-500 px-1">초월 / 경고 42+</span>
            <input 
              type="number" 
              value={account.transcendenceCount}
              onChange={(e) => onUpdate({ transcendenceCount: parseInt(e.target.value) || 0 })}
              className="w-full bg-slate-50/50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 rounded-xl px-4 py-2 text-[13px] font-black text-slate-900 dark:text-white focus:outline-none focus:border-slate-200 dark:focus:border-slate-600"
            />
          </div>
        </div>
      </div>

      {/* Footer Buttons */}
      <div className="flex gap-2 pt-2 mt-auto">
        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="flex-1 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black py-4 rounded-2xl text-[11px] flex items-center justify-center gap-2 shadow-lg shadow-slate-100 dark:shadow-none hover:bg-slate-800 dark:hover:bg-slate-100 transition-all disabled:opacity-50"
        >
          <Save size={14} /> {isSaving ? '저장 중...' : '저장'}
        </button>
        <button 
          onClick={() => { if(confirm('삭제하시겠습니까?')) onDelete(); }}
          className="w-12 border border-red-100 dark:border-red-900/30 bg-red-50/50 dark:bg-red-950/20 text-red-400 dark:text-red-500 rounded-2xl flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-500 transition-all"
        >
          <Trash2 size={18} />
        </button>
      </div>
    </div>
  );
}
