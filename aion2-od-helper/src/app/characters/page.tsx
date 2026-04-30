'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useAionData } from '@/hooks/useAionData';
import { Plus, Trash2, Save, ChevronLeft, Users, Shield, Palette, GripVertical } from 'lucide-react';
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
  const { accounts, rawCharacters, loading, addCharacter, updateCharacter, deleteCharacter } = useAionData();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  const selectedAccount = accounts.find(a => a.id === selectedAccountId);
  
  // 가공되지 않은 원본 데이터를 정렬하여 사용 (편집 중 데이터 튐 방지)
  const accountCharacters = useMemo(() => {
    return rawCharacters
      .filter(c => c.accountId === selectedAccountId)
      .sort((a, b) => (a.order || 0) - (b.order || 0) || a.id.localeCompare(b.id));
  }, [rawCharacters, selectedAccountId]);

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
            const charCount = rawCharacters.filter(c => c.accountId === acc.id).length;
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
  const [editChar, setEditChar] = useState({ ...character });
  const [isSaving, setIsSaving] = useState(false);

  // 서버 데이터가 실제로 변했을 때만 로컬 상태 동기화 (다른 캐릭터 저장 시 입력값 유실 방지)
  const prevCharRef = useRef(JSON.stringify(character));
  useEffect(() => {
    const currentCharStr = JSON.stringify(character);
    if (currentCharStr !== prevCharRef.current) {
      // 서버의 데이터가 실제로 변경된 경우에만 로컬 상태를 동기화
      setEditChar({ ...character });
      prevCharRef.current = currentCharStr;
    }
  }, [character]);

  const handleLocalUpdate = (updates: any) => {
    setEditChar((prev: any) => ({ ...prev, ...updates }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    await onUpdate({ ...editChar, lastUpdate: new Date().toISOString() });
    setIsSaving(false);
  };

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
          <div className={cn("absolute left-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full", editChar.color || 'bg-purple-500')} />
          <input 
            type="text" 
            value={editChar.name}
            onChange={(e) => handleLocalUpdate({ name: e.target.value })}
            placeholder="이름 입력"
            className="w-full bg-slate-50/50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm font-black text-slate-900 dark:text-white focus:outline-none focus:border-slate-300 dark:focus:border-slate-600 transition-all shadow-sm"
          />
        </div>
        
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
             <label className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase px-1">직업</label>
             <select 
               value={editChar.className}
               onChange={(e) => handleLocalUpdate({ className: e.target.value })}
               className="w-full bg-slate-50/50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-900 dark:text-white focus:outline-none appearance-none"
             >
               {CLASS_LIST.map(cls => <option key={cls} value={cls} className="dark:bg-slate-900">{cls}</option>)}
             </select>
          </div>
          <div className="space-y-1.5">
             <label className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase px-1">색상</label>
             <div className="relative">
                <select 
                  value={editChar.color}
                  onChange={(e) => handleLocalUpdate({ color: e.target.value })}
                  className="w-full bg-slate-50/50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 rounded-lg pl-7 pr-3 py-1.5 text-xs font-bold text-slate-900 dark:text-white focus:outline-none appearance-none"
                >
                  {COLOR_LIST.map(col => <option key={col.name} value={col.value} className="dark:bg-slate-900">{col.name}</option>)}
                </select>
                <div className={cn("absolute left-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full", editChar.color || 'bg-purple-500')} />
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
            <input 
              type="number" 
              value={editChar.ode ?? 0} 
              onChange={(e) => handleLocalUpdate({ ode: Math.max(0, parseInt(e.target.value) || 0) })} 
              className="w-full bg-transparent text-xs font-black text-slate-900 dark:text-white focus:outline-none" 
            />
          </div>
          <div className="bg-slate-50/50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-100/50 dark:border-slate-700/50">
            <div className="text-[8px] font-bold text-slate-400 dark:text-slate-500 mb-1">추가</div>
            <input 
              type="number" 
              value={editChar.odeExtra ?? 0} 
              onChange={(e) => handleLocalUpdate({ odeExtra: Math.max(0, parseInt(e.target.value) || 0) })} 
              className="w-full bg-transparent text-xs font-black text-slate-900 dark:text-white focus:outline-none" 
            />
          </div>
        </div>
      </div>

      {/* Expedition */}
      <div className="space-y-2">
        <span className="text-[9px] font-black text-slate-700 dark:text-slate-400 px-1 uppercase tracking-tight">원정 보상 횟수</span>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-50/50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-100/50 dark:border-slate-700/50">
            <div className="text-[8px] font-bold text-slate-400 dark:text-slate-500 mb-1">기본 / 최대 14</div>
            <input 
              type="number" 
              value={editChar.expeditionBasic ?? 0} 
              onChange={(e) => handleLocalUpdate({ expeditionBasic: Math.max(0, parseInt(e.target.value) || 0) })} 
              className="w-full bg-transparent text-xs font-black text-slate-900 dark:text-white focus:outline-none" 
            />
          </div>
          <div className="bg-slate-50/50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-100/50 dark:border-slate-700/50">
            <div className="text-[8px] font-bold text-slate-400 dark:text-slate-500 mb-1">추가 / 최대 100</div>
            <input 
              type="number" 
              value={editChar.expeditionExtra ?? 0} 
              onChange={(e) => handleLocalUpdate({ expeditionExtra: Math.max(0, parseInt(e.target.value) || 0) })} 
              className="w-full bg-transparent text-xs font-black text-slate-900 dark:text-white focus:outline-none" 
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <span className="text-[9px] font-black text-slate-700 dark:text-slate-400 px-1 uppercase tracking-tight">원정 처치 가능 횟수</span>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-50/50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-100/50 dark:border-slate-700/50">
            <div className="text-[8px] font-bold text-slate-400 dark:text-slate-500 mb-1">기본 / 최대 35</div>
            <input 
              type="number" 
              value={editChar.expeditionKillsBasic ?? 0} 
              onChange={(e) => handleLocalUpdate({ expeditionKillsBasic: Math.max(0, parseInt(e.target.value) || 0) })} 
              className="w-full bg-transparent text-xs font-black text-slate-900 dark:text-white focus:outline-none" 
            />
          </div>
          <div className="bg-slate-50/50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-100/50 dark:border-slate-700/50">
            <div className="text-[8px] font-bold text-slate-400 dark:text-slate-500 mb-1">추가 티켓</div>
            <input 
              type="number" 
              value={editChar.expeditionKillsExtra ?? 0} 
              onChange={(e) => handleLocalUpdate({ expeditionKillsExtra: Math.max(0, parseInt(e.target.value) || 0) })} 
              className="w-full bg-transparent text-xs font-black text-slate-900 dark:text-white focus:outline-none" 
            />
          </div>
        </div>
      </div>

      {/* Transcendence */}
      <div className="space-y-2">
        <span className="text-[9px] font-black text-slate-700 dark:text-slate-400 px-1 uppercase tracking-tight">초월 보상 횟수</span>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-50/50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-100/50 dark:border-slate-700/50">
            <div className="text-[8px] font-bold text-slate-400 dark:text-slate-500 mb-1">기본 / 최대 7</div>
            <input 
              type="number" 
              value={editChar.transcendenceBasic ?? 0} 
              onChange={(e) => handleLocalUpdate({ transcendenceBasic: Math.max(0, parseInt(e.target.value) || 0) })} 
              className="w-full bg-transparent text-xs font-black text-slate-900 dark:text-white focus:outline-none" 
            />
          </div>
          <div className="bg-slate-50/50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-100/50 dark:border-slate-700/50">
            <div className="text-[8px] font-bold text-slate-400 dark:text-slate-500 mb-1">추가 / 최대 100</div>
            <input 
              type="number" 
              value={editChar.transcendenceExtra ?? 0} 
              onChange={(e) => handleLocalUpdate({ transcendenceExtra: Math.max(0, parseInt(e.target.value) || 0) })} 
              className="w-full bg-transparent text-xs font-black text-slate-900 dark:text-white focus:outline-none" 
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <span className="text-[9px] font-black text-slate-700 dark:text-slate-400 px-1 uppercase tracking-tight">초월 처치 가능 횟수</span>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-50/50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-100/50 dark:border-slate-700/50">
            <div className="text-[8px] font-bold text-slate-400 dark:text-slate-500 mb-1">기본 / 최대 28</div>
            <input 
              type="number" 
              value={editChar.transcendenceKillsBasic ?? 0} 
              onChange={(e) => handleLocalUpdate({ transcendenceKillsBasic: Math.max(0, parseInt(e.target.value) || 0) })} 
              className="w-full bg-transparent text-xs font-black text-slate-900 dark:text-white focus:outline-none" 
            />
          </div>
          <div className="bg-slate-50/50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-100/50 dark:border-slate-700/50">
            <div className="text-[8px] font-bold text-slate-400 dark:text-slate-500 mb-1">추가 티켓</div>
            <input 
              type="number" 
              value={editChar.transcendenceKillsExtra ?? 0} 
              onChange={(e) => handleLocalUpdate({ transcendenceKillsExtra: Math.max(0, parseInt(e.target.value) || 0) })} 
              className="w-full bg-transparent text-xs font-black text-slate-900 dark:text-white focus:outline-none" 
            />
          </div>
        </div>
      </div>

      {/* Sanctuary */}
      <div className="space-y-2">
        <span className="text-[9px] font-black text-slate-700 dark:text-slate-400 px-1 uppercase tracking-tight">성역 입장 횟수</span>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-50/50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-100/50 dark:border-slate-700/50">
            <div className="text-[8px] font-bold text-slate-400 dark:text-slate-500 mb-1">기본 / 최대 4</div>
            <input 
              type="number" 
              value={editChar.sanctuaryBasic ?? 0} 
              onChange={(e) => handleLocalUpdate({ sanctuaryBasic: Math.max(0, parseInt(e.target.value) || 0) })} 
              className="w-full bg-transparent text-xs font-black text-slate-900 dark:text-white focus:outline-none" 
            />
          </div>
          <div className="bg-slate-50/50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-100/50 dark:border-slate-700/50">
            <div className="text-[8px] font-bold text-slate-400 dark:text-slate-500 mb-1">추가</div>
            <input 
              type="number" 
              value={editChar.sanctuaryExtra ?? 0} 
              onChange={(e) => handleLocalUpdate({ sanctuaryExtra: Math.max(0, parseInt(e.target.value) || 0) })} 
              className="w-full bg-transparent text-xs font-black text-slate-900 dark:text-white focus:outline-none" 
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <span className="text-[9px] font-black text-slate-700 dark:text-slate-400 px-1 uppercase tracking-tight">성역 보상 횟수</span>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-50/50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-100/50 dark:border-slate-700/50">
            <div className="text-[8px] font-bold text-slate-400 dark:text-slate-500 mb-1">기본 / 최대 2</div>
            <input 
              type="number" 
              value={editChar.sanctuaryKillsBasic ?? 0} 
              onChange={(e) => handleLocalUpdate({ sanctuaryKillsBasic: Math.max(0, parseInt(e.target.value) || 0) })} 
              className="w-full bg-transparent text-xs font-black text-slate-900 dark:text-white focus:outline-none" 
            />
          </div>
          <div className="bg-slate-50/50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-100/50 dark:border-slate-700/50">
            <div className="text-[8px] font-bold text-slate-400 dark:text-slate-500 mb-1">추가 티켓</div>
            <input 
              type="number" 
              value={editChar.sanctuaryKillsExtra ?? 0} 
              onChange={(e) => handleLocalUpdate({ sanctuaryKillsExtra: Math.max(0, parseInt(e.target.value) || 0) })} 
              className="w-full bg-transparent text-xs font-black text-slate-900 dark:text-white focus:outline-none" 
            />
          </div>
        </div>
      </div>

      {/* Footer Buttons */}
      <div className="flex gap-2 pt-1 mt-auto">
        <button 
          onClick={handleSave}
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
