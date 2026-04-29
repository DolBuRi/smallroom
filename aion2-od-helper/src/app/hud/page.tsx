"use client"

import { useEffect, useState, useMemo, useCallback, useRef } from "react"
import { Settings, X, Loader2, Lock, ChevronDown, ChevronUp, AlertCircle, Undo2, CloudCheck, CloudOff, RefreshCw, Eye, Circle, Key, User, ChevronRight, Trash2, Check, Plus, Globe, Camera, Scan } from "lucide-react"
import { cn } from "@/lib/utils"
import { db, ensureAuth } from "@/lib/firebase"
import { calculateCurrentState, getTimeUntilNextRecharge, getKSTNow } from "@/lib/engine"
import { ref, onValue, set, Unsubscribe } from "firebase/database"

// --- Types ---
interface Character {
  id: string;
  accountId: string;
  name: string;
  className: string;
  ode: number;
  odeExtra: number;
  lastUpdate: string;
  expeditionKillsBasic: number;
  expeditionKillsExtra: number;
  transcendenceKillsBasic: number;
  transcendenceKillsExtra: number;
  corridor?: number | boolean;
  awakening?: number | boolean;
  sanctuary?: number | boolean;
  mission?: number | boolean; // 사명
  attendance?: number | boolean; // 출석부
  dailyDungeon?: number | boolean; // 일일던전
}

interface Account {
  id: string;
  name: string;
  membership: boolean;
}

interface GameConfig {
  odeRecoveryMs: number;
  maxBaseOde: number;
  maxChargedOde: number;
  costs: { membership: number; normal: number; };
  tickets: Record<string, { max: number; label: string }>;
}

const DEFAULT_CONFIG: GameConfig = {
  odeRecoveryMs: 6 * 60 * 1000,
  maxBaseOde: 840,
  maxChargedOde: 2000,
  costs: { membership: 80, normal: 40 },
  tickets: { expedition: { max: 35, label: "원정" }, transcendence: { max: 28, label: "초월" }, sanctuary: { max: 4, label: "성역" } }
};

export default function HudPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [characters, setCharacters] = useState<Character[]>([])
  const [config, setConfig] = useState<GameConfig>(DEFAULT_CONFIG)
  
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [selectedCharId, setSelectedCharId] = useState<string | null>(null)
  
  const [loading, setLoading] = useState(true)
  const [isLocked, setIsLocked] = useState(false)
  const [opacity, setOpacity] = useState(95)
  const [view, setView] = useState<"hud" | "settings" | "vision">("hud")
  const [isExpanded, setIsExpanded] = useState(true)
  
  const [syncKey, setSyncKey] = useState<string>("")
  const [tempSyncKey, setTempSyncKey] = useState<string>("")
  const [isSyncing, setIsSyncing] = useState(false)
  const [keyError, setKeyError] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState(Date.now())

  const [isEditingOde, setIsEditingOde] = useState(false)
  const [isEditingExtraOde, setIsEditingExtraOde] = useState(false)
  const [editValue, setEditValue] = useState("")

  const [defaultBrowser, setDefaultBrowser] = useState<string | null>(null)
  const [showBrowserSelect, setShowBrowserSelect] = useState(false)

  const hudRef = useRef<HTMLDivElement>(null);
  const sideRef = useRef<HTMLDivElement>(null);

  // --- OCR State ---
  const [ocrEnabled, setOcrEnabled] = useState(false);
  const [ocrRegion, setOcrRegion] = useState<{x: number, y: number, width: number, height: number} | null>(null);
  const [ocrStatus, setOcrStatus] = useState("대기중");
  const ocrWorkerRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const isValidKey = (key: string) => {
    if (!key) return false;
    return !/[.#$[\]]/.test(key);
  };

  useEffect(() => {
    const savedKey = localStorage.getItem('aion_sync_key');
    if (savedKey) {
      if (isValidKey(savedKey)) {
        setSyncKey(savedKey);
        setTempSyncKey(savedKey);
      } else {
        localStorage.removeItem('aion_sync_key');
        setLoading(false);
      }
    } else {
      setLoading(false);
    }

    const savedBrowser = localStorage.getItem('aion_default_browser');
    if (savedBrowser) setDefaultBrowser(savedBrowser);

    const savedOcrEnabled = localStorage.getItem('aion_ocr_enabled');
    if (savedOcrEnabled === 'true') setOcrEnabled(true);

    const savedOcrRegion = localStorage.getItem('aion_ocr_region');
    if (savedOcrRegion) {
      try {
        setOcrRegion(JSON.parse(savedOcrRegion));
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !(window as any).api) return;
    
    const removeListener = (window as any).api.on('ocr-region-set', (region: any) => {
      setOcrRegion(region);
      localStorage.setItem('aion_ocr_region', JSON.stringify(region));
      setOcrEnabled(true);
      localStorage.setItem('aion_ocr_enabled', 'true');
    });

    return () => {
      if (removeListener) (window as any).api.removeListener('ocr-region-set', removeListener);
    };
  }, []);

  // 실시간 구독 (Hybrid: Electron IPC or Direct Firebase)
  useEffect(() => {
    if (!syncKey || !isValidKey(syncKey)) return;

    const accPath = `users/${syncKey}/od_helper/accounts`;
    const charPath = `users/${syncKey}/od_helper/members`;

    setLoading(true);
    setIsSyncing(true);

    let unsubAcc: Unsubscribe | null = null;
    let unsubChar: Unsubscribe | null = null;
    let unregisterIPC: (() => void) | null = null;

    if (typeof window !== "undefined" && (window as any).api) {
      // --- Electron 환경: IPC 사용 ---
      (window as any).api.subscribe(accPath);
      (window as any).api.subscribe(charPath);

      unregisterIPC = (window as any).api.onDataUpdate((payload: { path: string, data: any }) => {
        if (payload.path === accPath) {
          const accList = payload.data ? Object.entries(payload.data).map(([id, data]: [string, any]) => ({ id, ...data } as Account)) : [];
          setAccounts(accList);
          if (accList.length > 0 && !selectedAccountId) {
            setSelectedAccountId(accList[0].id);
          }
        } else if (payload.path === charPath) {
          const charList = payload.data ? Object.entries(payload.data).map(([id, data]: [string, any]) => ({ id, ...data } as Character)) : [];
          setCharacters(charList);
        }
        setIsSyncing(false);
        setLoading(false);
      });
    } else {
      // --- Web 환경: Firebase SDK 직접 사용 ---
      const initWeb = async () => {
        try {
          await ensureAuth();
          
          unsubAcc = onValue(ref(db, accPath), (snapshot) => {
            const data = snapshot.val();
            const accList = data ? Object.entries(data).map(([id, data]: [string, any]) => ({ id, ...data } as Account)) : [];
            setAccounts(accList);
            if (accList.length > 0 && !selectedAccountId) {
              setSelectedAccountId(accList[0].id);
            }
            setIsSyncing(false);
            setLoading(false);
          });

          unsubChar = onValue(ref(db, charPath), (snapshot) => {
            const data = snapshot.val();
            const charList = data ? Object.entries(data).map(([id, data]: [string, any]) => ({ id, ...data } as Character)) : [];
            setCharacters(charList);
            setIsSyncing(false);
            setLoading(false);
          });
        } catch (err) {
          console.error("Web Firebase Auth Error", err);
          setLoading(false);
        }
      };
      initWeb();
    }

    return () => {
      if (unregisterIPC) {
        (window as any).api.unsubscribe(accPath);
        (window as any).api.unsubscribe(charPath);
        unregisterIPC();
      }
      if (unsubAcc) unsubAcc();
      if (unsubChar) unsubChar();
    };
  }, [syncKey]);

  useEffect(() => {
    if (selectedAccountId && characters.length > 0) {
      const charInAcc = characters.filter(c => c.accountId === selectedAccountId);
      if (charInAcc.length > 0) {
        if (!selectedCharId || !charInAcc.find(c => c.id === selectedCharId)) {
          setSelectedCharId(charInAcc[0].id);
        }
      }
    }
  }, [selectedAccountId, characters, selectedCharId]);

  // --- OCR 엔진 초기화 ---
  useEffect(() => {
    if (!ocrEnabled) return;
    let isMounted = true;
    
    const initTesseract = async () => {
      try {
        setOcrStatus("엔진 로딩중...");
        const { createWorker } = await import('tesseract.js');
        const worker = await createWorker('eng');
        if (!isMounted) return;
        ocrWorkerRef.current = worker;
        setOcrStatus("대기중");
      } catch (e) {
        setOcrStatus("엔진 오류");
        console.error("Tesseract init failed", e);
      }
    };
    
    if (!ocrWorkerRef.current) initTesseract();

    return () => {
      isMounted = false;
    };
  }, [ocrEnabled]);

  // --- 화면 캡처 스트림 유지 ---
  useEffect(() => {
    if (!ocrEnabled || !ocrRegion) {
      if (videoRef.current && videoRef.current.srcObject) {
         const stream = videoRef.current.srcObject as MediaStream;
         stream.getTracks().forEach(t => t.stop());
         videoRef.current.srcObject = null;
      }
      return;
    }

    let isMounted = true;
    const startStream = async () => {
      try {
        const sources = await (window as any).api.invoke('get-desktop-sources');
        const primary = sources[0];
        if (!primary) return;
        
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: primary.id,
              minWidth: 1280,
              maxWidth: 4000,
              minHeight: 720,
              maxHeight: 4000
            }
          } as any
        });
        
        if (!isMounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        
        const video = document.createElement('video');
        video.srcObject = stream;
        video.play();
        videoRef.current = video;
      } catch (e) {
        console.error("Failed to start screen stream", e);
      }
    };
    
    startStream();
    
    return () => {
      isMounted = false;
      if (videoRef.current && videoRef.current.srcObject) {
         const stream = videoRef.current.srcObject as MediaStream;
         stream.getTracks().forEach(t => t.stop());
         videoRef.current.srcObject = null;
      }
    };
  }, [ocrEnabled, ocrRegion]);

  useEffect(() => {
    if ((window as any).api) {
      (window as any).api.send('view-state-change', { view, isLocked });
    }
  }, [view, isLocked]);

  useEffect(() => {
    const clock = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(clock);
  }, []);

  const handleSaveSyncKey = () => {
    const trimmedKey = tempSyncKey.trim();
    if (!isValidKey(trimmedKey)) {
      setKeyError("올바르지 않은 키 형식입니다. (특수문자 포함 불가)");
      return;
    }
    setKeyError(null);
    localStorage.setItem('aion_sync_key', trimmedKey);
    setSyncKey(trimmedKey);
    setTempSyncKey(trimmedKey);
  };

  const handleOpenWebsite = () => {
    if (!defaultBrowser) {
      setShowBrowserSelect(true);
    } else {
      (window as any).api?.openExternalUrl('https://smallroom.vercel.app', defaultBrowser);
    }
  };

  const handleSelectBrowser = (browser: string) => {
    localStorage.setItem('aion_default_browser', browser);
    setDefaultBrowser(browser);
    setShowBrowserSelect(false);
    (window as any).api?.openExternalUrl('https://smallroom.vercel.app', browser);
  };

  const handleClearKey = () => {
    localStorage.removeItem('aion_sync_key');
    setSyncKey("");
    setTempSyncKey("");
    setAccounts([]);
    setCharacters([]);
  };

  const selectedAccount = useMemo(() => {
    return accounts.find(a => a.id === selectedAccountId) || accounts[0] || null;
  }, [accounts, selectedAccountId]);

  const accountCharacters = useMemo(() => {
    return characters.filter(c => c.accountId === selectedAccountId);
  }, [characters, selectedAccountId]);

  const selectedChar = useMemo(() => {
    return accountCharacters.find(c => c.id === selectedCharId) || accountCharacters[0] || null;
  }, [accountCharacters, selectedCharId]);

  const calculatedEnergy = useMemo(() => {
    if (!selectedChar) return 0;
    return calculateCurrentState(selectedChar, new Date(currentTime), true, !!selectedAccount?.membership).ode;
  }, [selectedChar, currentTime, selectedAccount?.membership]);

  const maxBaseOde = selectedAccount?.membership ? 840 : 540;
  const energyPercent = useMemo(() => (calculatedEnergy / maxBaseOde) * 100, [calculatedEnergy, maxBaseOde]);
  const timeUntilMax = getTimeUntilNextRecharge(new Date(currentTime));

  const selectedCharRef = useRef(selectedChar);
  useEffect(() => { selectedCharRef.current = selectedChar; }, [selectedChar]);

  const calculatedEnergyRef = useRef(calculatedEnergy);
  useEffect(() => { calculatedEnergyRef.current = calculatedEnergy; }, [calculatedEnergy]);

  // --- OCR 폴링 루프 ---
  useEffect(() => {
    if (!ocrEnabled || !ocrRegion || !ocrWorkerRef.current || !videoRef.current) return;
    
    const interval = setInterval(async () => {
      try {
        const video = videoRef.current;
        if (!video || !video.videoWidth) return; // 아직 비디오 준비 안됨

        const canvas = document.createElement('canvas');
        canvas.width = ocrRegion.width;
        canvas.height = ocrRegion.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        ctx.drawImage(
          video, 
          ocrRegion.x, ocrRegion.y, ocrRegion.width, ocrRegion.height,
          0, 0, ocrRegion.width, ocrRegion.height
        );
        
        // 간단한 흑백 대비 보정 (옵션)
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
          const brightness = 0.34 * d[i] + 0.5 * d[i + 1] + 0.16 * d[i + 2];
          const val = brightness > 120 ? 255 : 0; // 이진화 (임계값 120)
          d[i] = d[i+1] = d[i+2] = val;
        }
        ctx.putImageData(imgData, 0, 0);

        const dataUrl = canvas.toDataURL('image/png');
        
        // OCR 인식
        const { data: { text } } = await ocrWorkerRef.current.recognize(dataUrl);
        const matches = text.match(/\d+/g);
        
        if (matches) {
          const foundNumber = parseInt(matches.join(''), 10);
          if (foundNumber > 0 && foundNumber <= config.maxChargedOde) {
            setOcrStatus(`마지막 인식: ${foundNumber}`);
            
            const char = selectedCharRef.current;
            const currentEnergy = calculatedEnergyRef.current;
            
            // 현재 수치와 다르고, 유효한 캐릭터면 업데이트
            if (char && syncKey && Math.abs(foundNumber - currentEnergy) > 1) {
              const updated = { ...char, ode: foundNumber, lastUpdate: new Date().toISOString() };
              setCharacters(prev => prev.map(c => c.id === updated.id ? updated : c));
              await saveToFirebase(`users/${syncKey}/od_helper/members/${updated.id}`, updated);
            }
          }
        }
      } catch (err) {
        console.error("OCR Polling Error", err);
      }
    }, 3000); // 3초마다 판독
    
    return () => clearInterval(interval);
  }, [ocrEnabled, ocrRegion, syncKey, config]);

  const saveToFirebase = async (path: string, data: any) => {
    if (typeof window !== "undefined" && (window as any).api) {
      await (window as any).api.invoke('set-firebase-data', path, data);
    } else {
      await set(ref(db, path), data);
    }
  }

  const handleAction = async (type: string) => {
    if (!selectedChar || !syncKey || !selectedAccount) return;
    const cost = selectedAccount.membership ? config.costs.membership : config.costs.normal;
    if (calculatedEnergy + (selectedChar.odeExtra || 0) < cost) return;
    
    let updated = JSON.parse(JSON.stringify(selectedChar));
    if (calculatedEnergy >= cost) updated.ode = calculatedEnergy - cost;
    else { updated.ode = 0; updated.odeExtra = (updated.odeExtra || 0) - (cost - calculatedEnergy); }
    
    updated.lastUpdate = new Date().toISOString();
    
    if (type === 'expedition') {
       if (updated.expeditionKillsBasic > 0) updated.expeditionKillsBasic -= 1;
       else if (updated.expeditionKillsExtra > 0) updated.expeditionKillsExtra -= 1;
    } else if (type === 'transcendence') {
       if (updated.transcendenceKillsBasic > 0) updated.transcendenceKillsBasic -= 1;
       else if (updated.transcendenceKillsExtra > 0) updated.transcendenceKillsExtra -= 1;
    }
    
    setCharacters(prev => prev.map(c => c.id === updated.id ? updated : c));
    await saveToFirebase(`users/${syncKey}/od_helper/members/${updated.id}`, updated);
  }

  // [NEW] 범용 데이터 업데이트 함수 (상태 토글 및 수량 조절용)
  const updateCharacterData = async (fields: Partial<Character>) => {
    if (!selectedChar || !syncKey) return;
    const updated = { ...selectedChar, ...fields };
    setCharacters(prev => prev.map(c => c.id === updated.id ? updated : c));
    await saveToFirebase(`users/${syncKey}/od_helper/members/${updated.id}`, updated);
  }

  const handleUpdateOdeValue = async () => {
    if (!selectedChar || !syncKey) return;
    const numValue = parseInt(editValue) || 0;
    
    let updatedFields: Partial<Character> = {};
    if (isEditingOde) {
      updatedFields.ode = Math.min(config.maxBaseOde, numValue);
      updatedFields.lastUpdate = new Date().toISOString();
    } else if (isEditingExtraOde) {
      updatedFields.odeExtra = Math.min(config.maxChargedOde, numValue);
    }

    await updateCharacterData(updatedFields);
    
    setIsEditingOde(false);
    setIsEditingExtraOde(false);
    setEditValue("");
  };

  if (loading && syncKey) return <div className="w-[312px] h-[200px] flex items-center justify-center bg-[#0b0f1a] text-indigo-400 rounded-2xl border border-white/10"><Loader2 className="animate-spin" /></div>;

  return (
    <main className="relative flex flex-col items-start p-4 w-[640px] h-[950px] bg-transparent text-white font-sans overflow-visible">
      {/* --- HUD MAIN --- */}
      <div ref={hudRef} className={cn("absolute top-0 left-0 w-[312px] flex flex-col z-20 bg-[#121826] border border-white/10 rounded-2xl shadow-2xl transition-all duration-500 ease-in-out overflow-hidden", isExpanded ? "h-fit max-h-[850px]" : "h-[250px]")}>
        <div className="drag-region flex items-center justify-between px-4 h-[42px] bg-[#0b0f1a] border-b border-white/5">
          {/* 헤더는 항상 100% 투명도 */}
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded tracking-tighter">AION2</span>
            {syncKey && accounts.length > 0 ? (
              <div className="flex items-center gap-1 group relative">
                <User className="w-3 h-3 text-slate-500" />
                <select 
                    className="no-drag appearance-none bg-transparent text-[11px] font-black text-slate-100 border-none outline-none cursor-pointer hover:text-indigo-400 transition-colors pr-4" 
                    value={selectedAccountId || ""} 
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                >
                  {accounts.map(acc => <option key={acc.id} value={acc.id} className="bg-[#121826]">{acc.name}</option>)}
                </select>
                <ChevronDown className="w-3 h-3 text-slate-600 group-hover:text-white pointer-events-none absolute right-0" />
              </div>
            ) : (
              <span className="text-[10px] font-bold text-slate-500">{syncKey ? "데이터 없음" : "연동 필요"}</span>
            )}
          </div>
          <div className="no-drag flex items-center gap-0.5">
            <button className={cn("p-1.5 rounded text-slate-500 hover:text-white", isSyncing && "text-indigo-400")}><RefreshCw className={cn("w-3.5 h-3.5", isSyncing && "animate-spin")} /></button>
            <button onClick={() => setIsLocked(!isLocked)} className={cn("p-1.5 rounded text-slate-500 hover:text-white", isLocked && "text-indigo-400")}><Lock className="w-3.5 h-3.5" fill={isLocked ? "currentColor" : "none"} /></button>
            <button onClick={() => setView(view === "hud" ? "settings" : "hud")} className="p-1.5 rounded text-slate-500 hover:text-white"><Settings className="w-3.5 h-3.5" /></button>
            <button onClick={() => (window as any).api?.invoke('close-window')} className="p-1.5 rounded text-slate-500 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
          </div>
        </div>

        {/* 본문에만 투명도 적용 */}
        <div className="p-4 flex flex-col gap-4" style={{ opacity: opacity / 100 }}>
          {!syncKey ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
              <Key className="w-8 h-8 text-slate-700" />
              <div className="text-xs font-bold text-slate-400">웹사이트에서 동기화 키를 복사하여<br/>설정창에 입력해 주세요.</div>
              {syncKey && <div className="text-[9px] text-slate-600 font-bold bg-white/5 px-2 py-1 rounded">현재 시도 중인 키: {syncKey}</div>}
              <button onClick={() => setView("settings")} className="mt-2 px-4 py-2 bg-indigo-500/10 text-indigo-400 text-[10px] font-black rounded-lg hover:bg-indigo-500/20">설정 열기</button>
            </div>
          ) : characters.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
              <CloudOff className="w-8 h-8 text-slate-700" />
              <div className="text-xs font-bold text-slate-400">연동된 캐릭터가 없습니다.<br/>웹사이트에서 먼저 캐릭터를 등록하세요.</div>
              <div className="text-[9px] text-slate-600 font-bold bg-white/5 px-2 py-1 rounded">현재 연동 키: {syncKey}</div>
              <button onClick={() => setView("settings")} className="mt-2 px-4 py-2 bg-slate-800 text-slate-400 text-[9px] font-bold rounded-lg hover:text-white transition-colors">키 다시 입력하기</button>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-start h-14">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <div className="group relative flex items-center">
                        <select 
                            className="no-drag appearance-none bg-transparent text-2xl font-black text-white tracking-tighter outline-none cursor-pointer hover:text-indigo-400 transition-colors pr-6 max-w-[140px] truncate" 
                            value={selectedCharId || ""} 
                            onChange={(e) => setSelectedCharId(e.target.value)}
                        >
                            {accountCharacters.map(char => (
                                <option key={char.id} value={char.id} className="bg-[#121826] text-base">
                                    {char.name}
                                </option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-0 w-5 h-5 text-slate-600 group-hover:text-indigo-400 pointer-events-none" />
                    </div>
                    <span className="text-[10px] font-black text-slate-500 bg-slate-500/10 px-1.5 py-0.5 rounded uppercase">{selectedChar?.className}</span>
                  </div>
                  
                  <div className="flex items-center gap-1.5">
                    <div className={cn("w-1.5 h-1.5 rounded-full", selectedAccount?.membership ? "bg-amber-400 shadow-[0_0_5px_#fbbf24]" : "bg-slate-500")} />
                    <span className={cn("text-[9px] font-bold uppercase tracking-widest", selectedAccount?.membership ? "text-amber-400" : "text-slate-400")}>
                      {selectedAccount?.membership ? "프리미엄 멤버십" : "일반 계정"}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <div className="text-[9px] font-black text-slate-600 uppercase tracking-tighter mb-1">다음 충전 {timeUntilMax}</div>
                  <div className="flex items-baseline gap-1 group no-drag">
                    {isEditingOde ? (
                        <input 
                            autoFocus
                            type="number"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={handleUpdateOdeValue}
                            onKeyDown={(e) => e.key === 'Enter' && handleUpdateOdeValue()}
                            className="w-16 bg-indigo-500/20 border-b-2 border-indigo-500 text-right text-xl font-black text-indigo-400 outline-none appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                    ) : (
                        <span 
                            onClick={() => { setIsEditingOde(true); setEditValue(calculatedEnergy.toString()); }}
                            className="text-2xl font-black italic text-indigo-400 leading-none cursor-pointer hover:text-white transition-colors"
                        >
                            {calculatedEnergy}
                        </span>
                    )}
                    <span className="text-[10px] font-bold text-slate-600">/ {selectedAccount?.membership ? 840 : 540}</span>
                  </div>

                  <div className="flex items-center gap-1 mt-1 group no-drag">
                    <Plus className="w-2.5 h-2.5 text-slate-500 font-black" />
                    {isEditingExtraOde ? (
                        <input 
                            autoFocus
                            type="number"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={handleUpdateOdeValue}
                            onKeyDown={(e) => e.key === 'Enter' && handleUpdateOdeValue()}
                            className="w-12 bg-indigo-500/10 border-b border-indigo-400 text-right text-[10px] font-black text-indigo-400 outline-none appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                    ) : (
                        <span 
                            onClick={() => { setIsEditingExtraOde(true); setEditValue((selectedChar?.odeExtra || 0).toString()); }}
                            className="text-[10px] font-black text-indigo-400 cursor-pointer hover:text-white"
                        >
                            {selectedChar?.odeExtra || 0}
                        </span>
                    )}
                    <span className="text-slate-700 font-bold text-[10px] ml-0.5">/ {config.maxChargedOde}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-1 px-0.5">
                {Array.from({ length: 14 }).map((_, i) => (
                  <div key={i} className={cn("flex-1 h-2 rounded-sm transition-all duration-500", i < Math.round((energyPercent / 100) * 14) ? "bg-indigo-500 shadow-[0_0_6px_rgba(99,102,241,0.5)]" : "bg-slate-800/80")} />
                ))}
              </div>

              <div className="grid grid-cols-3 gap-2">
                {Object.entries(config.tickets).map(([key, rule]) => (
                  <button key={key} onClick={() => handleAction(key)} className="flex flex-col items-center justify-center py-2 bg-[#1a2133] border border-indigo-500/10 rounded-xl hover:bg-[#232d45] transition-all group">
                    <span className="text-[10px] font-black text-slate-200 group-hover:text-white">{rule.label}</span>
                    <span className="text-[9px] font-black text-red-400 mt-0.5">-{selectedAccount?.membership ? config.costs.membership : config.costs.normal}</span>
                  </button>
                ))}
              </div>

              <button onClick={() => setIsExpanded(!isExpanded)} className="flex items-center justify-center gap-2 py-1.5 text-[9px] font-black text-slate-600 hover:text-indigo-400 uppercase tracking-widest border-t border-white/5">
                {isExpanded ? <><ChevronUp className="w-3.5 h-3.5" /> 접기</> : <><ChevronDown className="w-3.5 h-3.5" /> 상세 정보</>}
              </button>

              {isExpanded && selectedChar && (
                <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="flex flex-col gap-2">
                    <div className="text-[9px] font-black text-indigo-300 uppercase tracking-widest px-1 text-left w-full">상세 티켓 현황</div>
                    <div className="space-y-1.5">
                      <TicketRow 
                        label="원정" 
                        base={selectedChar.expeditionKillsBasic} 
                        extra={selectedChar.expeditionKillsExtra} 
                        max={35} 
                        hasExtra={true}
                      />
                      <TicketRow 
                        label="초월" 
                        base={selectedChar.transcendenceKillsBasic} 
                        extra={selectedChar.transcendenceKillsExtra} 
                        max={28} 
                        hasExtra={true}
                      />
                      <TicketRow 
                        label="성역" 
                        base={selectedChar.sanctuary ? 1 : 0} 
                        extra={0} 
                        max={4} 
                        hasExtra={false}
                        onClick={() => updateCharacterData({ sanctuary: !selectedChar.sanctuary })}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 mb-2">
                    <div className="text-[9px] font-black text-indigo-300 uppercase tracking-widest px-1 text-left w-full">체크리스트 (클릭시 토글)</div>
                    <div className="grid grid-cols-1 gap-1">
                      <CheckRow 
                        name="사명" 
                        done={(Number(selectedChar.mission) || 0) >= 5} 
                        current={Number(selectedChar.mission) || 0} 
                        max={5} 
                        onClick={() => {
                          const curr = Number(selectedChar.mission) || 0;
                          updateCharacterData({ mission: curr >= 5 ? 0 : curr + 1 });
                        }} 
                      />
                      <CheckRow 
                        name="어비스 회랑" 
                        done={(Number(selectedChar.corridor) || 0) >= 6} 
                        current={Number(selectedChar.corridor) || 0} 
                        max={6} 
                        onClick={() => {
                          const curr = Number(selectedChar.corridor) || 0;
                          updateCharacterData({ corridor: curr >= 6 ? 0 : curr + 1 });
                        }} 
                      />
                      <CheckRow 
                        name="일일던전" 
                        done={(Number(selectedChar.dailyDungeon) || 0) >= 1} 
                        current={Number(selectedChar.dailyDungeon) || 0} 
                        max={1} 
                        onClick={() => {
                          const curr = Number(selectedChar.dailyDungeon) || 0;
                          updateCharacterData({ dailyDungeon: curr >= 1 ? 0 : curr + 1 });
                        }} 
                      />
                      <CheckRow 
                        name="각성" 
                        done={(Number(selectedChar.awakening) || 0) >= 3} 
                        current={Number(selectedChar.awakening) || 0} 
                        max={3} 
                        onClick={() => {
                          const curr = Number(selectedChar.awakening) || 0;
                          updateCharacterData({ awakening: curr >= 3 ? 0 : curr + 1 });
                        }} 
                      />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* --- SETTINGS --- */}
      {view === "settings" && (
        <div ref={sideRef} className="absolute top-0 left-[316px] w-[280px] bg-[#121826] border border-white/10 rounded-2xl shadow-2xl animate-in slide-in-from-left-4 duration-300 overflow-hidden">
          <div className="drag-region flex items-center justify-between px-4 h-[42px] bg-[#0b0f1a] border-b border-white/5">
            <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">설정</span>
            <button onClick={() => setView("hud")} className="no-drag p-2 text-slate-500 hover:text-white"><X className="w-3.5 h-3.5" /></button>
          </div>
          <div className="p-5 flex flex-col gap-5">
            <div className="flex flex-col gap-2.5">
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                <Key className="w-3 h-3" /> 동기화 키 (Sync Key)
              </span>
              <div className="flex flex-col gap-2">
                <input 
                  type="text" 
                  placeholder="웹사이트에서 키를 복사해 넣으세요" 
                  value={tempSyncKey}
                  onChange={(e) => {
                    setTempSyncKey(e.target.value);
                    setKeyError(null);
                  }}
                  className={cn("no-drag w-full bg-black/40 border rounded-lg px-3 py-2 text-[10px] text-slate-300 outline-none transition-colors", keyError ? "border-red-500" : "border-white/5 focus:border-indigo-500/50")}
                />
                {keyError && <span className="text-[9px] text-red-500 font-bold">{keyError}</span>}
                <div className="flex flex-col gap-2">
                  <button 
                    onClick={handleSaveSyncKey}
                    className="no-drag w-full py-2 bg-indigo-500 text-white text-[10px] font-black rounded-lg hover:bg-indigo-600 transition-colors"
                  >
                    키 저장 및 연동
                  </button>
                  <div className="relative group w-full">
                    <button 
                      onClick={handleOpenWebsite}
                      className="no-drag w-full flex items-center justify-center gap-1.5 py-2 bg-slate-800 text-slate-300 text-[10px] font-black rounded-lg hover:bg-slate-700 hover:text-white transition-colors"
                    >
                      <Globe className="w-3.5 h-3.5" /> 숙제 관리 사이트
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setShowBrowserSelect(true); }}
                      className="no-drag absolute top-1/2 right-1.5 -translate-y-1/2 p-1.5 text-slate-500 hover:text-white bg-transparent rounded hover:bg-white/10"
                      title="기본 브라우저 변경"
                    >
                      <Settings className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="h-[1px] bg-white/5" />

            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                  <Camera className="w-3 h-3" /> 자동 OCR 인식
                </span>
                <button 
                  onClick={() => {
                    const next = !ocrEnabled;
                    setOcrEnabled(next);
                    localStorage.setItem('aion_ocr_enabled', next.toString());
                  }}
                  className={cn("no-drag w-8 h-4 rounded-full transition-colors relative", ocrEnabled ? "bg-indigo-500" : "bg-slate-700")}
                >
                  <div className={cn("absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all", ocrEnabled ? "left-[18px]" : "left-0.5")} />
                </button>
              </div>
              
              {ocrEnabled && (
                <div className="flex flex-col gap-2 bg-black/20 p-2.5 rounded-lg border border-white/5">
                  <button 
                    onClick={() => (window as any).api.invoke('start-ocr-selection')}
                    className="no-drag w-full flex items-center justify-center gap-1.5 py-1.5 bg-slate-800 text-slate-300 text-[9px] font-black rounded hover:bg-slate-700 transition-colors"
                  >
                    <Scan className="w-3 h-3" /> 영역 직접 지정 (오버레이)
                  </button>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[9px] text-slate-500">엔진 상태</span>
                    <span className={cn("text-[9px] font-bold", ocrStatus.includes("오류") ? "text-red-400" : "text-indigo-400")}>{ocrStatus}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="h-[1px] bg-white/5" />

            <div className="flex flex-col gap-3">
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">불투명도</span>
              <div className="flex items-center gap-3">
                <input type="range" min="30" max="100" value={opacity} onChange={(e) => setOpacity(parseInt(e.target.value))} className="no-drag flex-1 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500" />
                <span className="text-[10px] font-black text-slate-400 w-8 text-right">{opacity}%</span>
              </div>
            </div>
            
            <button onClick={() => setView("hud")} className="py-2.5 text-[10px] font-black text-slate-500 hover:text-indigo-400 uppercase tracking-widest border-t border-white/5 mt-2">닫기</button>
          </div>

          {/* 브라우저 선택 오버레이 */}
          {showBrowserSelect && (
            <div className="absolute inset-0 z-50 bg-[#121826]/95 backdrop-blur-sm flex flex-col p-5 animate-in fade-in">
              <div className="flex items-center justify-between mb-6">
                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">실행할 브라우저 선택</span>
                <button onClick={() => setShowBrowserSelect(false)} className="no-drag p-1 text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
              </div>
              <div className="flex flex-col gap-2.5">
                <button onClick={() => handleSelectBrowser('chrome')} className="no-drag flex items-center justify-between p-3.5 bg-slate-800/50 rounded-xl hover:bg-indigo-500/20 border border-white/5 hover:border-indigo-500/50 transition-all group">
                  <span className="text-[11px] font-bold text-white group-hover:text-indigo-400 transition-colors">Google Chrome</span>
                  {defaultBrowser === 'chrome' && <Check className="w-4 h-4 text-indigo-400" />}
                </button>
                <button onClick={() => handleSelectBrowser('edge')} className="no-drag flex items-center justify-between p-3.5 bg-slate-800/50 rounded-xl hover:bg-indigo-500/20 border border-white/5 hover:border-indigo-500/50 transition-all group">
                  <span className="text-[11px] font-bold text-white group-hover:text-indigo-400 transition-colors">Microsoft Edge</span>
                  {defaultBrowser === 'edge' && <Check className="w-4 h-4 text-indigo-400" />}
                </button>
                <button onClick={() => handleSelectBrowser('whale')} className="no-drag flex items-center justify-between p-3.5 bg-slate-800/50 rounded-xl hover:bg-indigo-500/20 border border-white/5 hover:border-indigo-500/50 transition-all group">
                  <span className="text-[11px] font-bold text-white group-hover:text-indigo-400 transition-colors">Naver Whale</span>
                  {defaultBrowser === 'whale' && <Check className="w-4 h-4 text-indigo-400" />}
                </button>
                
                <div className="h-[1px] bg-white/5 my-2" />
                
                <button onClick={() => handleSelectBrowser('default')} className="no-drag flex items-center justify-between p-3.5 bg-slate-800/50 rounded-xl hover:bg-slate-700/50 border border-white/5 transition-all group">
                  <span className="text-[11px] font-bold text-slate-400 group-hover:text-white transition-colors">시스템 기본 브라우저</span>
                  {defaultBrowser === 'default' && <Check className="w-4 h-4 text-slate-300" />}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

function TicketRow({ label, base, extra, max, hasExtra }: any) {
  const total = (base || 0) + (extra || 0);
  const isEmpty = total === 0;

  return (
    <div className={cn(
      "no-drag relative flex flex-col p-3 rounded-xl border transition-all overflow-hidden group",
      isEmpty ? "bg-[#121826]/50 border-white/5" : "bg-[#1a2133] border-white/5"
    )}>
      <div className="flex justify-between items-center z-10">
        <span className={cn("text-[12px] font-black", isEmpty ? "text-slate-400" : "text-white")}>{label}</span>
        <div className="flex items-baseline gap-1">
          <span className={cn("text-lg font-black tracking-tighter leading-none", isEmpty ? "text-slate-500" : "text-white")}>{total}</span>
          <span className={cn("text-[10px] font-bold", isEmpty ? "text-slate-600" : "text-slate-400")}>장 남음</span>
        </div>
      </div>
      
      <div className="flex items-center gap-3 mt-2 z-10">
        <div className="flex items-center gap-1.5 bg-black/30 px-2 py-0.5 rounded">
          <div className={cn("w-1.5 h-1.5 rounded-full", base > 0 ? "bg-indigo-400 shadow-[0_0_4px_#818cf8]" : "bg-slate-700")} />
          <span className="text-[9px] font-bold text-slate-300">기본</span>
          <span className={cn("text-[10px] font-black", base > 0 ? "text-indigo-300" : "text-slate-500")}>{base || 0}</span>
          <span className="text-[8px] text-slate-500 font-bold ml-0.5">/ {max}</span>
        </div>
        
        {hasExtra && (
          <div className="flex items-center gap-1.5 bg-black/30 px-2 py-0.5 rounded">
            <div className={cn("w-1.5 h-1.5 rounded-full", extra > 0 ? "bg-amber-400 shadow-[0_0_4px_#fbbf24]" : "bg-slate-700")} />
            <span className="text-[9px] font-bold text-slate-300">충전</span>
            <span className={cn("text-[10px] font-black", extra > 0 ? "text-amber-300" : "text-slate-500")}>{extra || 0}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function CheckRow({ name, done, current, max, onClick }: any) {
  return (
    <div onClick={onClick} className={cn(
      "no-drag flex items-center justify-between p-2.5 rounded-lg border h-10 cursor-pointer transition-all active:scale-[0.98]",
      done ? "bg-transparent border-transparent opacity-40 hover:opacity-60" : "bg-[#1a2133] border-white/5 hover:bg-[#232d45]"
    )}>
      <div className="flex items-center gap-2.5">
        {done ? (
          <div className="w-3.5 h-3.5 flex items-center justify-center rounded-full bg-slate-600">
            <Check className="w-2.5 h-2.5 text-[#121826] stroke-[3]" />
          </div>
        ) : (
          <Circle className="w-3.5 h-3.5 text-slate-600" fill="none" />
        )}
        <span className={cn("text-[11px] font-black transition-all", done ? "text-slate-500 line-through" : "text-slate-100")}>{name}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={cn("text-[11px] font-black italic transition-colors", done ? "text-slate-500" : "text-indigo-300")}>{current}</span>
        <span className="text-[9px] font-black text-slate-500">/ {max}</span>
      </div>
    </div>
  );
}
