'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { db, auth } from '@/lib/firebase';
import { ref, onValue, update, set, remove } from 'firebase/database';
import { 
  calculateCurrentState, 
  getTimeUntilNextRecharge, 
  getKSTNow, 
  ODE_MAX_NORMAL, 
  ODE_MAX_MEMBERSHIP, 
  ODE_EXTRA_MAX, 
  SHUGO_MAX_BASIC, 
  INVASION_MAX_BASIC,
  EXPEDITION_MAX_BASIC,
  TRANSCENDENCE_MAX_BASIC,
  SANCTUARY_MAX_BASIC,
  EXPEDITION_KILLS_CHAR_LIMIT,
  TRANSCENDENCE_KILLS_CHAR_LIMIT,
  SANCTUARY_KILLS_CHAR_LIMIT
} from '@/lib/engine';
import { signInAnonymously } from 'firebase/auth';

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

  useEffect(() => {
    const init = async () => {
      try {
        if (!auth.currentUser) await signInAnonymously(auth);
      } catch (e) { console.error('Auth failed', e); }

      let savedKey = localStorage.getItem('aion_sync_key');
      if (!savedKey || savedKey.length !== 8) {
        savedKey = generateShortKey();
        localStorage.setItem('aion_sync_key', savedKey);
      }
      setSyncKey(savedKey.toUpperCase());
    };
    init();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(getKSTNow()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!syncKey) return;
    setLoading(true);

    const unsubAcc = onValue(ref(db, `users/${syncKey}/od_helper/accounts`), (snapshot) => {
      const data = snapshot.val();
      const list = data ? Object.entries(data).map(([id, val]: any) => ({ id, ...val })) : [];
      setAccounts(list);
      localStorage.setItem('aion_accounts', JSON.stringify(list));
      setLoading(false);
    });

    const unsubChar = onValue(ref(db, `users/${syncKey}/od_helper/members`), (snapshot) => {
      const data = snapshot.val();
      const list = data ? Object.entries(data).map(([id, val]: any) => ({ id, ...val })) : [];
      setCharacters(list);
      localStorage.setItem('aion_characters', JSON.stringify(list));
      setLoading(false);
    });

    return () => {
      unsubAcc();
      unsubChar();
    };
  }, [syncKey]);

  // 가공된 데이터 (Dashboard용) - useMemo로 참조 무결성 유지
  const processedCharacters = useMemo(() => characters
    .sort((a, b) => (a.order || 0) - (b.order || 0) || a.id.localeCompare(b.id))
    .map(char => {
      const acc = accounts.find(a => a.id === char.accountId);
      return calculateCurrentState(char, now, true, acc?.membership || false);
    }), [characters, accounts, now]);

  const processedAccounts = useMemo(() => accounts.map(acc => calculateCurrentState(acc, now, false)), [accounts, now]);
  
  const stats = useMemo(() => ({
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
  }), [characters, accounts, processedCharacters, processedAccounts, now]);

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
      if (actionType === 'shugo') updates.shugoBasic = Math.max(0, (account.shugoBasic || 0) + (isUndo ? 1 : -1));
      else if (actionType === 'invasion') updates.invasionBasic = Math.max(0, (account.invasionBasic || 0) + (isUndo ? 1 : -1));
      await updateAccount(id, updates);
    } else {
      const char = characters.find(c => c.id === id);
      const account = accounts.find(a => a.id === char?.accountId);
      if (!char || !account) return;

      const calculatedChar = calculateCurrentState(char, getKSTNow(), true, !!account.membership);
      const odeCost = account.membership ? 80 : 40;
      const charUpdates: any = { lastUpdate: new Date().toISOString() };
      
      const handleOdeDeduction = (cost: number) => {
        let remainingCost = cost;
        const baseOde = calculatedChar.ode || 0;
        const extraOde = calculatedChar.odeExtra || 0;
        if (baseOde >= remainingCost) {
          charUpdates.ode = baseOde - remainingCost;
          charUpdates.odeExtra = extraOde;
        } else {
          charUpdates.ode = 0;
          charUpdates.odeExtra = Math.max(0, extraOde - (remainingCost - baseOde));
        }
      };

      if (!isUndo) handleOdeDeduction(odeCost);
      else charUpdates.ode = (calculatedChar.ode || 0) + odeCost;

      const delta = isUndo ? 1 : -1;
      if (actionType === 'expedition') {
        charUpdates.expeditionBasic = (calculatedChar.expeditionBasic || 0) + delta;
        charUpdates.expeditionKillsBasic = (calculatedChar.expeditionKillsBasic || 0) + delta;
      } else if (actionType === 'transcendence') {
        charUpdates.transcendenceBasic = (calculatedChar.transcendenceBasic || 0) + delta;
        charUpdates.transcendenceKillsBasic = (calculatedChar.transcendenceKillsBasic || 0) + delta;
      } else if (actionType === 'sanctuary') {
        charUpdates.sanctuaryBasic = (calculatedChar.sanctuaryBasic || 0) + delta;
        charUpdates.sanctuaryKillsBasic = (calculatedChar.sanctuaryKillsBasic || 0) + delta;
      }

      await updateCharacter(char.id, charUpdates);
      const field = actionType === 'expedition' ? 'expeditionCount' : actionType === 'transcendence' ? 'transcendenceCount' : 'sanctuaryCount';
      await updateAccount(account.id, { [field]: Math.max(0, (account[field] || 0) + (isUndo ? -1 : 1)), lastUpdate: new Date().toISOString() });
    }
  };

  const manualAdjust = async (id: string, field: string, delta: number, isAccount: boolean = false) => {
    if (isAccount) {
      const acc = accounts.find(a => a.id === id);
      if (acc) await updateAccount(id, { [field]: Math.max(0, (acc[field] || 0) + delta) });
    } else {
      const char = characters.find(c => c.id === id);
      if (char) await updateCharacter(id, { [field]: Math.max(0, (char[field] || 0) + delta), lastUpdate: new Date().toISOString() });
    }
  };

  const toggleCheck = async (id: string, field: string, isAccount: boolean = false) => {
    const list = isAccount ? accounts : characters;
    const item = list.find(x => x.id === id);
    if (!item) return;

    if (isAccount) {
      await updateAccount(id, { [field]: !item[field] });
    } else {
      const maxMap: Record<string, number> = {
        mission: 5, corridor: 6, dailyDungeon: 1, awakening: 3, attendance: 1
      };
      const current = Number(item[field]) || 0;
      const max = maxMap[field] || 1;
      const newValue = current >= max ? 0 : max;
      await updateCharacter(id, { [field]: newValue, lastUpdate: new Date().toISOString() });
    }
  };

  const backupData = () => {
    const data = { accounts, characters, syncKey };
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
          const accs = data.accounts.reduce((acc: any, val: any) => ({ ...acc, [val.id]: val }), {});
          const chars = data.characters.reduce((acc: any, val: any) => ({ ...acc, [val.id]: val }), {});
          await set(ref(db, `users/${syncKey}/od_helper/accounts`), accs);
          await set(ref(db, `users/${syncKey}/od_helper/members`), chars);
        }
      } catch (err) { alert('복구 실패'); }
    };
    reader.readAsText(file);
  };

  const addAccount = async (name: string = '') => {
    if (!syncKey) return;
    const newId = Date.now().toString();
    const newAcc = {
      name,
      membership: false,
      shugoBasic: SHUGO_MAX_BASIC,
      invasionBasic: INVASION_MAX_BASIC,
      expeditionCount: 0,
      transcendenceCount: 0,
      sanctuaryCount: 0,
      lastUpdate: new Date().toISOString()
    };
    await set(ref(db, `users/${syncKey}/od_helper/accounts/${newId}`), newAcc);
  };

  const deleteAccount = async (id: string) => {
    if (!syncKey) return;
    await remove(ref(db, `users/${syncKey}/od_helper/accounts/${id}`));
  };

  const addCharacter = async (data: any) => {
    if (!syncKey) return;
    const newId = Date.now().toString();
    
    // 현재 캐릭터들 중 가장 높은 order 값 찾기
    const maxOrder = characters.length > 0 
      ? Math.max(...characters.map(c => c.order || 0)) 
      : -1;

    const newChar = {
      ...data,
      order: maxOrder + 1, // 맨 뒤에 추가
      ode: 0,
      odeExtra: 0,
      expeditionBasic: EXPEDITION_MAX_BASIC,
      expeditionExtra: 0,
      expeditionKillsBasic: EXPEDITION_KILLS_CHAR_LIMIT,
      expeditionKillsExtra: 0,
      transcendenceBasic: TRANSCENDENCE_MAX_BASIC,
      transcendenceExtra: 0,
      transcendenceKillsBasic: TRANSCENDENCE_KILLS_CHAR_LIMIT,
      transcendenceKillsExtra: 0,
      sanctuaryBasic: SANCTUARY_MAX_BASIC,
      sanctuaryExtra: 0,
      sanctuaryKillsBasic: SANCTUARY_KILLS_CHAR_LIMIT,
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
    newOrder.forEach((char, index) => updates[`${char.id}/order`] = index);
    await update(ref(db, `users/${syncKey}/od_helper/members`), updates);
  };

  const updateSyncKey = (key: string | null) => {
    const newKey = key ? key.trim().toUpperCase() : generateShortKey();
    localStorage.setItem('aion_sync_key', newKey);
    setSyncKey(newKey);
  };

  return {
    accounts: processedAccounts, 
    rawAccounts: accounts,
    characters: processedCharacters, 
    rawCharacters: characters,
    loading, stats,
    executeAction, manualAdjust, toggleCheck, backupData, restoreData,
    addAccount, updateAccount, deleteAccount, addCharacter, updateCharacter, deleteCharacter, reorderCharacters,
    updateSyncKey, syncKey
  };
}
