'use client';

import { Download, Upload, RotateCcw, HelpCircle, Check, SquarePen, ChevronUp, ChevronDown, Eye, EyeOff, Copy, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Reorder, useDragControls } from 'framer-motion';
import { auth } from '@/lib/firebase';
import { useAionData } from '@/hooks/useAionData';
import { ODE_MAX_NORMAL, ODE_MAX_MEMBERSHIP, SHUGO_MAX_BASIC, INVASION_MAX_BASIC } from '@/lib/engine';
import { useState, useRef } from 'react';

export default function Dashboard() {
  const { accounts, characters, loading, stats, executeAction, manualAdjust, toggleCheck, backupData, restoreData, updateCharacter, reorderCharacters, syncKey, updateSyncKey } = useAionData();
  const [showKey, setShowKey] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const isValidSyncKey = (key: string) => /^[A-Z0-9]{8}$/.test(key.trim().toUpperCase());

  const handleCopyKey = () => {
    const keyToCopy = syncKey;
    navigator.clipboard.writeText(keyToCopy).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }).catch(() => {
      const textArea = document.createElement("textarea");
      textArea.value = keyToCopy;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      } catch (err) {}
      document.body.removeChild(textArea);
    });
  };

  const ode400Plus = characters.filter(c => (c.ode || 0) >= 400).length;
  const ode720Plus = characters.filter(c => (c.ode || 0) >= 720).length;

  return (
    <div className="container-custom py-8">
      {/* Header Section */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-neutral-100 tracking-tight flex items-center gap-2 mb-1">
            대시보드
          </h1>
          <p className="text-[11px] text-slate-500 dark:text-neutral-400 font-bold">
            AION2에서 이번주 할일을 한눈에 확인하세요.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex gap-2">
            <div className="flex bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden shadow-sm transition-all dark:hover:shadow-[0_0_20px_rgba(99,102,241,0.1)] dark:hover:border-slate-700">
              {syncKey && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50/50 dark:bg-slate-950 border-r border-slate-100 dark:border-slate-800">
                  <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">KEY</span>
                  <span className="text-[11px] font-black text-emerald-600 dark:text-emerald-400 font-mono tracking-wider min-w-[70px]">
                    {showKey ? syncKey : '••••••••'}
                  </span>
                  <button 
                    onClick={() => setShowKey(!showKey)}
                    className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded transition-all active:scale-90"
                  >
                    {showKey ? <EyeOff size={11} className="text-slate-400 dark:text-slate-500" /> : <Eye size={11} className="text-slate-400 dark:text-slate-500" />}
                  </button>
                </div>
              )}
              <button 
                onClick={handleCopyKey}
                className={cn(
                  "px-3 py-1.5 font-black text-[11px] transition-all border-r border-slate-100 dark:border-slate-800 flex items-center gap-1.5 active:scale-95",
                  copySuccess 
                    ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30" 
                    : "text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/40"
                )}
              >
                {copySuccess ? <><Check size={12} strokeWidth={3} /> 복사됨!</> : <><Copy size={12} strokeWidth={3} /> 키 복사</>}
              </button>
              <button 
                onClick={() => {
                  const key = prompt('연결할 8자리 키를 입력하세요:', '');
                  if (key && isValidSyncKey(key)) {
                    updateSyncKey(key.trim().toUpperCase());
                  } else if (key) {
                    alert('영문/숫자로 된 8자리 키를 입력해 주세요.');
                  }
                }}
                className="px-3 py-1.5 text-slate-500 dark:text-slate-400 font-bold text-[11px] hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-95"
              >
                📥 키 연결
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Top Summary Grid - Re-scaled to 2:1:1 ratio */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <div className="md:col-span-2">
          <SummaryCard title="총 보유 오드" rightLabel={`충전까지 ${stats.timeUntilMax}`}>
            <div className="space-y-4 mt-2">
              <OdeBar label="기본오드" value={stats.totalOde} max={stats.totalOdeMax} color="bg-emerald-400" />
              <OdeBar label="추가오드" value={stats.totalExtraOde} max={stats.totalExtraOdeMax} color="bg-blue-500" />
            </div>
          </SummaryCard>
        </div>

        <div className="md:col-span-1">
          <SummaryCard title="기본오드 400+">
            <div className="flex items-baseline gap-1 mt-2">
              <span className="text-4xl font-black text-blue-500 tracking-tighter">{ode400Plus}</span>
              <span className="text-[12px] text-slate-400 dark:text-slate-500 font-bold">캐릭터 수</span>
            </div>
          </SummaryCard>
        </div>

        <div className="md:col-span-1">
          <SummaryCard title="기본오드 720+">
            <div className="flex items-baseline gap-1 mt-2">
              <span className="text-4xl font-black text-red-500 tracking-tighter">{ode720Plus}</span>
              <span className="text-[12px] text-slate-400 dark:text-slate-500 font-bold">캐릭터 수</span>
            </div>
          </SummaryCard>
        </div>
      </div>

      {/* Ticket Summary Grid - Re-scaled to be more compact */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <TicketSummaryCard title="원정(정복)" subTitle="100% 보상 기준: 63회" count={accounts.reduce((s, a) => s + (a.expeditionCount || 0), 0)} total={63 * (accounts.length || 1)} unit="회" type="expedition" />
        <TicketSummaryCard title="초월" subTitle="100% 보상 기준: 42회" count={accounts.reduce((s, a) => s + (a.transcendenceCount || 0), 0)} total={42 * (accounts.length || 1)} unit="회" type="transcendence" />
        <TicketSummaryCard title="슈고" subTitle="기본 티켓 보유량" count={stats.totalShugo} total={SHUGO_MAX_BASIC * (accounts.length || 1)} unit="장" type="sanctuary" />
        <TicketSummaryCard title="침공" subTitle="기본 티켓 보유량" count={stats.totalInvasion} total={INVASION_MAX_BASIC * (accounts.length || 1)} unit="장" type="sanctuary" />
      </div>

      {/* Character List Header */}
      <div className="flex justify-between items-end mb-3 px-1">
        <div className="flex items-center gap-2">
          <span className="font-black text-slate-800 dark:text-white text-[13px] tracking-tight uppercase">캐릭터 목록</span>
          <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded text-[10px] font-black">{characters.length}</span>
        </div>
        <div className="text-[10px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-tight">좌클릭 실행 · 우클릭 취소</div>
      </div>

      {/* Character Table Container */}
      <div className="bg-white dark:bg-slate-900/40 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-[0_1px_3px_rgba(0,0,0,0.01)] transition-colors">
        <CharacterTable 
          accounts={accounts} 
          characters={characters} 
          onExecute={executeAction} 
          onManual={manualAdjust}
          onToggle={toggleCheck}
          onUpdateChar={updateCharacter}
          onReorder={reorderCharacters}
        />
      </div>
    </div>
  );
}

function SummaryCard({ title, children, rightLabel }: { title: string, children: React.ReactNode, rightLabel?: string }) {
  return (
    <div className="card-flat p-5 flex flex-col justify-between dark:bg-slate-900/60 min-h-[120px]">
      <div className="flex justify-between items-center mb-1">
        <div className="text-[12px] font-bold text-slate-500 dark:text-neutral-400 tracking-tight">{title}</div>
        {rightLabel && <div className="text-[11px] font-medium text-slate-400 dark:text-neutral-500">{rightLabel}</div>}
      </div>
      {children}
    </div>
  );
}

function OdeBar({ label, value, max, color }: { label: string, value: number, max: number, color: string }) {
  const percent = Math.min(100, (value / max) * 100);
  return (
    <div>
      <div className="flex justify-between items-end mb-1.5">
        <span className={cn("text-[11px] font-bold", value === 0 ? "text-slate-300 dark:text-neutral-600" : "text-slate-700 dark:text-neutral-300")}>{label}</span>
        <div className="flex items-baseline gap-1">
          <span className="text-[15px] font-black text-slate-900 dark:text-white leading-none">{Math.floor(value).toLocaleString()}</span>
          <span className="text-[11px] font-bold text-slate-300 dark:text-neutral-600 leading-none">/ {max.toLocaleString()}</span>
        </div>
      </div>
      <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-700 ease-out", color)} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function getPenaltyInfo(type: 'expedition' | 'transcendence' | 'sanctuary', count: number) {
  const stages = type === 'expedition' 
    ? [63, 77, 91, 105] 
    : [42, 49, 56, 63];
    
  // sanctuary나 데이터가 없는 경우 안전한 기본값 리턴
  if (type === 'sanctuary') return { rate: 100, label: '100%', color: 'text-slate-400', bg: 'bg-slate-400' };

  if (count <= stages[0]) return { rate: 100, label: '100%', color: 'text-emerald-500', bg: 'bg-emerald-500' };
  if (count <= stages[1]) return { rate: 80, label: '80%', color: 'text-amber-500', bg: 'bg-amber-500' };
  if (count <= stages[2]) return { rate: 60, label: '60%', color: 'text-orange-500', bg: 'bg-orange-500' };
  if (count <= stages[3]) return { rate: 40, label: '40%', color: 'text-red-500', bg: 'bg-red-500' };
  return { rate: 20, label: '20%', color: 'text-purple-500', bg: 'bg-purple-500' };
}

function TicketSummaryCard({ title, subTitle, count, total, unit, type }: { title: string, subTitle: string, count: number, total: number, unit: string, type: 'expedition' | 'transcendence' | 'sanctuary' }) {
  const penalty = getPenaltyInfo(type, count);
  const percent = Math.min(100, (count / total) * 100);
  const segments = 30; 
  
  return (
    <div className="card-flat p-5 dark:bg-slate-900/60">
      <div className="flex justify-between items-start mb-1">
        <span className="text-[13px] font-bold text-slate-600 dark:text-slate-400 tracking-tight">{title}</span>
        {type !== 'sanctuary' && penalty && (
          <div className={cn("text-[10px] font-black px-1.5 py-0.5 rounded uppercase flex items-center gap-1", penalty.color.replace('text', 'bg').replace('500', '500/10'), penalty.color)}>
             보상 {penalty.label}
          </div>
        )}
      </div>
      <div className="text-[10px] font-medium text-slate-400 dark:text-neutral-500 uppercase mb-3">{subTitle}</div>
      <div className="flex items-baseline gap-1 mb-4">
        <span className={cn("text-3xl font-black tracking-tighter", penalty ? penalty.color : "text-slate-900 dark:text-white")}>{count}</span>
        <span className="text-[12px] font-bold text-slate-300 dark:text-neutral-600">/ {total}{unit}</span>
      </div>
      
      <div className="flex gap-[2px] mb-3">
        {Array.from({ length: segments }).map((_, i) => (
          <div key={i} className={cn(
            "flex-1 h-2.5 rounded-[1.5px] transition-colors duration-500", 
            i < (percent/100 * segments) 
              ? (penalty ? penalty.bg : "bg-indigo-400 dark:bg-indigo-500") 
              : "bg-slate-100 dark:bg-slate-800/50"
          )} />
        ))}
      </div>
    </div>
  );
}

function CharacterTable({ accounts, characters, onExecute, onManual, onToggle, onUpdateChar, onReorder }: {
  accounts: any[],
  characters: any[],
  onExecute: any,
  onManual: any,
  onToggle: any,
  onUpdateChar: any,
  onReorder: (newOrder: any[]) => void
}) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-left border-collapse min-w-[1200px] table-compact">
        {accounts.map((acc: any) => (
          <AccountGroup 
             key={acc.id} 
             account={acc} 
             characters={characters.filter((c: any) => c.accountId === acc.id)} 
             allCharacters={characters}
             onExecute={onExecute}
             onManual={onManual}
             onToggle={onToggle}
             onUpdateChar={onUpdateChar}
             onReorder={onReorder}
          />
        ))}
      </table>
    </div>
  );
}

function AccountGroup({ account, characters, allCharacters, onExecute, onManual, onToggle, onUpdateChar, onReorder }: {
  account: any,
  characters: any[],
  allCharacters: any[],
  onExecute: any,
  onManual: any,
  onToggle: any,
  onUpdateChar: any,
  onReorder: (newOrder: any[]) => void
}) {
  const [collapsed, setCollapsed] = useState(false);

  const handleReorder = (reorderedChars: any[]) => {
    // 이 계정의 캐릭터들만 순서 변경
    const otherChars = allCharacters.filter(c => c.accountId !== account.id);
    onReorder([...otherChars, ...reorderedChars]);
  };

  const handleAction = (e: React.MouseEvent, type: string) => {
    e.preventDefault();
    const isUndo = e.type === 'contextmenu';
    onExecute(account.id, isUndo ? `${type}_undo` : type, true);
  };

  const charHandleAction = (e: React.MouseEvent, charId: string, type: string) => {
    e.preventDefault();
    const isUndo = e.type === 'contextmenu';
    onExecute(charId, isUndo ? `${type}_undo` : type, false);
  };

  return (
    <>
      <tbody className="bg-slate-50/30 dark:bg-slate-900/40 cursor-pointer select-none group/acc" onClick={() => setCollapsed(!collapsed)}>
        <tr className="border-t border-slate-100 dark:border-slate-800">
          <td colSpan={13} className="px-6 py-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-[13px] font-black text-slate-800 dark:text-white tracking-tight">{account.name || '미지정 계정'}</span>
                <button 
                  onClick={(e) => { e.stopPropagation(); onToggle(account.id, 'membership', true); }}
                  className={cn(
                    "px-2 py-0.5 text-[9px] font-black rounded border transition-all active:scale-90",
                    account.membership 
                      ? "bg-indigo-500 border-indigo-500 text-white shadow-[0_0_10px_rgba(99,102,241,0.3)]" 
                      : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400"
                  )}
                >
                  {account.membership ? '멤버십 ON' : '멤버십 OFF'}
                </button>
                <span className="px-1.5 py-0.5 bg-white dark:bg-slate-800 text-[10px] text-slate-400 dark:text-slate-500 font-black rounded border border-slate-100 dark:border-slate-700 shadow-[0_1px_2px_rgba(0,0,0,0.02)] group-hover/acc:border-indigo-200 dark:group-hover/acc:border-indigo-900 transition-colors">캐릭터 {characters.length}명</span>
                
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-tight ml-1">
                   <div className="flex items-center gap-1">
                     <span className="text-slate-400 dark:text-slate-500">원정</span>
                     <span className={cn("px-1.5 py-0.5 rounded", getPenaltyInfo('expedition', account.expeditionCount || 0).bg.replace('bg-', 'bg-').replace('500', '500/10'), getPenaltyInfo('expedition', account.expeditionCount || 0).color)}>
                       {account.expeditionCount || 0}회 ({getPenaltyInfo('expedition', account.expeditionCount || 0).label})
                     </span>
                   </div>
                   <div className="flex items-center gap-1">
                     <span className="text-slate-400 dark:text-slate-500">초월</span>
                     <span className={cn("px-1.5 py-0.5 rounded", getPenaltyInfo('transcendence', account.transcendenceCount || 0).bg.replace('bg-', 'bg-').replace('500', '500/10'), getPenaltyInfo('transcendence', account.transcendenceCount || 0).color)}>
                       {account.transcendenceCount || 0}회 ({getPenaltyInfo('transcendence', account.transcendenceCount || 0).label})
                     </span>
                   </div>
                </div>
              </div>
              
              <div className="flex items-center gap-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-3">
                  <AccountAction 
                    label="슈고" 
                    base={account.shugoBasic} 
                    extra={account.shugoExtra}
                    onBase={(d) => onManual(account.id, 'shugoBasic', d, true)}
                    onExtra={(d) => onManual(account.id, 'shugoExtra', d, true)}
                    onExecute={(e) => handleAction(e, 'shugo')}
                  />
                  
                  <AccountAction 
                    label="침공" 
                    base={account.invasionBasic} 
                    extra={account.invasionExtra}
                    onBase={(d) => onManual(account.id, 'invasionBasic', d, true)}
                    onExtra={(d) => onManual(account.id, 'invasionExtra', d, true)}
                    onExecute={(e) => handleAction(e, 'invasion')}
                  />
                </div>
                <div className="text-slate-300 dark:text-slate-700 group-hover/acc:text-indigo-500 transition-colors">
                  {collapsed ? <ChevronDown size={18} strokeWidth={3} /> : <ChevronUp size={18} strokeWidth={3} />}
                </div>
              </div>
            </div>
          </td>
        </tr>
      </tbody>
      
      {!collapsed && (
        <>
          <tbody className="bg-slate-50/50 dark:bg-slate-900/20 border-b border-slate-100 dark:border-slate-800/50">
            <tr>
              <th className="px-6 py-3 text-[10px] font-black text-slate-400 dark:text-neutral-400 uppercase tracking-tight w-48 whitespace-nowrap">캐릭터</th>
              <th className="px-6 py-3 text-[10px] font-black text-slate-400 dark:text-neutral-400 uppercase tracking-tight w-32 whitespace-nowrap">오드</th>
              <th className="px-6 py-3 text-[10px] font-black text-slate-400 dark:text-neutral-400 uppercase tracking-tight w-44 whitespace-nowrap">원정 티켓</th>
              <th className="px-6 py-3 text-[10px] font-black text-slate-400 dark:text-neutral-400 uppercase tracking-tight w-44 whitespace-nowrap">초월 티켓</th>
              <th className="px-6 py-3 text-[10px] font-black text-slate-400 dark:text-neutral-400 uppercase tracking-tight w-44 whitespace-nowrap">성역 티켓</th>
              <th className="px-6 py-3 text-[10px] font-black text-slate-400 dark:text-neutral-400 uppercase tracking-tight text-center w-20 whitespace-nowrap">사명</th>
              <th className="px-6 py-3 text-[10px] font-black text-slate-400 dark:text-neutral-400 uppercase tracking-tight text-center w-20 whitespace-nowrap">일일던전</th>
              <th className="px-6 py-3 text-[10px] font-black text-slate-400 dark:text-neutral-400 uppercase tracking-tight text-center w-20 whitespace-nowrap">회랑</th>
              <th className="px-6 py-3 text-[10px] font-black text-slate-400 dark:text-neutral-400 uppercase tracking-tight text-center w-20 whitespace-nowrap">각성</th>
              <th className="px-6 py-3 text-[10px] font-black text-slate-400 dark:text-neutral-400 uppercase tracking-tight text-center w-20 whitespace-nowrap">악몽</th>
              <th className="px-6 py-3 text-[10px] font-black text-slate-400 dark:text-neutral-400 uppercase tracking-tight text-center w-20 whitespace-nowrap">원정</th>
              <th className="px-6 py-3 text-[10px] font-black text-slate-400 dark:text-neutral-400 uppercase tracking-tight text-center w-20 whitespace-nowrap">초월</th>
              <th className="px-6 py-3 text-[10px] font-black text-slate-400 dark:text-neutral-400 uppercase tracking-tight text-center w-20 whitespace-nowrap">성역</th>
            </tr>
          </tbody>
          <Reorder.Group as="tbody" axis="y" values={characters} onReorder={handleReorder}>
            {characters.map((char: any) => (
              <CharacterRow 
                key={char.id}
                char={char}
                account={account}
                onManual={onManual}
                charHandleAction={charHandleAction}
                onToggle={onToggle}
              />
            ))}
          </Reorder.Group>
        </>
      )}
    </>
  );
}

function CharacterRow({ char, account, onManual, charHandleAction, onToggle }: any) {
  const controls = useDragControls();

  return (
    <Reorder.Item 
      value={char} 
      as="tr" 
      dragListener={false} 
      dragControls={controls}
      className="border-b border-slate-50 dark:border-slate-800/50 last:border-b-0 hover:bg-slate-50/20 dark:hover:bg-slate-800/20 transition-colors group/row"
    >
      <td className="px-6 py-3">
        <div className="flex items-center gap-3">
          <div 
            onPointerDown={(e) => controls.start(e)}
            className="cursor-grab active:cursor-grabbing p-1 -ml-2 text-slate-200 dark:text-slate-800 group-hover/row:text-slate-400 dark:group-hover/row:text-slate-600 transition-colors"
          >
            <GripVertical size={16} />
          </div>
          <div className={cn("w-2.5 h-2.5 rounded-full shrink-0 shadow-sm", char.color || 'bg-indigo-400')} />
          <div className="min-w-0">
            <div className="text-[14px] font-black text-slate-900 dark:text-slate-100 leading-tight tracking-tight truncate whitespace-nowrap">{char.name}</div>
            <div className="text-[11px] text-slate-400 dark:text-neutral-500 font-black leading-tight mt-0.5 uppercase truncate">{char.className}</div>
          </div>
        </div>
      </td>
              <td className="px-6 py-3">
                 <div className="text-[14px] font-black text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <ClickableValue 
                      label="기본 오드" 
                      value={Math.floor(char.ode || 0)} 
                      delta={10} 
                      onAdjust={(d) => onManual(char.id, 'ode', d)}
                      color="text-slate-900 dark:text-slate-100"
                      noPlus
                      size="text-[14px]"
                    />
                    <ClickableValue 
                      label="추가 오드" 
                      value={char.odeExtra || 0} 
                      delta={10} 
                      onAdjust={(d) => onManual(char.id, 'odeExtra', d)}
                      color="text-blue-500 dark:text-blue-400"
                      size="text-[14px]"
                    />
                 </div>
                 <div className="text-[10px] text-slate-300 dark:text-slate-700 font-black uppercase tracking-widest mt-0.5">비용 {account.membership ? 80 : 40}</div>
              </td>
              <td className="px-6 py-3">
                 <div className="text-[14px] font-black flex items-center gap-1.5 mb-0.5">
                    <ClickableValue 
                      label="보상 횟수" 
                      value={char.expeditionBasic || 0} 
                      delta={1} 
                      onAdjust={(d) => onManual(char.id, 'expeditionBasic', d)}
                      color="text-slate-900 dark:text-slate-100"
                      noPlus
                      size="text-[14px]"
                    />
                    <ClickableValue 
                      label="추가 보상 횟수" 
                      value={char.expeditionExtra || 0} 
                      delta={1} 
                      onAdjust={(d) => onManual(char.id, 'expeditionExtra', d)}
                      color="text-blue-500 dark:text-blue-400"
                      size="text-[14px]"
                    />
                 </div>
                 <div className="text-[11px] font-black leading-tight flex items-center gap-1">
                    <ClickableValue 
                      label="원정 처치가능횟수" 
                      value={char.expeditionKillsBasic || 0} 
                      delta={1} 
                      onAdjust={(d) => onManual(char.id, 'expeditionKillsBasic', d)}
                      color="text-slate-900 dark:text-slate-100"
                      noPlus
                    />
                    <ClickableValue 
                      label="원정 추가 처치가능횟수" 
                      value={char.expeditionKillsExtra || 0} 
                      delta={1} 
                      onAdjust={(d) => onManual(char.id, 'expeditionKillsExtra', d)}
                      color="text-blue-500 dark:text-blue-400"
                    />
                    <span className="text-slate-300 dark:text-neutral-600 font-bold tracking-tighter"> / 35</span>
                 </div>
              </td>
              <td className="px-6 py-3">
                 <div className="text-[14px] font-black flex items-center gap-1.5 mb-0.5">
                    <ClickableValue 
                      label="보상 횟수" 
                      value={char.transcendenceBasic || 0} 
                      delta={1} 
                      onAdjust={(d) => onManual(char.id, 'transcendenceBasic', d)}
                      color="text-slate-900 dark:text-slate-100"
                      noPlus
                      size="text-[14px]"
                    />
                    <ClickableValue 
                      label="추가 보상 횟수" 
                      value={char.transcendenceExtra || 0} 
                      delta={1} 
                      onAdjust={(d) => onManual(char.id, 'transcendenceExtra', d)}
                      color="text-blue-500 dark:text-blue-400"
                      size="text-[14px]"
                    />
                 </div>
                 <div className="text-[11px] font-black leading-tight flex items-center gap-1">
                    <ClickableValue 
                      label="초월 처치가능횟수" 
                      value={char.transcendenceKillsBasic || 0} 
                      delta={1} 
                      onAdjust={(d) => onManual(char.id, 'transcendenceKillsBasic', d)}
                      color="text-slate-900 dark:text-slate-100"
                      noPlus
                    />
                    <ClickableValue 
                      label="초월 추가 처치가능횟수" 
                      value={char.transcendenceKillsExtra || 0} 
                      delta={1} 
                      onAdjust={(d) => onManual(char.id, 'transcendenceKillsExtra', d)}
                      color="text-blue-500 dark:text-blue-400"
                    />
                    <span className="text-slate-300 dark:text-neutral-600 font-bold tracking-tighter"> / 28</span>
                 </div>
              </td>
              <td className="px-6 py-3">
                 <div className="text-[14px] font-black flex items-center gap-1.5 mb-0.5">
                    <ClickableValue 
                      label="입장 횟수" 
                      value={char.sanctuaryBasic || 0} 
                      delta={1} 
                      onAdjust={(d) => onManual(char.id, 'sanctuaryBasic', d)}
                      color="text-slate-900 dark:text-slate-100"
                      noPlus
                      size="text-[14px]"
                    />
                    <ClickableValue 
                      label="추가 입장 횟수" 
                      value={char.sanctuaryExtra || 0} 
                      delta={1} 
                      onAdjust={(d) => onManual(char.id, 'sanctuaryExtra', d)}
                      color="text-blue-500 dark:text-blue-400"
                      size="text-[14px]"
                    />
                 </div>
                 <div className="text-[11px] font-black leading-tight flex items-center gap-1">
                    <ClickableValue 
                      label="보상 횟수" 
                      value={char.sanctuaryKillsBasic || 0} 
                      delta={1} 
                      onAdjust={(d) => onManual(char.id, 'sanctuaryKillsBasic', d)}
                      color="text-slate-900 dark:text-slate-100"
                      noPlus
                    />
                    <ClickableValue 
                      label="추가 보상 횟수" 
                      value={char.sanctuaryKillsExtra || 0} 
                      delta={1} 
                      onAdjust={(d) => onManual(char.id, 'sanctuaryKillsExtra', d)}
                      color="text-blue-500 dark:text-blue-400"
                    />
                    <span className="text-slate-300 dark:text-neutral-600 font-bold tracking-tighter"> / 2</span>
                  </div>
              </td>
              <td className="px-6 py-3 text-center">
                <input type="checkbox" checked={(account.mission || 0) >= 5} onChange={() => onToggle(account.id, 'mission', true)} className="w-5 h-5 rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-indigo-500 focus:ring-indigo-500/20 shadow-sm" />
              </td>
              <td className="px-6 py-3 text-center">
                <input type="checkbox" checked={(account.dailyDungeon || 0) >= 1} onChange={() => onToggle(account.id, 'dailyDungeon', true)} className="w-5 h-5 rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-indigo-500 focus:ring-indigo-500/20 shadow-sm" />
              </td>
              <td className="px-6 py-3 text-center">
                <input type="checkbox" checked={(char.corridor || 0) >= 6} onChange={() => onToggle(char.id, 'corridor')} className="w-5 h-5 rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-indigo-500 focus:ring-indigo-500/20 shadow-sm" />
              </td>
              <td className="px-6 py-3 text-center">
                <input type="checkbox" checked={(char.awakening || 0) >= 3} onChange={() => onToggle(char.id, 'awakening')} className="w-5 h-5 rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-indigo-500 focus:ring-indigo-500/20 shadow-sm" />
              </td>
              <td className="px-6 py-3 text-center">
                <input type="checkbox" checked={(char.nightmare || 0) >= 14} onChange={() => onToggle(char.id, 'nightmare')} className="w-5 h-5 rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-indigo-500 focus:ring-indigo-500/20 shadow-sm" />
              </td>
              <td className="px-6 py-3 text-center">
                <ActionButtonWithTooltip 
                  label="원정 실행" 
                  desc={account.membership ? "오드 80 + 보상 횟수 1회 소모" : "오드 40 + 보상 횟수 1회 소모"}
                  onClick={(e) => charHandleAction(e, char.id, 'expedition')}
                />
              </td>
              <td className="px-6 py-3 text-center">
                <ActionButtonWithTooltip 
                  label="초월 실행" 
                  desc={account.membership ? "오드 80 + 보상 횟수 1회 소모" : "오드 40 + 보상 횟수 1회 소모"}
                  onClick={(e) => charHandleAction(e, char.id, 'transcendence')}
                />
              </td>
              <td className="px-6 py-3 text-center">
                <ActionButtonWithTooltip 
                  label="성역 실행" 
                  desc={account.membership ? "오드 80 + 입장 횟수 1회 + 보상 횟수 1회 소모" : "오드 40 + 입장 횟수 1회 + 보상 횟수 1회 소모"}
                  onClick={(e) => charHandleAction(e, char.id, 'sanctuary')}
                />
              </td>
    </Reorder.Item>
  );
}

function ActionButtonWithTooltip({ label, desc, onClick }: { label: string, desc: string, onClick: (e: any) => void }) {
  const [showTooltip, setShowTooltip] = useState(false);
  
  return (
    <div className="relative flex justify-center">
      <button 
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={onClick}
        onContextMenu={onClick}
        className="w-9 h-9 bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700 rounded-xl flex items-center justify-center text-slate-200 dark:text-slate-700 hover:text-indigo-500 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-slate-700 hover:border-indigo-200 dark:hover:border-indigo-500 transition-all shadow-sm active:scale-90 hover:-translate-y-0.5 dark:hover:shadow-[0_0_15px_rgba(99,102,241,0.15)]"
      >
        <Check size={18} strokeWidth={3} />
      </button>

      {showTooltip && (
        <div className="absolute bottom-full right-0 mb-2 z-[100] animate-in fade-in slide-in-from-bottom-1 duration-200 pointer-events-none">
          <div className="bg-slate-900 dark:bg-slate-950 text-white px-3 py-2 rounded-xl shadow-xl whitespace-nowrap border border-slate-800">
            <div className="text-[11px] font-black mb-1 text-center tracking-tight">{label}</div>
            <div className="text-[10px] font-black text-slate-400 dark:text-neutral-400 text-center">{desc}</div>
          </div>
          <div className="w-2.5 h-2.5 bg-slate-900 dark:bg-slate-950 rotate-45 ml-auto mr-3 -mt-1.5 shadow-xl border-r border-b border-slate-800" />
        </div>
      )}
    </div>
  );
}

function AccountControl({ label, checked, onChange }: { label: string, checked: boolean, onChange: () => void }) {
  return (
    <div className="flex items-center gap-2 border border-slate-100 dark:border-slate-800 rounded-xl px-3 py-1.5 bg-white dark:bg-slate-900 shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-colors">
      <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tight">{label}</span>
      <input 
        type="checkbox" 
        checked={checked}
        onChange={onChange}
        className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-indigo-500 focus:ring-indigo-500/20" 
      />
    </div>
  );
}

function AccountAction({ label, base, extra, onBase, onExtra, onExecute }: {
  label: string,
  base: number,
  extra: number,
  onBase: (d: number) => void,
  onExtra: (d: number) => void,
  onExecute: (e: any) => void
}) {
  return (
    <div className="flex items-center gap-3 border border-slate-100 dark:border-slate-800 rounded-xl pl-4 pr-1.5 py-1.5 bg-white dark:bg-slate-900 shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-colors">
      <div className="flex flex-col items-end">
        <span className="text-[9px] font-black text-slate-400 dark:text-neutral-500 uppercase leading-none mb-1">{label}</span>
        <span className="text-[11px] font-black flex gap-1 items-center">
          <ClickableValue 
            label={`${label} 기본 티켓`}
            value={Math.floor(base || 0)} 
            delta={1} 
            onAdjust={onBase}
            color="text-slate-900 dark:text-slate-100"
            noPlus
          />
          <ClickableValue 
            label={`${label} 추가 티켓`}
            value={extra || 0} 
            delta={1} 
            onAdjust={onExtra}
            color="text-blue-500 dark:text-blue-400"
          />
        </span>
      </div>
      <button 
        onClick={onExecute}
        onContextMenu={onExecute}
        className="w-8 h-8 bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700 rounded-lg flex items-center justify-center text-slate-200 dark:text-slate-700 hover:text-indigo-500 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-slate-700 hover:border-indigo-200 dark:hover:border-indigo-500 transition-all active:scale-90 shadow-sm hover:-translate-y-0.5 dark:hover:shadow-[0_0_12px_rgba(99,102,241,0.2)]"
      >
        <Check size={16} strokeWidth={3} />
      </button>
    </div>
  );
}

function ClickableValue({ label, value, delta, onAdjust, color, noPlus, size = "text-[11px]" }: {
  label: string,
  value: number,
  delta: number,
  onAdjust: (d: number) => void,
  color: string,
  noPlus?: boolean,
  size?: string
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div 
      className={cn("relative cursor-pointer select-none px-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors font-black", color, size)}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={() => onAdjust(delta)}
      onContextMenu={(e) => { e.preventDefault(); onAdjust(-delta); }}
    >
      {noPlus ? "" : "+"}{value}
      
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-[100] animate-in fade-in slide-in-from-top-1 duration-200 pointer-events-none">
          <div className="bg-slate-900 text-white px-3 py-2 rounded-xl shadow-xl whitespace-nowrap border border-slate-800">
            <div className="text-[10px] font-black mb-1 text-center tracking-tight">{label}</div>
            <div className="text-[9px] font-black text-slate-400 flex gap-2 items-center justify-center">
               <span>좌클릭 +{delta}</span>
               <div className="w-[1px] h-2 bg-slate-700" />
               <span>우클릭 -{delta}</span>
            </div>
          </div>
          <div className="w-2.5 h-2.5 bg-slate-900 rotate-45 mx-auto -mt-1.5 shadow-xl border-r border-b border-slate-800" />
        </div>
      )}
    </div>
  );
}
