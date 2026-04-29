'use client';

import { useState, useEffect, useCallback } from 'react';
import { db, auth } from '@/lib/firebase';
import { ref, onValue, update, set, remove, get } from 'firebase/database';
import { calculateCurrentState, getTimeUntilNextRecharge, getKSTNow, ODE_MAX_NORMAL, ODE_MAX_MEMBERSHIP, ODE_EXTRA_MAX, SHUGO_MAX_BASIC, INVASION_MAX_BASIC } from '@/lib/engine';
import { signInAnonymously } from 'firebase/auth';

// 6자리 무작위 키 생성기 (슈고 알리미 스타일)
function generateShortKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; 
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function useAionData() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [characters, setCharacters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(getKSTNow());
  const [syncKey, setSyncKey] = useState<string>("");

  // 1. 초기 키 로드 및 익명 인증
  useEffect(() => {
    const init = async () => {
      // 익명 로그인 (보안 규칙 통과용)
      try {
        if (!auth.currentUser) await signInAnonymously(auth);
      } catch (e) { console.error('Auth failed', e); }

      // 키 로드 및 레거시 정리
      let savedKey = localStorage.getItem('aion_sync_key');
      if (!savedKey || savedKey.length !== 8) {
        savedKey = generateShortKey();
        localStorage.setItem('aion_sync_key', savedKey);
      }
      setSyncKey(savedKey.toUpperCase());
    };
    init();
  }, []);

  // 2. 타이머 틱
  useEffect(() => {
    const timer = setInterval(() => setNow(getKSTNow()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 3. 데이터 로딩 (무한 루프 방지 위해 단순화)
  useEffect(() => {
    if (!syncKey) return;

    setLoading(true);
    const accPath = `users/${syncKey}/od_helper/accounts`;
    const charPath = `users/${syncKey}/od_helper/members`;

    const unsubAcc = onValue(ref(db, accPath), (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.entries(data).map(([id, val]: any) => ({ id, ...val }));
        setAccounts(list);
        localStorage.setItem('aion_accounts', JSON.stringify(list));
      } else {
        setAccounts([]);
      }
      setLoading(false);
    });

    const unsubChar = onValue(ref(db, charPath), (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.entries(data).map(([id, val]: any) => ({ id, ...val }));
        setCharacters(list);
        localStorage.setItem('aion_characters', JSON.stringify(list));
      } else {
        setCharacters([]);
      }
      setLoading(false);
    });

    return () => {
      unsubAcc();
      unsubChar();
    };
  }, [syncKey]);

  // 계산 로직들...
  const processedCharacters = characters
    .sort((a, b) => (a.order || 0) - (b.order || 0) || a.id.localeCompare(b.id))
    .map(char => {
      const acc = accounts.find(a => a.id === char.accountId);
      return calculateCurrentState(char, now, true, acc?.membership || false);
    });
  const processedAccounts = accounts.map(acc => calculateCurrentState(acc, now, false));
  
  const stats = {
    totalOde: processedCharacters.reduce((sum, char) => sum + (char.ode || 0), 0),
    totalOdeMax: characters.reduce((sum, char) => {
      const acc = accounts.find(a => a.id === char.accountId);
      return sum + (acc?.membership ? ODE_MAX_MEMBERSHIP : ODE_MAX_NORMAL);
    }, 0),
    totalExtraOde: processedCharacters.reduce((sum, char) => sum + (char.odeExtra || 0), 0),
    totalExtraOdeMax: characters.length * ODE_EXTRA_MAX,
    totalShugo: processedAccounts.reduce((sum, acc) => sum + (acc.shugoBasic || 0), 0),
    totalShugoMax: accounts.length * SHUGO_MAX_BASIC,
    totalInvasion: processedAccounts.reduce((sum, acc) => sum + (acc.invasionBasic || 0), 0),
    totalInvasionMax: accounts.length * INVASION_MAX_BASIC,
    timeUntilMax: getTimeUntilNextRecharge(now)
  };

  const updateAccount = useCallback(async (id: string, updates: any) => {
    if (!syncKey) return;
    await update(ref(db, `users/${syncKey}/od_helper/accounts/${id}`), updates);
  }, [syncKey]);

  const updateCharacter = useCallback(async (id: string, updates: any) => {
    if (!syncKey) return;
    await update(ref(db, `users/${syncKey}/od_helper/members/${id}`), updates);
  }, [syncKey]);

  const executeAction = async (id: string, type: string, isAccount: boolean = false) => {
    const isUndo = type.endsWith('_undo');
    const actionType = isUndo ? type.replace('_undo', '') : type;
    const updates: any = { lastUpdate: new Date().toISOString() };

    if (isAccount) {
      const account = accounts.find(a => a.id === id);
      if (!account) return;

      if (!isUndo) {
        if (actionType === 'shugo' && (account.shugoBasic || 0) <= 0) {
          alert('슈고 티켓이 부족합니다.');
          return;
        }
        if (actionType === 'invasion' && (account.invasionBasic || 0) <= 0) {
          alert('침공 티켓이 부족합니다.');
          return;
        }
      }

      if (actionType === 'shugo') updates.shugoBasic = Math.max(0, (account.shugoBasic || 0) + (isUndo ? 1 : -1));
      else if (actionType === 'invasion') updates.invasionBasic = Math.max(0, (account.invasionBasic || 0) + (isUndo ? 1 : -1));
      await updateAccount(id, updates);
    } else {
      const char = characters.find(c => c.id === id);
      if (!char) return;
      const account = accounts.find(a => a.id === char.accountId);
      if (!account) return;

      const odeCost = account.membership ? 80 : 40;
      
      // 유효성 검사 (실행 시에만)
      if (!isUndo) {
        // 1. 오드 체크
        if ((char.ode || 0) < odeCost) {
          alert(`오드가 부족합니다. (필요: ${odeCost}, 보유: ${Math.floor(char.ode || 0)})`);
          return;
        }

        // 2. 티켓 및 처치횟수 체크
        if (actionType === 'expedition') {
          const hasTicket = (char.expeditionBasic || 0) > 0 || (char.expeditionExtra || 0) > 0;
          const hasKills = (char.expeditionKillsBasic || 0) > 0 || (char.expeditionKillsExtra || 0) > 0;
          if (!hasTicket) { alert('원정 보상 횟수가 부족하여 실행이 불가합니다.'); return; }
          if (!hasKills) { alert('원정 처치 가능 횟수가 부족하여 실행이 불가합니다.'); return; }
        } else if (actionType === 'transcendence') {
          const hasTicket = (char.transcendenceBasic || 0) > 0 || (char.transcendenceExtra || 0) > 0;
          const hasKills = (char.transcendenceKillsBasic || 0) > 0 || (char.transcendenceKillsExtra || 0) > 0;
          if (!hasTicket) { alert('초월 보상 횟수가 부족하여 실행이 불가합니다.'); return; }
          if (!hasKills) { alert('초월 처치 가능 횟수가 부족하여 실행이 불가합니다.'); return; }
        } else if (actionType === 'sanctuary') {
          const hasTicket = (char.sanctuaryBasic || 0) > 0 || (char.sanctuaryExtra || 0) > 0;
          const hasKills = (char.sanctuaryKillsBasic || 0) > 0 || (char.sanctuaryKillsExtra || 0) > 0;
          if (!hasTicket) { alert('성역 입장 횟수가 부족하여 실행이 불가합니다.'); return; }
          if (!hasKills) { alert('성역 보상 횟수가 부족하여 실행이 불가합니다.'); return; }
        }
      }

      // 실제 차감 로직
      const charUpdates: any = { lastUpdate: new Date().toISOString() };
      
      if (actionType === 'expedition') {
        if (isUndo) {
          charUpdates.ode = (char.ode || 0) + odeCost;
          charUpdates.expeditionBasic = (char.expeditionBasic || 0) + 1; // 단순화: 기본으로 복구
          charUpdates.expeditionKillsBasic = (char.expeditionKillsBasic || 0) + 1;
        } else {
          charUpdates.ode = (char.ode || 0) - odeCost;
          if ((char.expeditionBasic || 0) > 0) charUpdates.expeditionBasic = char.expeditionBasic - 1;
          else charUpdates.expeditionExtra = (char.expeditionExtra || 0) - 1;
          
          if ((char.expeditionKillsBasic || 0) > 0) charUpdates.expeditionKillsBasic = char.expeditionKillsBasic - 1;
          else charUpdates.expeditionKillsExtra = (char.expeditionKillsExtra || 0) - 1;
        }
      } else if (actionType === 'transcendence') {
        if (isUndo) {
          charUpdates.ode = (char.ode || 0) + odeCost;
          charUpdates.transcendenceBasic = (char.transcendenceBasic || 0) + 1;
          charUpdates.transcendenceKillsBasic = (char.transcendenceKillsBasic || 0) + 1;
        } else {
          charUpdates.ode = (char.ode || 0) - odeCost;
          if ((char.transcendenceBasic || 0) > 0) charUpdates.transcendenceBasic = char.transcendenceBasic - 1;
          else charUpdates.transcendenceExtra = (char.transcendenceExtra || 0) - 1;
          
          if ((char.transcendenceKillsBasic || 0) > 0) charUpdates.transcendenceKillsBasic = char.transcendenceKillsBasic - 1;
          else charUpdates.transcendenceKillsExtra = (char.transcendenceKillsExtra || 0) - 1;
        }
      } else if (actionType === 'sanctuary') {
        if (isUndo) {
          charUpdates.ode = (char.ode || 0) + odeCost;
          charUpdates.sanctuaryBasic = (char.sanctuaryBasic || 0) + 1;
          charUpdates.sanctuaryKillsBasic = (char.sanctuaryKillsBasic || 0) + 1;
        } else {
          charUpdates.ode = (char.ode || 0) - odeCost;
          if ((char.sanctuaryBasic || 0) > 0) charUpdates.sanctuaryBasic = char.sanctuaryBasic - 1;
          else charUpdates.sanctuaryExtra = (char.sanctuaryExtra || 0) - 1;
          
          if ((char.sanctuaryKillsBasic || 0) > 0) charUpdates.sanctuaryKillsBasic = char.sanctuaryKillsBasic - 1;
          else charUpdates.sanctuaryKillsExtra = (char.sanctuaryKillsExtra || 0) - 1;
        }
      }

      await updateCharacter(char.id, charUpdates);
      
      // 주간 합산 카운트 업데이트 (통계용)
      const field = actionType === 'expedition' ? 'expeditionCount' : 
                    actionType === 'transcendence' ? 'transcendenceCount' : 'sanctuaryCount';
      const accUpdates: any = { lastUpdate: new Date().toISOString() };
      accUpdates[field] = Math.max(0, (account[field] || 0) + (isUndo ? -1 : 1));
      await updateAccount(account.id, accUpdates);
    }
  };

  const manualAdjust = async (id: string, field: string, delta: number, isAccount: boolean = false) => {
    if (isAccount) {
      const acc = accounts.find(a => a.id === id);
      if (acc) await updateAccount(id, { [field]: Math.max(0, (acc[field] || 0) + delta) });
    } else {
      const char = characters.find(c => c.id === id);
      if (char) {
        const acc = accounts.find(a => a.id === char.accountId);
        const max = field === 'ode' ? (acc?.membership ? ODE_MAX_MEMBERSHIP : ODE_MAX_NORMAL) : field === 'odeExtra' ? ODE_EXTRA_MAX : 9999;
        await updateCharacter(id, { [field]: Math.min(max, Math.max(0, (char[field] || 0) + delta)), lastUpdate: new Date().toISOString() });
      }
    }
  };

  const toggleCheck = async (id: string, field: string, isAccount: boolean = false) => {
    const list = isAccount ? accounts : characters;
    const item = list.find(x => x.id === id);
    if (!item) return;

    const updates: any = {};
    if (isAccount) {
      updates[field] = !item[field];
      await updateAccount(id, updates);
    } else {
      const maxMap: Record<string, number> = {
        mission: 5,
        corridor: 6,
        dailyDungeon: 1,
        awakening: 3,
        attendance: 1
      };

      if (maxMap[field] !== undefined) {
        const current = Number(item[field]) || 0;
        const max = maxMap[field];
        updates[field] = current >= max ? 0 : max;
      } else {
        updates[field] = !item[field];
      }
      await updateCharacter(id, { ...updates, lastUpdate: new Date().toISOString() });
    }
  };

  const backupData = () => {
    const data = { accounts, characters };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aion2_backup_${syncKey}_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  const restoreData = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (data.accounts && data.characters && syncKey) {
          // 서버에 덮어쓰기
          const accs = data.accounts.reduce((acc: any, val: any) => { acc[val.id] = val; return acc; }, {});
          const chars = data.characters.reduce((acc: any, val: any) => { acc[val.id] = val; return acc; }, {});
          await set(ref(db, `users/${syncKey}/od_helper/accounts`), accs);
          await set(ref(db, `users/${syncKey}/od_helper/members`), chars);
          alert('데이터 복구가 완료되었습니다.');
        }
      } catch (err) { alert('잘못된 백업 파일입니다.'); }
    };
    reader.readAsText(file);
  };

  const addAccount = async (name: string = '') => {
    if (!syncKey) return;
    const newId = Date.now().toString();
    const newAccount = { id: newId, name, membership: false, shugoBasic: SHUGO_MAX_BASIC, shugoExtra: 0, invasionBasic: INVASION_MAX_BASIC, invasionExtra: 0, expeditionCount: 0, transcendenceCount: 0, sanctuaryCount: 0, lastUpdate: new Date().toISOString() };
    await set(ref(db, `users/${syncKey}/od_helper/accounts/${newId}`), newAccount);
    return newId;
  };

  const deleteAccount = async (id: string) => {
    if (!syncKey) return;
    await remove(ref(db, `users/${syncKey}/od_helper/accounts/${id}`));
  };

  const addCharacter = async (char: any) => {
    if (!syncKey) return;
    const newId = Date.now().toString();
    const acc = accounts.find(a => a.id === char.accountId);
    const maxOde = acc?.membership ? ODE_MAX_MEMBERSHIP : ODE_MAX_NORMAL;
    
    const newChar = {
      ...char,
      id: newId,
      ode: maxOde,
      odeExtra: 0,
      expeditionBasic: 14, 
      expeditionExtra: 0,
      expeditionKillsBasic: 35,
      expeditionKillsExtra: 0,
      transcendenceBasic: 7,
      transcendenceExtra: 0,
      transcendenceKillsBasic: 28,
      transcendenceKillsExtra: 0,
      sanctuaryBasic: 4,
      sanctuaryExtra: 0,
      sanctuaryKillsBasic: 21,
      sanctuaryKillsExtra: 0,
      mission: 0,
      corridor: 0,
      dailyDungeon: 0,
      awakening: 0,
      attendance: 0,
      lastUpdate: new Date().toISOString()
    };
    await set(ref(db, `users/${syncKey}/od_helper/members/${newId}`), newChar);
  };

  const deleteCharacter = async (id: string) => {
    if (!syncKey) return;
    await remove(ref(db, `users/${syncKey}/od_helper/members/${id}`));
  };

  const reorderCharacters = async (newOrder: any[]) => {
    if (!syncKey) return;
    const updates: any = {};
    newOrder.forEach((char, index) => {
      updates[`${char.id}/order`] = index;
    });
    await update(ref(db, `users/${syncKey}/od_helper/members`), updates);
  };

  const updateSyncKey = (key: string | null) => {
    if (key) {
      const trimmed = key.trim().toUpperCase();
      localStorage.setItem('aion_sync_key', trimmed);
      setSyncKey(trimmed);
    } else {
      const newKey = generateShortKey();
      localStorage.setItem('aion_sync_key', newKey);
      setSyncKey(newKey);
    }
  };

  return {
    accounts: processedAccounts, characters: processedCharacters, loading, stats,
    executeAction, manualAdjust, toggleCheck, backupData, restoreData,
    addAccount, updateAccount, deleteAccount, addCharacter, updateCharacter, deleteCharacter, reorderCharacters,
    updateSyncKey, syncKey
  };
}
