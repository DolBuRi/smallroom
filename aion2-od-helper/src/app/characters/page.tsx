'use client';

import { useState, useEffect } from 'react';
import { useAionData } from '@/hooks/useAionData';
import { Plus, Trash2, Save, ChevronLeft, Users, Shield, Palette } from 'lucide-react';
import { cn } from '@/lib/utils';

const CLASS_LIST = ['수호성', '검성', '살성', '궁성', '마도성', '정령성', '치유성', '호법성'];
const COLOR_LIST = [
  { name: '보라', value: 'bg-purple-500' },
  { name: '파랑', value: 'bg-blue-500' },
  { name: '녹색', value: 'bg-emerald-500' },
  { name: '노랑', value: 'bg-amber-500' },
  { name: '빨강', value: 'bg-red-500' },
];

export default function CharactersPage() {
  const { accounts, characters, loading, addCharacter, updateCharacter, deleteCharacter } = useAionData();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  const selectedAccount = accounts.find(a => a.id === selectedAccountId);
  const accountCharacters = characters.filter(c => c.accountId === selectedAccountId);

  if (loading) return <div className="container-custom py-20 text-center text-slate-300 dark:text-slate-700 italic">로딩 중...</div>;

  // View 1: Account List
  if (!selectedAccountId) {
    return (
      <div className="container-custom py-10">
        <div className="mb-10">
          <h1 className="text-2xl font-black text-slate-900 dark:text-white mb-1 tracking-tight">캐릭터 관리</h1>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 font-bold">계정을 선택하면 해당 계정의 캐릭터를 관리할 수 있습니다.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4 gap-4 pb-20">
          {accounts.map((acc) => {
            const charCount = characters.filter(c => c.accountId === acc.id).length;
            return (
              <button 
                key={acc.id}
                onClick={() => setSelectedAccountId(acc.id)}
                className="card-flat p-6 flex flex-col gap-4 text-left hover:border-indigo-200 dark:hover:border-indigo-900 transition-all group"
              >
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <div className="text-sm font-black text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{acc.name || '이름 없음'}</div>
                    <div className="flex gap-1.5 items-center">
                      <span className="px-2 py-0.5 bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-md text-[9px] font-black border border-slate-100 dark:border-slate-700 uppercase tracking-tighter">№ {acc.id.slice(-1)}</span>
                      <span className="px-2 py-0.5 bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-md text-[9px] font-black border border-slate-100 dark:border-slate-700 flex items-center gap-1"><Users size={8} /> {charCount}명</span>
                    </div>
                  </div>
                  <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-xl text-slate-300 dark:text-slate-600 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-950/50 group-hover:text-indigo-400 transition-all"><Plus size={18} /></div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // View 2: Character Details (Compact Card List)
  return (
    <div className="container-custom py-10">
      <div className="flex justify-between items-start mb-8">
        <div className="flex items-start gap-3">
          <button onClick={() => setSelectedAccountId(null)} className="mt-1 p-1 text-slate-300 dark:text-slate-600 hover:text-slate-900 dark:hover:text-white transition-colors"><ChevronLeft size={24} /></button>
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white mb-1 tracking-tight">{selectedAccount?.name}</h1>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 font-bold">캐릭터를 추가하고 티켓·오드를 관리하세요.</p>
          </div>
        </div>
        <button 
          onClick={() => addCharacter({ accountId: selectedAccountId, name: '', className: '궁성', color: 'bg-purple-500' })}
          className="px-5 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black rounded-lg hover:bg-slate-800 dark:hover:bg-slate-100 transition-all flex items-center gap-2 text-[11px] shadow-sm"
        >
          <Plus size={16} /> 캐릭터 추가
        </button>
      </div>

      {accountCharacters.length === 0 ? (
        <div className="py-24 flex flex-col items-center justify-center border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-[32px] bg-slate-50/20 dark:bg-slate-900/10">
          <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center text-slate-300 dark:text-slate-600 mb-4"><Shield size={20} /></div>
          <p className="text-xs font-black text-slate-900 dark:text-white mb-1">등록된 캐릭터가 없습니다</p>
          <button 
            onClick={() => addCharacter({ accountId: selectedAccountId, name: '', className: '궁성', color: 'bg-purple-500' })}
            className="mt-4 px-5 py-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg text-[10px] font-black text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all flex items-center gap-2"
          ><Plus size={12} /> 첫 캐릭터 추가</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4 gap-4 pb-20">
          {accountCharacters.map((char) => (
            <CharacterCard 
              key={char.id} 
              character={char} 
              onUpdate={(data) => updateCharacter(char.id, data)}
              onDelete={() => deleteCharacter(char.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CharacterCard({ character, onUpdate, onDelete }: { 
  character: any, 
  onUpdate: (data: any) => void, 
  onDelete: () => void 
}) {
  const [localName, setLocalName] = useState(character.name);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => setLocalName(character.name), [character.name]);

  return (
    <div className="card-flat p-5 flex flex-col gap-4 w-full rounded-[24px]">
      {/* Name, Class, Color */}
      <div className="space-y-3">
        <div className="flex justify-between items-center px-1">
          <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter">캐릭터 이름</label>
          <span className="px-1.5 py-0.5 bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded text-[8px] font-black uppercase tracking-tighter border border-slate-100 dark:border-slate-700">
            {character.name ? '정보' : '신규'}
          </span>
        </div>
        <div className="relative">
          <div className={cn("absolute left-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full", character.color || 'bg-purple-500')} />
          <input 
            type="text" 
            value={localName}
            onChange={(e) => setLocalName(e.target.value)}
            placeholder="이름 입력"
            className="w-full bg-slate-50/50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm font-black text-slate-900 dark:text-white focus:outline-none focus:border-slate-300 dark:focus:border-slate-600 transition-all shadow-sm"
          />
        </div>
        
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
             <label className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase px-1">직업</label>
             <select 
               value={character.className}
               onChange={(e) => onUpdate({ className: e.target.value })}
               className="w-full bg-slate-50/50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-900 dark:text-white focus:outline-none appearance-none"
             >
               {CLASS_LIST.map(cls => <option key={cls} value={cls} className="dark:bg-slate-900">{cls}</option>)}
             </select>
          </div>
          <div className="space-y-1">
             <label className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase px-1">색상</label>
             <div className="relative">
               <select 
                 value={character.color}
                 onChange={(e) => onUpdate({ color: e.target.value })}
                 className="w-full bg-slate-50/50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 rounded-lg pl-7 pr-3 py-1.5 text-xs font-bold text-slate-900 dark:text-white focus:outline-none appearance-none"
               >
                 {COLOR_LIST.map(col => <option key={col.name} value={col.value} className="dark:bg-slate-900">{col.name}</option>)}
               </select>
               <div className={cn("absolute left-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full", character.color || 'bg-purple-500')} />
             </div>
          </div>
        </div>
      </div>

      {/* Ode */}
      <div className="space-y-2">
        <span className="text-[9px] font-black text-slate-700 dark:text-slate-400 px-1 uppercase tracking-tight">오드</span>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-50/50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-100/50 dark:border-slate-700/50">
            <div className="text-[8px] font-bold text-slate-400 dark:text-slate-500 mb-1">기본 / 최대 840</div>
            <input type="number" value={character.odeBasic || 0} onChange={(e) => onUpdate({ odeBasic: parseInt(e.target.value) || 0 })} className="w-full bg-transparent text-xs font-black text-slate-900 dark:text-white focus:outline-none" />
          </div>
          <div className="bg-slate-50/50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-100/50 dark:border-slate-700/50">
            <div className="text-[8px] font-bold text-slate-400 dark:text-slate-500 mb-1">추가</div>
            <input type="number" value={character.odeExtra || 0} onChange={(e) => onUpdate({ odeExtra: parseInt(e.target.value) || 0 })} className="w-full bg-transparent text-xs font-black text-slate-900 dark:text-white focus:outline-none" />
          </div>
        </div>
      </div>

      {/* Expedition Tickets */}
      <div className="space-y-2">
        <span className="text-[9px] font-black text-slate-700 dark:text-slate-400 px-1 uppercase tracking-tight">원정 티켓</span>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-50/50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-100/50 dark:border-slate-700/50">
            <div className="text-[8px] font-bold text-slate-400 dark:text-slate-500 mb-1">기본 / 최대 14</div>
            <input type="number" value={character.expeditionBasic || 0} onChange={(e) => onUpdate({ expeditionBasic: parseInt(e.target.value) || 0 })} className="w-full bg-transparent text-xs font-black text-slate-900 dark:text-white focus:outline-none" />
          </div>
          <div className="bg-slate-50/50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-100/50 dark:border-slate-700/50">
            <div className="text-[8px] font-bold text-slate-400 dark:text-slate-500 mb-1">추가 / 최대 100</div>
            <input type="number" value={character.expeditionExtra || 0} onChange={(e) => onUpdate({ expeditionExtra: parseInt(e.target.value) || 0 })} className="w-full bg-transparent text-xs font-black text-slate-900 dark:text-white focus:outline-none" />
          </div>
        </div>
      </div>

      {/* Expedition Kills */}
      <div className="space-y-2">
        <span className="text-[9px] font-black text-slate-700 dark:text-slate-400 px-1 uppercase tracking-tight">원정 처치 주간 최대 35</span>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-50/50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-100/50 dark:border-slate-700/50">
            <div className="text-[8px] font-bold text-slate-400 dark:text-slate-500 mb-1">기본 / 최대 35</div>
            <input type="number" value={character.expeditionKillsBasic || 35} onChange={(e) => onUpdate({ expeditionKillsBasic: parseInt(e.target.value) || 0 })} className="w-full bg-transparent text-xs font-black text-slate-900 dark:text-white focus:outline-none" />
          </div>
          <div className="bg-slate-50/50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-100/50 dark:border-slate-700/50">
            <div className="text-[8px] font-bold text-slate-400 dark:text-slate-500 mb-1">추가 티켓</div>
            <input type="number" value={character.expeditionKillsExtra || 0} onChange={(e) => onUpdate({ expeditionKillsExtra: parseInt(e.target.value) || 0 })} className="w-full bg-transparent text-xs font-black text-slate-900 dark:text-white focus:outline-none" />
          </div>
        </div>
      </div>

      {/* Transcendence Tickets */}
      <div className="space-y-2">
        <span className="text-[9px] font-black text-slate-700 dark:text-slate-400 px-1 uppercase tracking-tight">초월 티켓</span>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-50/50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-100/50 dark:border-slate-700/50">
            <div className="text-[8px] font-bold text-slate-400 dark:text-slate-500 mb-1">기본 / 최대 7</div>
            <input type="number" value={character.transcendenceBasic || 0} onChange={(e) => onUpdate({ transcendenceBasic: parseInt(e.target.value) || 0 })} className="w-full bg-transparent text-xs font-black text-slate-900 dark:text-white focus:outline-none" />
          </div>
          <div className="bg-slate-50/50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-100/50 dark:border-slate-700/50">
            <div className="text-[8px] font-bold text-slate-400 dark:text-slate-500 mb-1">추가 / 최대 100</div>
            <input type="number" value={character.transcendenceExtra || 0} onChange={(e) => onUpdate({ transcendenceExtra: parseInt(e.target.value) || 0 })} className="w-full bg-transparent text-xs font-black text-slate-900 dark:text-white focus:outline-none" />
          </div>
        </div>
      </div>

      {/* Transcendence Kills */}
      <div className="space-y-2">
        <span className="text-[9px] font-black text-slate-700 dark:text-slate-400 px-1 uppercase tracking-tight">초월 처치 주간 최대 28</span>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-50/50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-100/50 dark:border-slate-700/50">
            <div className="text-[8px] font-bold text-slate-400 dark:text-slate-500 mb-1">기본 / 최대 28</div>
            <input type="number" value={character.transcendenceKillsBasic || 28} onChange={(e) => onUpdate({ transcendenceKillsBasic: parseInt(e.target.value) || 0 })} className="w-full bg-transparent text-xs font-black text-slate-900 dark:text-white focus:outline-none" />
          </div>
          <div className="bg-slate-50/50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-100/50 dark:border-slate-700/50">
            <div className="text-[8px] font-bold text-slate-400 dark:text-slate-500 mb-1">추가 티켓</div>
            <input type="number" value={character.transcendenceKillsExtra || 0} onChange={(e) => onUpdate({ transcendenceKillsExtra: parseInt(e.target.value) || 0 })} className="w-full bg-transparent text-xs font-black text-slate-900 dark:text-white focus:outline-none" />
          </div>
        </div>
      </div>

      {/* Footer Buttons */}
      <div className="flex gap-2 pt-1 mt-auto">
        <button 
          onClick={async () => { setIsSaving(true); await onUpdate({ name: localName }); setIsSaving(false); }}
          disabled={isSaving}
          className="flex-1 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black py-3 rounded-xl text-[10px] flex items-center justify-center gap-2 shadow-sm hover:bg-slate-800 dark:hover:bg-slate-100 transition-all disabled:opacity-50"
        >
          <Save size={12} /> {isSaving ? '...' : '저장'}
        </button>
        <button 
          onClick={() => { if(confirm('삭제하시겠습니까?')) onDelete(); }} 
          className="w-10 h-10 border border-red-50 dark:border-red-900/30 bg-red-50/50 dark:bg-red-950/20 text-red-400 dark:text-red-500 rounded-xl flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-500 transition-all"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}
