"use client"



import { useEffect, useState, useMemo, useCallback, useRef } from "react"

import { Settings, X, Loader2, Lock, ChevronDown, ChevronUp, AlertCircle, Info, Ticket, Undo2, CloudCheck, CloudOff, RefreshCw, Circle, Key, User, ChevronRight, ChevronLeft, Trash2, Check, Plus, Globe, Camera, Scan, Clock, Layers, Zap } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"

import { db, ensureAuth } from "@/lib/firebase"

import { calculateCurrentState, getTimeUntilNextRecharge } from "@/lib/engine"

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
  expeditionBasic?: number;
  expeditionExtra?: number;
  transcendenceBasic?: number;
  transcendenceExtra?: number;
  sanctuaryBasic?: number;
  sanctuaryExtra?: number;
  expeditionKillsBasic: number;
  expeditionKillsExtra: number;
  transcendenceKillsBasic: number;
  transcendenceKillsExtra: number;
  sanctuaryKillsBasic?: number;
  sanctuaryKillsExtra?: number;
  corridor?: number | boolean;
  awakening?: number | boolean;
  sanctuary?: number | boolean;
  mission?: number | boolean;
  attendance?: number | boolean;
  dailyDungeon?: number | boolean;
  nightmare?: number | boolean;
  [key: string]: any;
}

interface Account {
  id: string;
  name: string;
  membership: boolean;
  shugoBasic?: number;
  shugoExtra?: number;
  invasionBasic?: number;
  invasionExtra?: number;
  mission?: number | boolean;
  dailyDungeon?: number | boolean;
  [key: string]: any;
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

  const [view, setView] = useState<"hud" | "settings">("hud")

  const [isExpanded, setIsExpanded] = useState<boolean>(() => (typeof window !== "undefined" ? localStorage.getItem('aion_is_expanded') === 'true' : false)); // 기본값 false(접힘)

  

  const [syncKey, setSyncKey] = useState<string>(() => (typeof window !== "undefined" ? localStorage.getItem('aion_sync_key') || "" : ""));

  const [tempSyncKey, setTempSyncKey] = useState<string>(() => (typeof window !== "undefined" ? localStorage.getItem('aion_sync_key') || "" : ""));

  const [isSyncing, setIsSyncing] = useState(false)

  const [configStatus, setConfigStatus] = useState<string>("init")

  const [keyError, setKeyError] = useState<string | null>(null)

  const [currentTime, setCurrentTime] = useState(Date.now())
  const [serverTimeOffset, setServerTimeOffset] = useState(0);



  const [isEditingOde, setIsEditingOde] = useState(false)
  const [isEditingExtraOde, setIsEditingExtraOde] = useState(false)
  const [editingTicketField, setEditingTicketField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("")



  const [defaultBrowser, setDefaultBrowser] = useState<string | null>(null)

  const [showBrowserSelect, setShowBrowserSelect] = useState(false)



  const hudRef = useRef<HTMLDivElement>(null);

  const sideRef = useRef<HTMLDivElement>(null);



  // --- [NEW] Focus & View States ---

  const [isAionFocused, setIsAionFocused] = useState(true)

  const [intelligentHide, setIntelligentHide] = useState(true)

  const [isMinimal, setIsMinimal] = useState<boolean>(() => (typeof window !== "undefined" ? localStorage.getItem('aion_is_minimal') !== 'false' : true)); // 기본값 true(접힘/최소화)
  const [isCompact, setIsCompact] = useState<boolean>(() => (typeof window !== "undefined" ? localStorage.getItem('aion_is_compact') === 'true' : false)); // [NEW] 압축 모드
  const [simpleOdeCharge, setSimpleOdeCharge] = useState<boolean>(() => (typeof window !== "undefined" ? localStorage.getItem('aion_simple_ode_charge') === 'true' : false)); // [NEW] 간편 오드 충전
  const [ticketValidation, setTicketValidation] = useState<boolean>(() => (typeof window !== "undefined" ? localStorage.getItem('aion_ticket_validation') !== 'false' : true)); // [NEW] 티켓 유효성 체크 (기본값 true)

  // --- Hotkey State ---
  const [hotkeys, setHotkeys] = useState<{ toggleHud: string, toggleCompact: string, toggleDetails: string }>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem('aion_hotkeys');
      if (saved) {
        try { return JSON.parse(saved); } catch(e) {}
      }
    }
    return {
      toggleHud: 'Control+Alt+H',
      toggleCompact: 'Control+Alt+C',
      toggleDetails: 'Control+Alt+D'
    };
  });

  const [activeContentIdx, setActiveContentIdx] = useState(0);
  const contentTypes = ['expedition', 'transcendence', 'sanctuary'] as const;
  const activeContentType = contentTypes[activeContentIdx];

  const contentInfoMap = useMemo(() => {
    const rawSelectedChar = characters.find(c => c.id === selectedCharId);
    const account = accounts.find(a => a.id === rawSelectedChar?.accountId);
    const selectedChar = rawSelectedChar
      ? calculateCurrentState(rawSelectedChar, new Date(currentTime), true, !!account?.membership) as Character
      : null;
    if (!selectedChar) return null;
    return {
      expedition: {
        label: "원정",
        rewards: { basic: selectedChar.expeditionBasic || 0, extra: selectedChar.expeditionExtra || 0 },
        kills: { basic: selectedChar.expeditionKillsBasic || 0, extra: selectedChar.expeditionKillsExtra || 0 }
      },
      transcendence: {
        label: "초월",
        rewards: { basic: selectedChar.transcendenceBasic || 0, extra: selectedChar.transcendenceExtra || 0 },
        kills: { basic: selectedChar.transcendenceKillsBasic || 0, extra: selectedChar.transcendenceKillsExtra || 0 }
      },
      sanctuary: {
        label: "성역",
        rewards: { basic: selectedChar.sanctuaryBasic || 0, extra: selectedChar.sanctuaryExtra || 0 },
        kills: { basic: selectedChar.sanctuaryKillsBasic || 0, extra: selectedChar.sanctuaryKillsExtra || 0 }
      }
    };
  }, [characters, accounts, selectedCharId, currentTime]);

  const [recordingKey, setRecordingKey] = useState<string | null>(null);
  const [hotkeyWarning, setHotkeyWarning] = useState<string | null>(null);



  // --- OCR State ---

  const [ocrEnabled, setOcrEnabled] = useState(false);

  const [ocrRegions, setOcrRegions] = useState<{

    ode: {x: number, y: number, width: number, height: number} | null;

    map: {x: number, y: number, width: number, height: number} | null;

    loading: {x: number, y: number, width: number, height: number} | null;

  }>({ ode: null, map: null, loading: null });

  const [currentSelectionTarget, setCurrentSelectionTarget] = useState<"ode" | "map" | "loading">("ode");

  const [detectedContent, setDetectedContent] = useState<string | null>(null);

  const [lastRewardTime, setLastRewardTime] = useState<number | null>(null);

  const [ocrStatus, setOcrStatus] = useState("대기중");
  // --- [NEW] OCR Debug States ---

  const [debugTextOde, setDebugTextOde] = useState<string>("");

  const [debugTextMap, setDebugTextMap] = useState<string>("");

  const [debugImgOde, setDebugImgOde] = useState<string | null>(null);

  const [debugImgMap, setDebugImgMap] = useState<string | null>(null);

  const [isTransitioning, setIsTransitioning] = useState(false);
  const [compactToast, setCompactToast] = useState<{show: boolean, value: boolean}>({ show: false, value: false });
  const [toast, setToast] = useState<{show: boolean, message: string, type: 'info' | 'error'}>({ show: false, message: "", type: 'info' });

  const showToast = (message: string, type: 'info' | 'error' = 'info') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast(p => ({ ...p, show: false })), 2500);
  };

  const [mapTemplates, setMapTemplates] = useState<Record<string, string>>({}); // name -> dataUrl

  const [loadingTemplate, setLoadingTemplate] = useState<string | null>(null);

  const ocrWorkerRef = useRef<any>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const loadingTemplatePixelsRef = useRef<Uint8ClampedArray | null>(null);



  // 메인 프로세스로 로그 전달하는 헬퍼
  const remoteLog = (level: string, ...args: any[]) => {
    console.log(`[Remote-${level}]`, ...args);
    if ((window as any).api) {
      (window as any).api.send('log-from-renderer', level, ...args);
    }
  };

  const isValidKey = (key: string) => {
    if (!key) {
      remoteLog('warn', 'isValidKey: Key is empty');
      return false;
    }
    const cleanKey = key.trim().toUpperCase();
    if (!/^[A-Z0-9]{8}$/.test(cleanKey)) {
      remoteLog('warn', 'isValidKey: Key must be 8 alphanumeric characters', cleanKey);
      return false;
    }
    return true;
  };



  useEffect(() => {

    const savedBrowser = localStorage.getItem('aion_default_browser');

    if (savedBrowser) setDefaultBrowser(savedBrowser);



    const savedOcrEnabled = localStorage.getItem('aion_ocr_enabled');
    if (savedOcrEnabled === 'true') setOcrEnabled(true);

    const removeListener = (window as any).api.on('ocr-region-set', (region: any) => {
      setOcrRegions(prev => {
        const next = { ...prev, [currentSelectionTarget]: region };
        localStorage.setItem('aion_ocr_regions', JSON.stringify(next));
        
        // saveAllConfigs가 1초 뒤 자동으로 저장하므로 여기서는 상태만 업데이트
        return next;
      });
      setOcrEnabled(true);
      localStorage.setItem('aion_ocr_enabled', 'true');
    });



    const removeFocusListener = (window as any).api.on('aion2-focus-change', (isFocused: boolean) => {
      setIsAionFocused(isFocused);
    });

    return () => {
      if (removeListener) (window as any).api.removeListener('ocr-region-set', removeListener);
      if (removeFocusListener) (window as any).api.removeListener('aion2-focus-change', removeFocusListener);
    };

  }, [currentSelectionTarget]);



  // --- [NEW] View 상태 및 압축 모드에 따른 윈도우 크기 조절 ---
  useEffect(() => {
    if ((window as any).api) {
      const api = (window as any).api;
      if (view === "settings") {
        api.send('resize-window', 600, 450); // 설정창
      } else if (isCompact) {
        if (isExpanded) {
          remoteLog('info', 'Resizing window: Compact + Expanded (420)');
          api.send('resize-window', 312, 420); 
        } else {
          api.send('resize-window', 312, 120); 
        }
      } else {
        if (isExpanded) {
          remoteLog('info', 'Resizing window: Normal + Expanded (550)');
          api.send('resize-window', 312, 550); 
        } else {
          api.send('resize-window', 312, 210); 
        }
      }
    }
  }, [view, isCompact, isExpanded]);

  useEffect(() => {
    let retryCount = 0;
    const maxRetries = 10;

    const loadAllSettings = async () => {
      remoteLog('info', 'Starting loadAllSettings...');
      setLoading(true);

      // API가 아직 로드 안되었을 수 있음 (Electron 환경 체크)
      if (!(window as any).api && retryCount < maxRetries) {
        retryCount++;
        remoteLog('info', `Waiting for Electron API... (retry ${retryCount})`);
        setTimeout(loadAllSettings, 300);
        return;
      }

      // 1. Electron File Config (최우선)
      if ((window as any).api) {
        try {
          const res = await (window as any).api.invoke('load-config');
          remoteLog('info', 'Config load response:', res);
          if (res && res.ok && res.data) {
            const d = res.data;
            if (d.syncKey) {
              const cleanKey = d.syncKey.trim();
              remoteLog('info', 'Found syncKey in config file:', cleanKey);
              setSyncKey(cleanKey);
              setTempSyncKey(d.syncKey); 
              localStorage.setItem('aion_sync_key', cleanKey);
              
              if (d.intelligentHide !== undefined) setIntelligentHide(d.intelligentHide);
              if (d.isMinimal !== undefined) setIsMinimal(d.isMinimal);
              if (d.isExpanded !== undefined) setIsExpanded(d.isExpanded);
              if (d.isCompact !== undefined) setIsCompact(d.isCompact);
              if (d.simpleOdeCharge !== undefined) setSimpleOdeCharge(d.simpleOdeCharge);
              if (d.opacity !== undefined) setOpacity(d.opacity);
              if (d.defaultBrowser) setDefaultBrowser(d.defaultBrowser);
              if (d.mapTemplates) setMapTemplates(d.mapTemplates);
              if (d.loadingTemplate) {
                setLoadingTemplate(d.loadingTemplate);
                const img = new Image();
                img.onload = () => {
                  const cvs = document.createElement('canvas');
                  cvs.width = 40; cvs.height = 40;
                  const ctx = cvs.getContext('2d');
                  if (ctx) {
                    ctx.drawImage(img, 0, 0, 40, 40);
                    loadingTemplatePixelsRef.current = ctx.getImageData(0, 0, 40, 40).data;
                  }
                };
                img.src = d.loadingTemplate;
              }
              if (d.ocrRegions) setOcrRegions(d.ocrRegions);
              if (d.hotkeys) {
                setHotkeys(d.hotkeys);
                localStorage.setItem('aion_hotkeys', JSON.stringify(d.hotkeys));
              }
              
              setConfigStatus("LOADED_FILE");
              setLoading(false);
              return;
            }
          }
        } catch (e: any) {
          remoteLog('error', 'Config file load error', e.message);
        }
      } 
      
      // 2. Fallback: LocalStorage (New Name)
      const savedSyncKey = localStorage.getItem('aion_sync_key');
      if (savedSyncKey && isValidKey(savedSyncKey)) {
        remoteLog('info', 'Found syncKey in localStorage:', savedSyncKey);
        const cleanKey = savedSyncKey.trim();
        setSyncKey(cleanKey);
        setTempSyncKey(savedSyncKey);
        
        const savedRegions = localStorage.getItem('aion_ocr_regions');
        if (savedRegions) {
          try { setOcrRegions(JSON.parse(savedRegions)); } catch(e) {}
        }
        
        const savedHotkeys = localStorage.getItem('aion_hotkeys');
        if (savedHotkeys) {
          try { setHotkeys(JSON.parse(savedHotkeys)); } catch(e) {}
        }

        setConfigStatus("LOADED_LOCAL");
        setLoading(false);
        return;
      }

      // 3. Fallback: LocalStorage (Legacy Name)
      const legacySyncKey = localStorage.getItem('savedSyncKey');
      if (legacySyncKey && isValidKey(legacySyncKey)) {
        remoteLog('info', 'Found syncKey in legacy localStorage:', legacySyncKey);
        const cleanKey = legacySyncKey.trim();
        setSyncKey(cleanKey);
        setTempSyncKey(legacySyncKey);
        localStorage.setItem('aion_sync_key', cleanKey); 
        setConfigStatus("LOADED_LEGACY");
        setLoading(false);
        return;
      }

      remoteLog('warn', 'No syncKey found anywhere');
      setLoading(false);
    };

    loadAllSettings();
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
            const list = data ? Object.entries(data).map(([id, val]: any) => ({ id, ...val })) : [];
            setAccounts(list as Account[]);
            if (list.length > 0 && !selectedAccountId) setSelectedAccountId(list[0].id);
            setIsSyncing(false);
            setLoading(false);
          });
          unsubChar = onValue(ref(db, charPath), (snapshot) => {
            const data = snapshot.val();
            const list = data ? Object.entries(data).map(([id, val]: any) => ({ id, ...val })) : [];
            setCharacters(list as Character[]);
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
  }, [selectedCharId, accounts, characters, config, isLocked, intelligentHide, isAionFocused]);

  useEffect(() => {
    // --- [NEW] Compact Mode Toggle Listener ---
    if (typeof window !== 'undefined' && (window as any).api) {
      const api = (window as any).api;
      const handleToggleCompact = () => {
        setIsCompact(prev => {
          const next = !prev;
          localStorage.setItem('aion_is_compact', next.toString());
          setCompactToast({ show: true, value: next });
          setTimeout(() => setCompactToast(p => ({ ...p, show: false })), 1500);
          remoteLog('info', `Compact mode toggled by hotkey: ${next}`);
          return next;
        });
      };
      const handleToggleDetails = () => {
        setIsExpanded(prev => {
          const next = !prev;
          localStorage.setItem('aion_is_expanded', next.toString());
          remoteLog('info', `Details view toggled by hotkey: ${next}`);
          return next;
        });
      };
      const listener = api.on('toggle-compact-mode', handleToggleCompact);
      const detailsListener = api.on('toggle-details-view', handleToggleDetails);
      return () => {
        api.removeListener('toggle-compact-mode', listener);
        api.removeListener('toggle-details-view', detailsListener);
      };
    }
  }, []);



  // --- OCR 엔진 초기화 및 메모리 관리 ---

  useEffect(() => {

    let isMounted = true;

    

    const initTesseract = async () => {

      try {

        setOcrStatus("⚙️ 엔진 로딩중...");

        const { createWorker } = await import('tesseract.js');

        setOcrStatus("⚙️ 워커 생성중...");

        const worker = await createWorker('kor+eng');

        if (!isMounted) {

          await worker.terminate();

          return;

        }

        ocrWorkerRef.current = worker;

        

        // [NEW] 숫자와 슬래시(/)만 인식하도록 최적화 (인식률 대폭 향상)

        await worker.setParameters({

          tessedit_char_whitelist: '0123456789/',

        });

        

        setOcrStatus("✅ 엔진 준비됨");

        setTimeout(() => setOcrStatus("대기중"), 2000);

      } catch (e) {

        setOcrStatus("❌ 엔진 오류");

        console.error("Tesseract init failed", e);

      }

    };

    

    if (ocrEnabled && !ocrWorkerRef.current) {

      initTesseract();

    } else if (!ocrEnabled && ocrWorkerRef.current) {

      // OCR 비활성화 시 워커 종료 (메모리 절감 - 4번 해결)

      const worker = ocrWorkerRef.current;

      ocrWorkerRef.current = null;

      worker.terminate();

      setOcrStatus("대기중");

    }



    return () => {

      isMounted = false;

    };

  }, [ocrEnabled]);



  // --- 화면 캡처 스트림 유지 ---

  useEffect(() => {

    if (!ocrEnabled) {

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

        setOcrStatus("📸 캡처 준비중...");

        const sources = await (window as any).api.invoke('get-desktop-sources');

        const primary = sources[0];

        if (!primary) {

          setOcrStatus("❌ 화면 없음");

          return;

        }

        

        setOcrStatus("📸 스트림 연결중...");

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

        setOcrStatus("✅ 캡처 활성화");

        setTimeout(() => setOcrStatus("대기중"), 2000);

      } catch (e) {

        setOcrStatus("❌ 캡처 오류");

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

  }, [ocrEnabled, ocrRegions]);

  const saveAllConfigs = useCallback(async (overrides?: any) => {
    if (typeof window === "undefined" || !(window as any).api) return;
    
    // 유효한 키가 없으면(그리고 명시적 오버라이드도 없으면) 저장을 방지하여 파일 오염 막음
    const finalSyncKey = overrides?.syncKey || syncKey;
    if (!isValidKey(finalSyncKey) && !overrides?.force) return;

    try {
      const configToSave = {
        syncKey: finalSyncKey,
        intelligentHide: overrides?.intelligentHide ?? intelligentHide,
        isMinimal: overrides?.isMinimal ?? isMinimal,
        isExpanded: overrides?.isExpanded ?? isExpanded,
        isCompact: overrides?.isCompact ?? isCompact,
        simpleOdeCharge: overrides?.simpleOdeCharge ?? simpleOdeCharge,
        opacity: overrides?.opacity ?? opacity,
        defaultBrowser: overrides?.defaultBrowser || defaultBrowser,
        mapTemplates: overrides?.mapTemplates || mapTemplates,
        loadingTemplate: overrides?.loadingTemplate || loadingTemplate,
        ocrRegions: overrides?.ocrRegions || ocrRegions,
        hotkeys: overrides?.hotkeys || hotkeys
      };
      
      await (window as any).api.invoke('save-config', configToSave);
      setConfigStatus("SAVED_AUTO");
    } catch (e) {
      console.error("Auto-save error", e);
    }
  }, [syncKey, intelligentHide, isMinimal, isExpanded, isCompact, simpleOdeCharge, opacity, defaultBrowser, mapTemplates, loadingTemplate, ocrRegions, hotkeys]);

  useEffect(() => {
    const timer = setTimeout(saveAllConfigs, 1000);
    return () => clearTimeout(timer);
  }, [saveAllConfigs]);

  useEffect(() => {
    localStorage.setItem('aion_is_expanded', JSON.stringify(isExpanded));
    localStorage.setItem('aion_is_minimal', JSON.stringify(isMinimal));
    localStorage.setItem('aion_is_compact', JSON.stringify(isCompact));
    localStorage.setItem('aion_simple_ode_charge', JSON.stringify(simpleOdeCharge));
  }, [isExpanded, isMinimal, isCompact, simpleOdeCharge]);



  useEffect(() => {

    if ((window as any).api) {

      (window as any).api.send('view-state-change', { view, isLocked });

    }

  }, [view, isLocked]);



  useEffect(() => {
    // 서버 시간 오차 동기화
    const offsetRef = ref(db, ".info/serverTimeOffset");
    const unsubOffset = onValue(offsetRef, (snap) => {
      setServerTimeOffset(snap.val() || 0);
    });

    const clock = setInterval(() => {
      setCurrentTime(Date.now() + (snapOffset || 0));
    }, 1000);

    let snapOffset = 0;
    onValue(offsetRef, (snap) => { snapOffset = snap.val() || 0; });

    return () => {
      clearInterval(clock);
      unsubOffset();
    };
  }, []);


  const handleSaveSyncKey = async () => {
    const rawKey = tempSyncKey.trim().toUpperCase();
    remoteLog('info', `handleSaveSyncKey called with: "${rawKey}"`);

    if (!isValidKey(rawKey)) {
      setKeyError("영문/숫자로 된 8자리 키를 입력해 주세요.");
      return;
    }
    
    try {
      setKeyError(null);
      setSyncKey(rawKey);
      setTempSyncKey(rawKey);
      localStorage.setItem('aion_sync_key', rawKey);
      
      remoteLog('info', "Attempting direct save-config call...");
      const res = await (window as any).api.invoke('save-config', {
        syncKey: rawKey,
        intelligentHide,
        isMinimal,
        opacity,
        defaultBrowser,
        mapTemplates,
        loadingTemplate,
        ocrRegions,
        hotkeys
      });
      
      remoteLog('info', "Direct save-config result:", res);
      alert("연동 키가 저장되었습니다. (대소문자 구분 필수)");
    } catch (err: any) {
      remoteLog('error', "Direct save-config failed:", err.message);
      alert(`저장 실패: ${err.message}`);
    }
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



  const handleCaptureLoadingTemplate = async () => {

    if (!videoRef.current) return;

    const video = videoRef.current;

    const canvas = document.createElement('canvas');

    canvas.width = 40; canvas.height = 40;

    const ctx = canvas.getContext('2d');

    if (ctx) {

      if (ocrRegions.loading) {

        // 지정된 영역이 있으면 그 부분을 정밀 캡처
        const reg = ocrRegions.loading;
        ctx.drawImage(video, reg.x, reg.y, reg.width, reg.height, 0, 0, 40, 40);
      } else {
        // 없으면 중앙 60% (기본값)
        ctx.drawImage(video, video.videoWidth * 0.2, video.videoHeight * 0.2, video.videoWidth * 0.6, video.videoHeight * 0.6, 0, 0, 40, 40);
      }
      
      const dataUrl = canvas.toDataURL();
      setLoadingTemplate(dataUrl);
      loadingTemplatePixelsRef.current = ctx.getImageData(0, 0, 40, 40).data;
      localStorage.setItem('aion_loading_template', dataUrl);
      // saveAllConfigs (useEffect)에 의해 1초 뒤 자동 저장됨

      setOcrStatus("✅ 로딩 템플릿 등록 완료");

      setTimeout(() => setOcrStatus("대기중"), 2000);

    }

  };



  const handleClearKey = async () => {
    if (!confirm("연동 키를 삭제하시겠습니까? 다시 연동해야 합니다.")) return;
    
    localStorage.removeItem('aion_sync_key');
    setSyncKey("");
    setTempSyncKey("");
    setAccounts([]);
    setCharacters([]);
    
    // 파일에서도 키 삭제 (force 옵션 사용하여 빈 값 저장 허용)
    await saveAllConfigs({ syncKey: "", force: true });
    alert("연동 정보가 초기화되었습니다.");
  };



  const selectedAccount = useMemo(() => {
    const rawAccount = accounts.find(a => a.id === selectedAccountId) || accounts[0] || null;
    if (!rawAccount) return null;
    
    // 계정 레벨 데이터 (일일던전, 슈고, 침공 등) 리셋 로직 적용
    return calculateCurrentState(rawAccount, new Date(currentTime), false, !!rawAccount.membership);
  }, [accounts, selectedAccountId, currentTime]);



  const accountCharacters = useMemo(() => {

    return characters.filter(c => c.accountId === selectedAccountId);

  }, [characters, selectedAccountId]);



  const selectedChar = useMemo(() => {

    const rawChar = accountCharacters.find(c => c.id === selectedCharId) || accountCharacters[0] || null;
    return rawChar
      ? calculateCurrentState(rawChar, new Date(currentTime), true, !!selectedAccount?.membership) as Character
      : null;

  }, [accountCharacters, selectedCharId, currentTime, selectedAccount?.membership]);



  const calculatedEnergy = useMemo(() => {

    if (!selectedChar) return 0;

    return selectedChar.ode || 0;

  }, [selectedChar]);



  const maxBaseOde = selectedAccount?.membership ? 840 : 540;

  const energyPercent = useMemo(() => (calculatedEnergy / maxBaseOde) * 100, [calculatedEnergy, maxBaseOde]);

  const extraOdePercent = useMemo(() => ((selectedChar?.odeExtra || 0) / (config?.maxChargedOde || 2000)) * 100, [selectedChar?.odeExtra, config?.maxChargedOde]);

  const timeUntilMax = getTimeUntilNextRecharge(new Date(currentTime));



  const selectedCharRef = useRef(selectedChar);

  useEffect(() => { selectedCharRef.current = selectedChar; }, [selectedChar]);



  const calculatedEnergyRef = useRef(calculatedEnergy);

  useEffect(() => { calculatedEnergyRef.current = calculatedEnergy; }, [calculatedEnergy]);



  // --- OCR 폴링 루프 ---

  useEffect(() => {

    if (!ocrEnabled || !ocrWorkerRef.current || !videoRef.current) return;

    

    const interval = setInterval(async () => {

      try {

        const video = videoRef.current;

        if (!video || !video.videoWidth) return;



        const processRegion = async (region: any, isOde: boolean) => {

          if (!region) return null;

          const scale = 3;

          const canvas = document.createElement('canvas');

          canvas.width = region.width * scale;

          canvas.height = region.height * scale;

          const ctx = canvas.getContext('2d');

          if (!ctx) return null;

          ctx.imageSmoothingEnabled = false;

          ctx.drawImage(video, region.x, region.y, region.width, region.height, 0, 0, canvas.width, canvas.height);

          

          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);

          const d = imgData.data;

          let totalBrightness = 0;

          for (let i = 0; i < d.length; i += 4) totalBrightness += (0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2]);

          const avgBrightness = totalBrightness / (d.length / 4);

          const isDarkBackground = avgBrightness < 128;



          for (let i = 0; i < d.length; i += 4) {

            const b = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];

            let val = isDarkBackground ? (b > 160 ? 0 : 255) : (b < 100 ? 0 : 255);

            d[i] = d[i+1] = d[i+2] = val;

          }

          ctx.putImageData(imgData, 0, 0);

          const dataUrl = canvas.toDataURL('image/png', 1.0);

          if (isOde) setDebugImgOde(dataUrl);

          else setDebugImgMap(dataUrl);



          const { data: { text } } = await ocrWorkerRef.current.recognize(dataUrl);

          return text;

        };



        // [NEW] 템플릿 매칭 함수 (픽셀 유사도 MSE 비교)

        const templateMatch = async (currentDataUrl: string) => {

          const templates = Object.entries(mapTemplates);

          if (templates.length === 0) return null;



          const getPixels = (url: string): Promise<Uint8ClampedArray> => {

            return new Promise((resolve) => {

              const img = new Image();

              img.onload = () => {

                const cvs = document.createElement('canvas');

                cvs.width = 20; cvs.height = 20;

                const c = cvs.getContext('2d');

                if (c) {

                  c.drawImage(img, 0, 0, 20, 20);

                  resolve(c.getImageData(0, 0, 20, 20).data);

                }

              };

              img.src = url;

            });

          };



          const currentPixels = await getPixels(currentDataUrl);

          let bestMatch = null;

          let minDiff = 1000;



          for (const [name, templateUrl] of templates) {

            const templatePixels = await getPixels(templateUrl);

            let diff = 0;

            for (let i = 0; i < currentPixels.length; i += 4) {

              const p1 = (currentPixels[i] + currentPixels[i+1] + currentPixels[i+2]) / 3;

              const p2 = (templatePixels[i] + templatePixels[i+1] + templatePixels[i+2]) / 3;

              diff += Math.abs(p1 - p2);

            }

            const avgDiff = diff / 400;

            if (avgDiff < minDiff) {

              minDiff = avgDiff;

              if (avgDiff < 15) bestMatch = name;

            }

          }

          return bestMatch;

        };



        // 1. 로딩/이동 화면 감지 (영역 상관없이 전체 화면 샘플링)

        if (video.videoWidth) {

          const sampleCanvas = document.createElement('canvas');

          const vW = video.videoWidth;

          const vH = video.videoHeight;

          sampleCanvas.width = 20; sampleCanvas.height = 20;

          const sctx = sampleCanvas.getContext('2d');

          

          if (sctx) {

            // [NEW] 설정된 로딩 영역이 있으면 그곳을 샘플링

            if (ocrRegions.loading) {

                const r = ocrRegions.loading;

                sctx.drawImage(video, r.x, r.y, r.width, r.height, 0, 0, 20, 20);

            } else {

                // 기본값 (중앙 80%)

                sctx.drawImage(video, vW * 0.1, vH * 0.1, vW * 0.8, vH * 0.8, 0, 0, 20, 20);

            }



            const d = sctx.getImageData(0, 0, 20, 20).data;

            

            let avgBrightness = 0;

            let hasCyan = false;



            for (let i = 0; i < d.length; i += 4) {

              const r = d[i], g = d[i+1], b = d[i+2];

              avgBrightness += (r + g + b) / 3;

              // 시안 계열 (G, B가 높으면 시안) - R 조건 완화

              if (g > 160 && b > 180) hasCyan = true;

            }

            avgBrightness /= 400;



            // 로딩 화면 특징: 전체적으로 매우 어둡거나(avg < 30), 특유의 하늘색 포인트(R<150, G>150, B>150)가 있음

            const isLoadingNow = avgBrightness < 25; 
            
            // [NEW] 템플릿 기반 로딩 감지
            let isMatchedWithTemplate = false;
            if (loadingTemplatePixelsRef.current) {
                const currentCvs = document.createElement('canvas');
                currentCvs.width = 40; currentCvs.height = 40;
                const cctx = currentCvs.getContext('2d');
                if (cctx) {
                    if (ocrRegions.loading) {
                        const r = ocrRegions.loading;
                        cctx.drawImage(video, r.x, r.y, r.width, r.height, 0, 0, 40, 40);
                    } else {
                        cctx.drawImage(video, video.videoWidth * 0.2, video.videoHeight * 0.2, video.videoWidth * 0.6, video.videoHeight * 0.6, 0, 0, 40, 40);
                    }
                    const currentPixels = cctx.getImageData(0, 0, 40, 40).data;
                    const templatePixels = loadingTemplatePixelsRef.current!;
                    let diff = 0;
                    for (let i = 0; i < currentPixels.length; i += 4) {
                      const p1 = (currentPixels[i] + currentPixels[i+1] + currentPixels[i+2]) / 3;
                      const p2 = (templatePixels[i] + templatePixels[i+1] + templatePixels[i+2]) / 3;
                      diff += Math.abs(p1 - p2);
                    }
                    if (diff / 1600 < 20) isMatchedWithTemplate = true;
                }
            }

            if (isLoadingNow || hasCyan || isMatchedWithTemplate) {
              if (!isTransitioning) setIsTransitioning(true);
              setOcrStatus(isMatchedWithTemplate ? "⏳ 로딩 사진 일치함..." : "⏳ 맵 이동 감지됨...");
              return; 
            } else if (isTransitioning && avgBrightness > 45) {
              setIsTransitioning(false);
              setOcrStatus("✅ 이동 완료 (인식 재개)");
            }

          }

        }



        // 영역이 하나도 없으면 아래 OCR 인식 로직은 건너뜀

        if (!ocrRegions.ode && !ocrRegions.map) {

          if (!isTransitioning) setOcrStatus("📍 영역 설정 필요");

          return;

        }



        // 2. 맵 이름 인식 및 지능형 보정

        const mapText = await processRegion(ocrRegions.map, false);

        if (mapText) {

          const clean = mapText.replace(/\s+/g, '');

          setDebugTextMap(clean);



          const contentKeywords = {

            "원정": ["원정", "원져", "워정", "원경", "원청"],

            "초월": ["초월", "초워", "츠월", "초월의", "초월에"],

            "성역": ["성역", "성어", "서역", "성역의", "성역에"],

            "불의 신전": ["불의신전", "불이신전", "불외신전", "블의신전", "불의선전"]

          };



          let matched = null;

          for (const [realName, patterns] of Object.entries(contentKeywords)) {

            if (patterns.some(p => clean.includes(p))) {

              matched = realName;

              break;

            }

          }



          // 3. OCR 실패 시 템플릿 매칭 시도

          if (!matched && debugImgMap) {

            matched = await templateMatch(debugImgMap);

          }



          if (matched) setDetectedContent(matched);

          else if (clean.length > 2 && (clean.includes("마을") || clean.includes("필드") || clean.includes("엘리안"))) setDetectedContent(null);

        }



        // 2. 오드 수치 인식 및 소모 감지

        const odeText = await processRegion(ocrRegions.ode, true);

        if (odeText) {

          setDebugTextOde(odeText.trim());

          const matches = odeText.match(/\d+/g);

          if (matches) {

            const foundNumber = parseInt(matches.join(''), 10);

            if (foundNumber > 0 && foundNumber <= config.maxChargedOde) {

              if (!isTransitioning) setOcrStatus(`마지막 인식: ${foundNumber}`);

              const char = selectedCharRef.current;

              const currentEnergy = calculatedEnergyRef.current;

              

              // 소모 감지 로직 (40 or 80 차감)

              const diff = currentEnergy - foundNumber;

              if (diff === 40 || diff === 80) {

                setLastRewardTime(Date.now());

                // 자동으로 컨텐츠 횟수 차감 처리 가능 (추후 구현)

              }



              // 오인식 방지 및 데이터 보호 로직 (v501.3)

              // 1. 차이가 5 이상일 때만 (아이온2 회복은 10/15 단위이므로 1~2 변동은 오인식일 확률 높음)

              // 2. 혹은 정확히 소모량(40, 80)과 일치할 때

              const isSignificantChange = Math.abs(foundNumber - currentEnergy) >= 5;

              const isExpectedConsumption = diff === 40 || diff === 80;



              if (char && syncKey && (isSignificantChange || isExpectedConsumption)) {

                const updated = { ...char, ode: foundNumber, lastUpdate: new Date().toISOString() };

                setCharacters(prev => prev.map(c => c.id === updated.id ? updated : c));

                await saveToFirebase(`users/${syncKey}/od_helper/members/${updated.id}`, updated);

                setOcrStatus(`✅ 데이터 동기화 완료: ${foundNumber}`);

              }

            }

          }

        }

      } catch (err) {

        console.error("OCR Polling Error", err);

      }

    }, 3000);

    

    return () => clearInterval(interval);

  }, [ocrEnabled, ocrRegions, syncKey, config]);



  const saveToFirebase = async (path: string, data: any) => {

    if (typeof window !== "undefined" && (window as any).api) {

      await (window as any).api.invoke('set-firebase-data', path, data);

    } else {

      await set(ref(db, path), data);

    }

  }



  const handleAction = async (type: string, isUndo: boolean = false) => {

    if (!selectedChar || !syncKey || !selectedAccount) return;

    const cost = selectedAccount.membership ? config.costs.membership : config.costs.normal;

    if (!isUndo && calculatedEnergy + (selectedChar.odeExtra || 0) < cost) {
      showToast("오드가 부족합니다.", "error");
      return;
    }

    // --- Ticket Validation ---
    if (!isUndo && ticketValidation) {
      if (type === 'expedition') {
        const rewardTotal = (selectedChar.expeditionBasic || 0) + (selectedChar.expeditionExtra || 0);
        const killTotal = (selectedChar.expeditionKillsBasic || 0) + (selectedChar.expeditionKillsExtra || 0);
        if (rewardTotal <= 0) { showToast("원정 티켓이 부족합니다.", "error"); return; }
        if (killTotal <= 0) { showToast("원정 보스 처치 가능 횟수가 부족합니다.", "error"); return; }
      } else if (type === 'transcendence') {
        const rewardTotal = (selectedChar.transcendenceBasic || 0) + (selectedChar.transcendenceExtra || 0);
        const killTotal = (selectedChar.transcendenceKillsBasic || 0) + (selectedChar.transcendenceKillsExtra || 0);
        if (rewardTotal <= 0) { showToast("초월 티켓이 부족합니다.", "error"); return; }
        if (killTotal <= 0) { showToast("초월 보스 처치 가능 횟수가 부족합니다.", "error"); return; }
      } else if (type === 'sanctuary') {
        const rewardTotal = (selectedChar.sanctuaryBasic || 0) + (selectedChar.sanctuaryExtra || 0);
        const killTotal = (selectedChar.sanctuaryKillsBasic || 0) + (selectedChar.sanctuaryKillsExtra || 0);
        // 성역은 입장(4회)이 먼저 소진되는 경우가 많으므로 문구를 명확히 함
        if (rewardTotal <= 0) { showToast("성역 입장 가능 횟수(티켓)가 부족합니다.", "error"); return; }
        if (killTotal <= 0) { showToast("성역 보상 획득 가능 횟수가 부족합니다.", "error"); return; }
      }
    }

    

    let updated = JSON.parse(JSON.stringify(selectedChar));

    if (isUndo) {
      updated.ode = Math.min(maxBaseOde, calculatedEnergy + cost);
    } else if (calculatedEnergy >= cost) updated.ode = calculatedEnergy - cost;

    else { updated.ode = 0; updated.odeExtra = (updated.odeExtra || 0) - (cost - calculatedEnergy); }

    

    updated.lastUpdate = new Date().toISOString();

    

    if (type === 'expedition') {
       if (isUndo) updated.expeditionKillsBasic = (updated.expeditionKillsBasic || 0) + 1;
       else if (updated.expeditionKillsBasic > 0) updated.expeditionKillsBasic -= 1;
       else if (updated.expeditionKillsExtra > 0) updated.expeditionKillsExtra -= 1;

       if (isUndo) updated.expeditionBasic = (updated.expeditionBasic || 0) + 1;
       else if (updated.expeditionBasic > 0) updated.expeditionBasic -= 1;
       else if (updated.expeditionExtra > 0) updated.expeditionExtra -= 1;
    } else if (type === 'transcendence') {
       if (isUndo) updated.transcendenceKillsBasic = (updated.transcendenceKillsBasic || 0) + 1;
       else if (updated.transcendenceKillsBasic > 0) updated.transcendenceKillsBasic -= 1;
       else if (updated.transcendenceKillsExtra > 0) updated.transcendenceKillsExtra -= 1;

       if (isUndo) updated.transcendenceBasic = (updated.transcendenceBasic || 0) + 1;
       else if (updated.transcendenceBasic > 0) updated.transcendenceBasic -= 1;
       else if (updated.transcendenceExtra > 0) updated.transcendenceExtra -= 1;
    } else if (type === 'sanctuary') {
       if (isUndo) updated.sanctuaryKillsBasic = (updated.sanctuaryKillsBasic || 0) + 1;
       else if (updated.sanctuaryKillsBasic > 0) updated.sanctuaryKillsBasic -= 1;
       else if (updated.sanctuaryKillsExtra > 0) updated.sanctuaryKillsExtra -= 1;

       if (isUndo) updated.sanctuaryBasic = (updated.sanctuaryBasic || 0) + 1;
       else if (updated.sanctuaryBasic > 0) updated.sanctuaryBasic -= 1;
       else if (updated.sanctuaryExtra > 0) updated.sanctuaryExtra -= 1;
    }

    

    setCharacters(prev => prev.map(c => c.id === updated.id ? updated : c));
    await saveToFirebase(`users/${syncKey}/od_helper/members/${updated.id}`, updated);

    // [NEW] 대시보드 동기화를 위한 계정별 누적 횟수 업데이트
    const accField = type === 'expedition' ? 'expeditionCount' : type === 'transcendence' ? 'transcendenceCount' : 'sanctuaryCount';
    
    // selectedAccount에서 가져오되, accounts 배열에서 최신 상태를 찾는 것이 더 안전함
    const latestAcc = accounts.find(a => a.id === selectedAccount?.id) || selectedAccount;
    const currentAccCount = (latestAcc as any)?.[accField] || 0;
    
    await updateAccountData({ [accField]: Math.max(0, currentAccCount + (isUndo ? -1 : 1)) });
    showToast(isUndo ? "실행을 되돌렸습니다." : "실행 완료");
  }

  const handleChargeOde = (amount: number) => {
    if (!selectedChar) return;
    const currentExtra = selectedChar.odeExtra || 0;
    const maxExtra = config.maxChargedOde || 2000;
    updateCharacterData({
      ode: calculatedEnergy, // 🚩 중요: lastUpdate 갱신 전 현재 자연회복된 오드를 기본 오드로 고정
      odeExtra: Math.min(maxExtra, currentExtra + amount),
      lastUpdate: new Date().toISOString()
    });
  }

  // [NEW] 범용 데이터 업데이트 함수 (상태 토글 및 수량 조절용)
  const updateCharacterData = async (fields: Partial<Character>) => {
    if (!selectedChar || !syncKey) return;
    const updated = { ...selectedChar, ...fields, lastUpdate: fields.lastUpdate || new Date().toISOString() };
    setCharacters(prev => prev.map(c => c.id === updated.id ? updated : c));
    await saveToFirebase(`users/${syncKey}/od_helper/members/${updated.id}`, updated);
  }

  const updateAccountData = async (fields: Partial<Account>) => {
    if (!selectedAccount || !syncKey) return;
    const updated = { ...selectedAccount, ...fields, lastUpdate: (fields as any).lastUpdate || new Date().toISOString() } as any;
    setAccounts(prev => prev.map(a => a.id === updated.id ? updated : a));
    await saveToFirebase(`users/${syncKey}/od_helper/accounts/${updated.id}`, updated);
  }

  // --- Hotkey Update Logic ---
  const updateHotkeys = async (newHotkeys: typeof hotkeys) => {
    setHotkeys(newHotkeys);
    localStorage.setItem('aion_hotkeys', JSON.stringify(newHotkeys));
    if ((window as any).api) {
      await (window as any).api.invoke('update-hotkeys', newHotkeys);
      // saveAllConfigs (useEffect)에 의해 1초 뒤 자동 저장됨
    }
  };

  const handleHotkeyRecord = (e: React.KeyboardEvent) => {
    if (!recordingKey) return;
    e.preventDefault();
    e.stopPropagation();

    const modifiers = [];
    if (e.ctrlKey) modifiers.push('Control');
    if (e.shiftKey) modifiers.push('Shift');
    if (e.altKey) modifiers.push('Alt');
    if (e.metaKey) modifiers.push('CommandOrControl');

    let key = e.key;
    if (key === ' ') key = 'Space';
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return; 

    if (key === '`') key = '`';
    if (key === '~') key = '`';
    if (key.length === 1) key = key.toUpperCase();

    const combination = modifiers.length > 0 ? `${modifiers.join('+')}+${key}` : key;

    if (combination.includes('Space')) {
      setHotkeyWarning("스페이스바가 포함된 조합은 일부 환경에서 동작하지 않을 수 있습니다.");
    } else {
      setHotkeyWarning(null);
    }

    const updated = { ...hotkeys, [recordingKey]: combination };
    updateHotkeys(updated);
    setRecordingKey(null);
  };




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

  const handleUpdateTicketValue = async () => {
    if (!editingTicketField || !selectedCharId) return;
    const val = parseInt(editValue) || 0;
    await updateCharacterData({ [editingTicketField]: val });
    setEditingTicketField(null);
  };



  if (loading) return (
    <div className="w-[312px] h-[200px] flex flex-col items-center justify-center bg-[#0b0f1a] text-indigo-400 rounded-2xl border border-white/10 gap-3">
      <Loader2 className="animate-spin w-8 h-8" />
      <span className="text-[10px] font-black uppercase tracking-widest animate-pulse">설정 불러오는 중...</span>
      {/* 압축 모드 토글 토스트 */}
      {compactToast.show && (
        <div className="fixed inset-x-0 top-1/2 -translate-y-1/2 flex justify-center z-[9999] pointer-events-none animate-in fade-in zoom-in duration-200">
          <div className="bg-indigo-600/90 text-white px-4 py-2 rounded-full text-xs font-black shadow-xl backdrop-blur-md border border-white/20">
            압축 모드: {compactToast.value ? "켜짐 (ON)" : "꺼짐 (OFF)"}
          </div>
        </div>
      )}
    </div>
  );



  const isHudVisible = !intelligentHide || isAionFocused;



  return (

    <main className={cn("relative flex flex-col items-start p-4 w-[640px] h-[950px] bg-transparent text-white font-sans overflow-visible transition-opacity duration-300", !isHudVisible && "opacity-0 pointer-events-none")}>

      {/* --- HUD MAIN --- */}

      <div 

        ref={hudRef} 

        className={cn(

          "absolute top-0 left-0 w-[324px] flex flex-col z-20 transition-all duration-500 ease-in-out overflow-hidden group", 

          isMinimal 
            ? "bg-transparent border-none shadow-none" 
            : "bg-[#121826] border border-white/10 rounded-2xl shadow-2xl",
          isCompact ? "h-fit max-h-[300px]" : (isExpanded ? "h-fit max-h-[850px]" : "h-fit max-h-[450px]")
        )}

      >

        <div className={cn(
          "drag-region flex items-center justify-between px-4 bg-[#0b0f1a] border-b border-white/5 transition-all duration-200 overflow-hidden",
          isCompact 
            ? "h-0 opacity-0 overflow-hidden absolute" 
            : "h-[42px] opacity-100"
        )}>

          {/* 헤더는 항상 100% 투명도 */}

          <div className="flex items-center gap-2">

            <span className="text-[9px] font-black text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded tracking-tighter">v0.2.1</span>

            {syncKey && accounts.length > 0 ? (

              <div className="flex items-center gap-1 group relative">

                <User className="w-3 h-3 text-slate-300" />

                <select 

                    className="no-drag appearance-none bg-transparent text-[11px] font-black text-slate-100 border-none outline-none cursor-pointer hover:text-indigo-400 transition-colors pr-4" 

                    value={selectedAccountId || ""} 

                    onChange={(e) => setSelectedAccountId(e.target.value)}

                >

                  {accounts.map(acc => <option key={acc.id} value={acc.id} className="bg-[#121826]">{acc.name}</option>)}

                </select>

                <ChevronDown className="w-3 h-3 text-slate-400 group-hover:text-white pointer-events-none absolute right-0" />

              </div>

            ) : (

              <span className="text-[10px] font-bold text-slate-300">{syncKey ? "데이터 없음" : "연동 필요"}</span>

            )}

          </div>

          <div className="no-drag flex items-center gap-0.5">

            <button className={cn("p-1.5 rounded text-slate-300 hover:text-white", isSyncing && "text-indigo-400")}><RefreshCw className={cn("w-3.5 h-3.5", isSyncing && "animate-spin")} /></button>

            <button onClick={() => setIsLocked(!isLocked)} className={cn("p-1.5 rounded text-slate-300 hover:text-white", isLocked && "text-indigo-400")}><Lock className="w-3.5 h-3.5" fill={isLocked ? "currentColor" : "none"} /></button>

            <button onClick={() => setView(view === "hud" ? "settings" : "hud")} className={cn("p-1.5 rounded hover:text-white transition-colors", view === "settings" ? "text-indigo-400" : "text-slate-300")} title="환경 설정"><Settings className="w-3.5 h-3.5" /></button>

            <button onClick={() => (window as any).api?.invoke('close-window')} className="p-1.5 rounded text-slate-300 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>

          </div>

        </div>



        {/* 본문에만 투명도 적용 */}

        <div 

          className={cn(

            "p-4 flex flex-col gap-3 transition-all duration-300",
            isCompact && "p-3 pt-0 gap-2",
            isMinimal ? "rounded-b-2xl backdrop-blur-none group-hover:backdrop-blur-md" : "bg-transparent"

          )} 

          style={{ 
            backgroundColor: isMinimal ? `rgba(18, 24, 38, ${opacity / 100})` : 'transparent'
          }}

        >

          {!syncKey ? (

            <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">

              <Key className="w-8 h-8 text-slate-700" />

              <div className="text-xs font-bold text-slate-200">웹사이트에서 동기화 키를 복사하여<br/>설정창에 입력해 주세요.</div>

              

              <div className="flex flex-col gap-1 mt-2">

                <button 
                  onClick={() => {
                    const saved = localStorage.getItem('aion_sync_key');
                    remoteLog('info', 'Manual load attempt:', saved);
                    if (saved && isValidKey(saved)) {
                      setSyncKey(saved);
                      setTempSyncKey(saved);
                      remoteLog('info', 'Manual load success');
                      alert("키를 불러왔습니다.");
                    } else {
                      remoteLog('warn', 'Manual load failed: No valid key found in localStorage');
                      alert("기억된 키가 없습니다. 설정 창에서 직접 입력해 주세요.");
                      setView("settings");
                    }
                  }}
                  className="text-[9px] text-indigo-500/60 hover:text-indigo-400 underline decoration-dotted"
                >
                  기억된 키 강제 불러오기
                </button>

              </div>



              <button onClick={() => setView("settings")} className="mt-4 px-4 py-2 bg-indigo-500/10 text-indigo-400 text-[10px] font-black rounded-lg hover:bg-indigo-500/20">설정 열기</button>

            </div>

          ) : characters.length === 0 && !loading ? (

            <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">

              <CloudOff className="w-8 h-8 text-slate-700" />

              <div className="text-xs font-bold text-slate-200">연동된 캐릭터가 없습니다.<br/>웹사이트에서 먼저 캐릭터를 등록하세요.</div>

              <div className="text-[9px] text-slate-400 font-bold bg-white/5 px-2 py-1 rounded">현재 연동 키: {syncKey}</div>

              <button onClick={() => setView("settings")} className="mt-2 px-4 py-2 bg-slate-800 text-slate-200 text-[9px] font-bold rounded-lg hover:text-white transition-colors">키 다시 입력하기</button>

            </div>

          ) : (

            <>

              <div className={cn("flex justify-between h-auto px-1", isCompact ? "items-center mb-1" : "items-start mb-3 min-h-[64px]")}>

                <div className="flex flex-col gap-2 flex-1 min-w-0">

                  <div className="flex flex-wrap items-center gap-x-2 gap-y-2">

                    <div className="group relative flex items-center min-w-0 max-w-full">

                        <select 

                            className="no-drag appearance-none bg-transparent text-2xl font-black text-white tracking-tighter outline-none cursor-pointer hover:text-indigo-400 transition-colors pr-6 min-w-[100px] max-w-full truncate drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]" 

                            value={selectedCharId || ""} 

                            onChange={(e) => setSelectedCharId(e.target.value)}

                        >

                            {accountCharacters.map(char => (

                                <option key={char.id} value={char.id} className="bg-[#121826] text-base">

                                    {char.name}

                                </option>

                            ))}

                        </select>

                        <ChevronDown className="absolute right-1.5 w-5 h-5 text-slate-300 group-hover:text-indigo-400 pointer-events-none transition-colors" />

                    </div>

                    

                    {!isCompact && (
                      <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                        {/* 멤버쉽 상태 */}
                        <div className="flex items-center gap-1 bg-slate-800/40 px-1.5 py-0.5 rounded border border-white/5 shadow-sm">
                          <div className={cn("w-1.5 h-1.5 rounded-full", selectedAccount?.membership ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]" : "bg-slate-500")} />
                          <span className={cn("text-[9px] font-black uppercase tracking-tight", selectedAccount?.membership ? "text-amber-400/90" : "text-slate-200")}>
                            {selectedAccount?.membership ? "멤버쉽" : "일반"}
                          </span>
                        </div>

                        {/* 직업 정보 */}
                        <span className="text-[10px] font-black text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-md uppercase flex-shrink-0 shadow-sm">
                          {selectedChar?.className}
                        </span>

                        {/* 충전 주기 */}
                        {calculatedEnergy < (selectedAccount?.membership ? 840 : 540) && (
                          <div className="flex items-center gap-1 bg-black/20 px-1.5 py-0.5 rounded border border-indigo-500/10 animate-in fade-in duration-500">
                            <Clock className="w-2.5 h-2.5 text-indigo-400" />
                            <span className="text-[9px] font-bold text-indigo-400 tracking-tight">{timeUntilMax}</span>
                          </div>
                        )}
                      </div>
                    )}

                  </div>

                </div>

                <div className={cn("flex flex-col items-end", isCompact ? "flex-row items-center gap-3" : "scale-100 origin-right")}>
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
                              className={cn("font-black italic text-indigo-400 leading-none cursor-pointer hover:text-white transition-colors", isCompact ? "text-lg" : "text-2xl")}
                          >
                              {calculatedEnergy}
                          </span>
                      )}
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-indigo-300 leading-none">/ {selectedAccount?.membership ? 840 : 540}</span>
                      </div>
                    </div>

                  <div className="flex items-baseline gap-1 group no-drag">
                      <Plus className="w-2.5 h-2.5 text-slate-200 font-black" />
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
                              className={cn("font-bold transition-all duration-300", isCompact ? "text-lg text-purple-400" : "text-sm text-purple-400")}
                          >
                              {selectedChar?.odeExtra || 0}
                          </span>
                      )}
                      
                      <span className="text-indigo-300 font-bold text-[10px] ml-0.5">/ {config.maxChargedOde}</span>
                  </div>
                </div>

              </div>



              {/* [NEW] 보상 획득 알림 애니메이션 */}

              {lastRewardTime && Date.now() - lastRewardTime < 5000 && (

                <div className="flex items-center justify-center gap-2 py-1.5 bg-amber-500/20 border border-amber-500/30 rounded-xl animate-in zoom-in-95 duration-300">

                  <AlertCircle className="w-3 h-3 text-amber-400" />

                  <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest">보상 획득 확인 (-{selectedAccount?.membership ? 80 : 40} 오드)</span>

                </div>

              )}



              <div className="flex items-center gap-3 my-1">
                <div className={cn("flex flex-col gap-2.5 transition-all duration-300", simpleOdeCharge ? "w-[calc(100%-130px)]" : "w-full")}>
                  {/* 메인 오드 게이지 (Smooth Bar) */}
                  <div className="relative w-full h-2.5 bg-slate-900/50 rounded-full overflow-hidden border border-white/5 shadow-inner group">
                    <div 
                      className="absolute top-0 left-0 h-full bg-gradient-to-r from-indigo-600 to-indigo-400 transition-all duration-700 ease-out shadow-[0_0_12px_rgba(99,102,241,0.4)]"
                      style={{ width: `${energyPercent}%` }}
                    />
                    {/* Subtle Markers every 20% */}
                    <div className="absolute inset-0 flex justify-between pointer-events-none px-[20%]">
                      <div className="w-[1px] h-full bg-white/5" />
                      <div className="w-[1px] h-full bg-white/5" />
                      <div className="w-[1px] h-full bg-white/5" />
                      <div className="w-[1px] h-full bg-white/5" />
                    </div>
                  </div>

                  {/* 추가 오드 게이지 (Smooth Bar) */}
                  <div className="relative w-full h-2 bg-slate-900/50 rounded-full overflow-hidden border border-white/5 shadow-inner">
                    <div 
                      className="absolute top-0 left-0 h-full bg-gradient-to-r from-purple-600 to-purple-400 transition-all duration-700 ease-out shadow-[0_0_10px_rgba(168,85,247,0.3)]"
                      style={{ width: `${extraOdePercent}%` }}
                    />
                    {/* Subtle Markers every 20% */}
                    <div className="absolute inset-0 flex justify-between pointer-events-none px-[20%]">
                      <div className="w-[1px] h-full bg-white/5" />
                      <div className="w-[1px] h-full bg-white/5" />
                      <div className="w-[1px] h-full bg-white/5" />
                      <div className="w-[1px] h-full bg-white/5" />
                    </div>
                  </div>
                </div>

                {simpleOdeCharge && (
                  <div className="flex flex-row gap-2 w-[120px] shrink-0 animate-in fade-in slide-in-from-right-2 duration-300">
                    <button 
                      onClick={() => handleChargeOde(15)}
                      className="flex-1 h-[38px] flex flex-col items-center justify-center bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 rounded-lg text-[11px] font-black text-purple-300 transition-all active:scale-95 no-drag shadow-lg"
                    >
                      <span className="text-[8px] opacity-60 leading-none mb-0.5">오드</span>
                      +15
                    </button>
                    <button 
                      onClick={() => handleChargeOde(40)}
                      className="flex-1 h-[38px] flex flex-col items-center justify-center bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 rounded-lg text-[11px] font-black text-purple-300 transition-all active:scale-95 no-drag shadow-lg"
                    >
                      <span className="text-[8px] opacity-60 leading-none mb-0.5">오드</span>
                      +40
                    </button>
                  </div>
                )}
              </div>



              <div className="relative overflow-hidden my-1 select-none">
                <div className="px-1 py-1">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={activeContentType}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.2 }}
                      drag="x"
                      dragDirectionLock
                      dragConstraints={{ left: 0, right: 0 }}
                      dragElastic={0.2}
                      onDragEnd={(_, info) => {
                        const threshold = 50;
                        if (info.offset.x > threshold) setActiveContentIdx(prev => (prev - 1 + 3) % 3);
                        else if (info.offset.x < -threshold) setActiveContentIdx(prev => (prev + 1) % 3);
                      }}
                      className="flex w-full gap-2 cursor-grab active:cursor-grabbing no-drag-items"
                    >
                      {/* Left: Action Button (Slimmer) */}
                      <button 
                        onClick={() => handleAction(activeContentType)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          handleAction(activeContentType, true);
                        }}
                        className="w-[100px] h-[64px] bg-[#1a2133] border border-indigo-500/20 rounded-2xl flex flex-col items-center justify-center hover:bg-[#232d45] transition-all no-drag shadow-lg active:scale-95"
                      >
                        <div className="flex items-center gap-1 text-white font-black">
                          <span className="text-[13px] uppercase tracking-tighter">{contentInfoMap?.[activeContentType].label}</span>
                        </div>
                        <span className="text-[17px] font-black text-red-500 tracking-tighter leading-none mt-1.5">
                          -{selectedAccount?.membership ? config.costs.membership : config.costs.normal}
                        </span>
                      </button>

                      {/* Right: Integrated Status Board */}
                      <div className="flex-1 bg-[#151b2b] border border-white/5 rounded-2xl flex items-stretch shadow-lg overflow-hidden">
                        {/* Reward Section */}
                        <div className="flex-1 flex flex-col items-center justify-center p-1.5 border-r border-white/5">
                          <span className="text-[11px] font-black text-white uppercase tracking-tight mb-1">
                            {activeContentType === 'sanctuary' ? '입장 횟수' : '보상 횟수'}
                          </span>
                          <div className="flex items-baseline gap-1">
                            {editingTicketField === `${activeContentType}Basic` ? (
                              <input 
                                autoFocus
                                type="number"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={handleUpdateTicketValue}
                                onKeyDown={(e) => e.key === 'Enter' && handleUpdateTicketValue()}
                                className="w-10 bg-indigo-500/10 border-b border-indigo-400 text-center text-[16px] font-black text-indigo-400 outline-none appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                            ) : (
                              <span 
                                onClick={() => { setEditingTicketField(`${activeContentType}Basic`); setEditValue((contentInfoMap?.[activeContentType].rewards.basic || 0).toString()); }}
                                className={cn("text-[18px] font-black leading-none cursor-pointer hover:text-white transition-colors", (contentInfoMap?.[activeContentType].rewards.basic || 0) > 0 ? "text-indigo-400" : "text-slate-400")}
                              >
                                {contentInfoMap?.[activeContentType].rewards.basic}
                              </span>
                            )}
                            
                            <span className="text-[12px] font-bold text-slate-200">+</span>
                            
                            {editingTicketField === `${activeContentType}Extra` ? (
                              <input 
                                autoFocus
                                type="number"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={handleUpdateTicketValue}
                                onKeyDown={(e) => e.key === 'Enter' && handleUpdateTicketValue()}
                                className="w-10 bg-purple-500/10 border-b border-purple-400 text-center text-[14px] font-black text-purple-400 outline-none appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                            ) : (
                              <span 
                                onClick={() => { setEditingTicketField(`${activeContentType}Extra`); setEditValue((contentInfoMap?.[activeContentType].rewards.extra || 0).toString()); }}
                                className={cn("text-[16px] font-black leading-none cursor-pointer hover:text-white transition-colors", (contentInfoMap?.[activeContentType].rewards.extra || 0) > 0 ? "text-purple-400" : "text-slate-400")}
                              >
                                {contentInfoMap?.[activeContentType].rewards.extra}
                              </span>
                            )}
                          </div>
                        </div>
                        {/* Boss Section */}
                        <div className="flex-1 flex flex-col items-center justify-center p-1.5">
                          <span className="text-[11px] font-black text-white uppercase tracking-tight mb-1">
                            {activeContentType === 'sanctuary' ? '보상 횟수' : '보스 처치'}
                          </span>
                          <div className="flex items-baseline gap-1">
                            {editingTicketField === (activeContentType === 'expedition' ? 'expeditionKillsBasic' : activeContentType === 'transcendence' ? 'transcendenceKillsBasic' : 'sanctuaryKillsBasic') ? (
                              <input 
                                autoFocus
                                type="number"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={handleUpdateTicketValue}
                                onKeyDown={(e) => e.key === 'Enter' && handleUpdateTicketValue()}
                                className="w-10 bg-indigo-500/10 border-b border-indigo-400 text-center text-[16px] font-black text-indigo-400 outline-none appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                            ) : (
                              <span 
                                onClick={() => { 
                                  const field = activeContentType === 'expedition' ? 'expeditionKillsBasic' : activeContentType === 'transcendence' ? 'transcendenceKillsBasic' : 'sanctuaryKillsBasic';
                                  setEditingTicketField(field); 
                                  setEditValue((contentInfoMap?.[activeContentType].kills.basic || 0).toString()); 
                                }}
                                className={cn("text-[18px] font-black leading-none cursor-pointer hover:text-white transition-colors", (contentInfoMap?.[activeContentType].kills.basic || 0) > 0 ? "text-indigo-400" : "text-slate-400")}
                              >
                                {contentInfoMap?.[activeContentType].kills.basic}
                              </span>
                            )}
                            
                            <span className="text-[12px] font-bold text-slate-200">+</span>
                            
                            {editingTicketField === (activeContentType === 'expedition' ? 'expeditionKillsExtra' : activeContentType === 'transcendence' ? 'transcendenceKillsExtra' : 'sanctuaryKillsExtra') ? (
                              <input 
                                autoFocus
                                type="number"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={handleUpdateTicketValue}
                                onKeyDown={(e) => e.key === 'Enter' && handleUpdateTicketValue()}
                                className="w-10 bg-purple-500/10 border-b border-purple-400 text-center text-[14px] font-black text-purple-400 outline-none appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                            ) : (
                              <span 
                                onClick={() => { 
                                  const field = activeContentType === 'expedition' ? 'expeditionKillsExtra' : activeContentType === 'transcendence' ? 'transcendenceKillsExtra' : 'sanctuaryKillsExtra';
                                  setEditingTicketField(field); 
                                  setEditValue((contentInfoMap?.[activeContentType].kills.extra || 0).toString()); 
                                }}
                                className={cn("text-[16px] font-black leading-none cursor-pointer hover:text-white transition-colors", (contentInfoMap?.[activeContentType].kills.extra || 0) > 0 ? "text-purple-400" : "text-slate-400")}
                              >
                                {contentInfoMap?.[activeContentType].kills.extra}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* Swipe Navigation Dots */}
                <div className="flex justify-center gap-2 mt-2 pb-1">
                  {contentTypes.map((_, i) => (
                    <button 
                      key={i} 
                      onClick={() => setActiveContentIdx(i)}
                      className={cn(
                        "w-2 h-2 rounded-full transition-all duration-300 no-drag cursor-pointer", 
                        activeContentIdx === i 
                          ? "bg-indigo-500 w-5 shadow-[0_0_8px_rgba(99,102,241,0.6)]" 
                          : "bg-slate-700 hover:bg-slate-500"
                      )} 
                    />
                  ))}
                </div>
              </div>

              {!isCompact && (
                <button onClick={() => setIsExpanded(!isExpanded)} className="flex items-center justify-center gap-2 py-1.5 text-[11px] font-black text-indigo-300 hover:text-indigo-200 uppercase tracking-widest border-t border-white/5">
                  {isExpanded ? <><ChevronUp className="w-3.5 h-3.5" /> 접기</> : <><ChevronDown className="w-3.5 h-3.5" /> 상세 정보</>}
                </button>
              )}

              {isExpanded && selectedChar && (
                <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="flex flex-col gap-2 mb-2">
                    <div className="text-[9px] font-black text-indigo-300 uppercase tracking-widest px-1 text-left w-full">체크리스트 (클릭시 토글)</div>
                    <div className="grid grid-cols-1 gap-1">
                      {(() => {
                        const items = [
                          { id: 'mission', name: '사명', max: 5, current: Number(selectedAccount?.mission) || 0, order: 0 },
                          { id: 'corridor', name: '어비스 회랑', max: 6, current: Number(selectedChar.corridor) || 0, order: 1 },
                          { id: 'dailyDungeon', name: '일일던전', max: 1, current: Number(selectedAccount?.dailyDungeon) || 0, order: 2 },
                          { id: 'awakening', name: '각성', max: 3, current: Number(selectedChar.awakening) || 0, order: 3 },
                          { id: 'nightmare', name: '악몽', max: 14, current: Number(selectedChar.nightmare) || 0, order: 4 },
                        ];
                        
                        return items
                          .map(item => ({ ...item, done: item.current >= item.max }))
                          .sort((a, b) => {
                            if (a.done !== b.done) return a.done ? 1 : -1;
                            return a.order - b.order;
                          })
                          .map(item => (
                            <CheckRow 
                              key={item.id}
                              name={item.name}
                              done={item.done}
                              current={item.current}
                              max={item.max}
                              onClick={() => {
                                if (item.id === 'nightmare') {
                                  updateCharacterData({ [item.id]: Math.min(14, (item.current || 0) + 1) });
                                } else if (item.id === 'dailyDungeon' || item.id === 'mission') {
                                  updateAccountData({ [item.id]: item.current >= item.max ? 0 : item.current + 1 });
                                } else {
                                  updateCharacterData({ [item.id]: item.current >= item.max ? 0 : item.current + 1 });
                                }
                              }}
                            />
                          ));
                      })()}
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

        <div ref={sideRef} className="absolute top-0 left-[328px] w-[280px] bg-[#121826] border border-white/10 rounded-2xl shadow-2xl animate-in slide-in-from-left-4 duration-300 overflow-hidden">

          <div className="drag-region flex items-center justify-between px-4 h-[42px] bg-[#0b0f1a] border-b border-white/5">

            <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">설정</span>

            <button onClick={() => setView("hud")} className="no-drag p-2 text-slate-300 hover:text-white"><X className="w-3.5 h-3.5" /></button>

          </div>

          <div className="p-5 flex flex-col gap-5">

            <div className="flex flex-col gap-2.5">

              <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest flex items-center gap-1.5">

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

                      className="no-drag absolute top-1/2 right-1.5 -translate-y-1/2 p-1.5 text-slate-300 hover:text-white bg-transparent rounded hover:bg-white/10"

                      title="기본 브라우저 변경"

                    >

                      <Settings className="w-3 h-3" />

                    </button>

                  </div>

                </div>

              </div>

            </div>







            <div className="h-[1px] bg-white/5" />



            <div className="flex flex-col gap-4">

              <div className="flex flex-col gap-2">

                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
                      <Globe className="w-3 h-3 shrink-0" /> 지능형 노출 제어
                    </span>
                    <span className="pl-[18px] text-[8px] font-medium leading-snug text-slate-400">
                      아이온2 창 활성화 시만 HUD 표시
                    </span>
                  </div>
                  <button 
                    onClick={() => {
                      const next = !intelligentHide;
                      setIntelligentHide(next);
                      localStorage.setItem('aion_intelligent_hide', next.toString());
                    }}
                    className={cn("no-drag mt-0.5 w-8 h-4 rounded-full transition-colors relative shrink-0", intelligentHide ? "bg-indigo-500" : "bg-slate-700")}
                  >
                    <div className={cn("absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all", intelligentHide ? "left-[18px]" : "left-0.5")} />
                  </button>
                </div>

              </div>



              <div className="flex flex-col gap-2">

                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
                      <Scan className="w-3 h-3 shrink-0" /> 컴팩트 모드
                    </span>
                    <span className="pl-[18px] text-[8px] font-medium leading-snug text-slate-400">
                      HUD 배경 간소화 및 투명도 조절
                    </span>
                  </div>
                  <button 
                    onClick={() => {
                      const next = !isMinimal;
                      setIsMinimal(next);
                      localStorage.setItem('aion_is_minimal', next.toString());
                    }}
                    className={cn("no-drag mt-0.5 w-8 h-4 rounded-full transition-colors relative shrink-0", isMinimal ? "bg-indigo-500" : "bg-slate-700")}
                  >
                    <div className={cn("absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all", isMinimal ? "left-[18px]" : "left-0.5")} />
                  </button>
                </div>
                
                {isMinimal && (
                  <div className="mt-2 space-y-2 px-1 animate-in slide-in-from-top-2 duration-300">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1.5">
                        <Layers className="w-3 h-3 text-slate-300" />
                        <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">투명도</span>
                      </div>
                      <span className="text-[10px] font-mono text-indigo-400 font-bold">{opacity}%</span>
                    </div>
                    <input 
                      type="range" min="0" max="100" step="5"
                      value={opacity}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setOpacity(val);
                        // saveAllConfigs (useEffect)에 의해 1초 뒤 자동 저장됨
                      }}
                      className="no-drag w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
                      <Zap className="w-3 h-3 shrink-0" /> 간편 오드 충전
                    </span>
                    <span className="pl-[18px] text-[8px] font-medium leading-snug text-slate-400">
                      +15, +40 추가 오드 버튼 표시
                    </span>
                  </div>
                  <button 
                    onClick={() => {
                      const next = !simpleOdeCharge;
                      setSimpleOdeCharge(next);
                      localStorage.setItem('aion_simple_ode_charge', next.toString());
                    }}
                    className={cn("no-drag mt-0.5 w-8 h-4 rounded-full transition-colors relative shrink-0", simpleOdeCharge ? "bg-indigo-500" : "bg-slate-700")}
                  >
                    <div className={cn("absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all", simpleOdeCharge ? "left-[18px]" : "left-0.5")} />
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
                      <Ticket className="w-3 h-3 shrink-0" /> 티켓 유효성 체크
                    </span>
                    <span className="pl-[18px] text-[8px] font-medium leading-snug text-slate-400">
                      티켓/처치 가능 횟수 부족 시 오드 소모 불가
                    </span>
                  </div>
                  <button 
                    onClick={() => {
                      const next = !ticketValidation;
                      setTicketValidation(next);
                      localStorage.setItem('aion_ticket_validation', next.toString());
                    }}
                    className={cn("no-drag mt-0.5 w-8 h-4 rounded-full transition-colors relative shrink-0", ticketValidation ? "bg-indigo-500" : "bg-slate-700")}
                  >
                    <div className={cn("absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all", ticketValidation ? "left-[18px]" : "left-0.5")} />
                  </button>
                </div>
              </div>


              {/* --- [NEW] Hotkey Settings --- */}
              <div className="h-[1px] bg-white/5" />
              <div className="flex flex-col gap-3">
                <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
                  <Key className="w-3 h-3" /> 단축키 설정
                </span>
                
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between bg-black/30 p-2.5 rounded-xl border border-white/5">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-slate-300">HUD 표시/숨김</span>
                      <span className="text-[8px] text-slate-300 font-medium">전체 오버레이 토글</span>
                    </div>
                    <button 
                      onClick={() => setRecordingKey(recordingKey === 'toggleHud' ? null : 'toggleHud')}
                      onKeyDown={handleHotkeyRecord}
                      className={cn(
                        "no-drag px-3 py-1.5 rounded-lg text-[10px] font-mono transition-all border",
                        recordingKey === 'toggleHud' 
                          ? "bg-indigo-500/20 border-indigo-500 text-indigo-300 animate-pulse" 
                          : "bg-slate-800 border-white/10 text-slate-200 hover:text-white"
                      )}
                    >
                      {recordingKey === 'toggleHud' ? '입력 대기중...' : hotkeys.toggleHud}
                    </button>
                  </div>

                  <div className="flex items-center justify-between bg-black/30 p-2.5 rounded-xl border border-white/5">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-slate-300">압축 모드 토글</span>
                      <span className="text-[8px] text-slate-300 font-medium">HUD 사이즈 축소 토글</span>
                    </div>
                    <button 
                      onClick={() => setRecordingKey(recordingKey === 'toggleCompact' ? null : 'toggleCompact')}
                      onKeyDown={handleHotkeyRecord}
                      className={cn(
                        "no-drag px-3 py-1.5 rounded-lg text-[10px] font-mono transition-all border",
                        recordingKey === 'toggleCompact' 
                          ? "bg-indigo-500/20 border-indigo-500 text-indigo-300 animate-pulse" 
                          : "bg-slate-800 border-white/10 text-slate-200 hover:text-white"
                      )}
                    >
                      {recordingKey === 'toggleCompact' ? '입력 대기중...' : hotkeys.toggleCompact}
                    </button>
                  </div>

                  <div className="flex items-center justify-between bg-black/30 p-2.5 rounded-xl border border-white/5">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-slate-300">상세정보 펼치기/닫기</span>
                      <span className="text-[8px] text-slate-300 font-medium">하단 상세 정보 영역 토글</span>
                    </div>
                    <button 
                      onClick={() => setRecordingKey(recordingKey === 'toggleDetails' ? null : 'toggleDetails')}
                      onKeyDown={handleHotkeyRecord}
                      className={cn(
                        "no-drag px-3 py-1.5 rounded-lg text-[10px] font-mono transition-all border",
                        recordingKey === 'toggleDetails' 
                          ? "bg-indigo-500/20 border-indigo-500 text-indigo-300 animate-pulse" 
                          : "bg-slate-800 border-white/10 text-slate-200 hover:text-white"
                      )}
                    >
                      {recordingKey === 'toggleDetails' ? '입력 대기중...' : hotkeys.toggleDetails}
                    </button>
                  </div>

                  {hotkeyWarning && (
                    <div className="flex items-start gap-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg animate-in fade-in slide-in-from-top-1">
                      <AlertCircle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                      <span className="text-[8px] text-amber-200/80 leading-relaxed font-bold">{hotkeyWarning}</span>
                    </div>
                  )}
                  
                  <p className="text-[8px] text-slate-400 font-medium px-1 italic">
                    * 수식키(Shift, Ctrl, Alt)를 포함한 조합을 권장합니다.
                  </p>
                </div>
              </div>

            </div>



            

            <button onClick={() => setView("hud")} className="py-2.5 text-[10px] font-black text-slate-300 hover:text-indigo-400 uppercase tracking-widest border-t border-white/5 mt-2">닫기</button>

          </div>



          {/* 브라우저 선택 오버레이 */}

          {showBrowserSelect && (

            <div className="absolute inset-0 z-50 bg-[#121826]/95 backdrop-blur-sm flex flex-col p-5 animate-in fade-in">

              <div className="flex items-center justify-between mb-6">

                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">실행할 브라우저 선택</span>

                <button onClick={() => setShowBrowserSelect(false)} className="no-drag p-1 text-slate-300 hover:text-white"><X className="w-4 h-4" /></button>

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

                  <span className="text-[11px] font-bold text-slate-200 group-hover:text-white transition-colors">시스템 기본 브라우저</span>

                  {defaultBrowser === 'default' && <Check className="w-4 h-4 text-slate-300" />}

                </button>

              </div>

            </div>

          )}

          </div>

        )}



      {/* 압축 모드 토글 토스트 */}
      {compactToast.show && (
        <div className="fixed inset-x-0 top-1/2 -translate-y-1/2 flex justify-center z-[9999] pointer-events-none animate-in fade-in zoom-in duration-200">
          <div className="bg-indigo-600/90 text-white px-4 py-2 rounded-full text-xs font-black shadow-xl backdrop-blur-md border border-white/20">
            압축 모드: {compactToast.value ? "켜짐 (ON)" : "꺼짐 (OFF)"}
          </div>
        </div>
      )}

      {toast.show && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[9999] animate-in fade-in slide-in-from-top-4 duration-300 pointer-events-none">
          <div className={cn(
            "backdrop-blur-md px-5 py-2.5 rounded-2xl border shadow-2xl flex items-center gap-2.5",
            toast.type === 'error' ? "bg-red-500/90 border-red-400/50" : "bg-indigo-500/90 border-indigo-400/50"
          )}>
            {toast.type === 'error' ? <AlertCircle className="w-4 h-4 text-white" /> : <Info className="w-4 h-4 text-white" />}
            <span className="text-[11px] font-bold text-white tracking-tight">
              {toast.message}
            </span>
          </div>
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

        <span className={cn("text-[12px] font-black", isEmpty ? "text-slate-200" : "text-white")}>{label}</span>

        <div className="flex items-baseline gap-1">
          <span className={cn("text-xl font-black tracking-tighter leading-none shadow-sm", isEmpty ? "text-slate-400" : "text-white")}>{total}</span>
          <span className={cn("text-[10px] font-bold", isEmpty ? "text-slate-500" : "text-slate-100")}>장 남음</span>
        </div>

      </div>

      

      <div className="flex items-center gap-3 mt-2 z-10">

        <div className="flex items-center gap-1.5 bg-black/30 px-2 py-0.5 rounded">

          <div className={cn("w-1.5 h-1.5 rounded-full", base > 0 ? "bg-indigo-400 shadow-[0_0_4px_#818cf8]" : "bg-slate-700")} />

          <span className="text-[9px] font-bold text-slate-300">기본</span>

          <span className={cn("text-[10px] font-black", base > 0 ? "text-indigo-300" : "text-slate-300")}>{base || 0}</span>

          <span className="text-[8px] text-slate-300 font-bold ml-0.5">/ {max}</span>

        </div>

        

        {hasExtra && (

          <div className="flex items-center gap-1.5 bg-black/30 px-2 py-0.5 rounded">

            <div className={cn("w-1.5 h-1.5 rounded-full", extra > 0 ? "bg-amber-400 shadow-[0_0_4px_#fbbf24]" : "bg-slate-700")} />

            <span className="text-[9px] font-bold text-slate-300">충전</span>

            <span className={cn("text-[10px] font-black", extra > 0 ? "text-amber-300" : "text-slate-300")}>{extra || 0}</span>

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

          <Circle className="w-3.5 h-3.5 text-slate-400" fill="none" />

        )}

        <span className={cn("text-[11px] font-black transition-all", done ? "text-slate-300 line-through" : "text-slate-100")}>{name}</span>

      </div>

      <div className="flex items-baseline gap-1">

        <span className={cn("text-[11px] font-black italic transition-colors", done ? "text-slate-300" : "text-indigo-300")}>{current}</span>

        <span className="text-[9px] font-black text-slate-300">/ {max}</span>

      </div>

    </div>

  );

}

