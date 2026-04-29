'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const ACCESS_KEY = 'aion2_access_granted';

// 매핑 테이블: 입력값 -> 보여줄 글자
const KEY_MAP: Record<string, string> = {
  '작': '작', 'wkr': '작',
  '은': '은', 'dms': '은',
  '방': '방', 'qkd': '방', 'qk': '방',
};

const TARGET_SEQUENCE = ['작', '은', '방'];

export default function AccessGate({ children }: { children: React.ReactNode }) {
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [typedChars, setTypedChars] = useState<string[]>([]);
  const [isCompleted, setIsCompleted] = useState(false);
  const inputBuffer = useRef('');

  useEffect(() => {
    // 툴(Electron) 환경에서는 자동으로 승인
    const isElectron = typeof window !== 'undefined' && 
      (window.navigator.userAgent.includes('Electron') || (window as any).isElectron);
    
    if (isElectron) {
      setIsAuthorized(true);
      return;
    }

    const granted = localStorage.getItem(ACCESS_KEY);
    setIsAuthorized(granted === 'true');
  }, []);

  // 타이핑 감지 로직
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key.length > 1 && key !== 'backspace') return;

      inputBuffer.current += key;

      // 관리자 리셋 커맨드 (이미 승인된 상태에서도 작동)
      if (inputBuffer.current.endsWith('test') || inputBuffer.current.endsWith('xptmxm')) {
        localStorage.removeItem(ACCESS_KEY);
        setIsAuthorized(false);
        setCurrentStep(0);
        setTypedChars([]);
        setIsCompleted(false);
        inputBuffer.current = '';
        return;
      }

      if (isAuthorized !== false || isCompleted) return;

      const expectedChar = TARGET_SEQUENCE[currentStep];
      
      let matched = false;
      for (const [input, char] of Object.entries(KEY_MAP)) {
        if (char === expectedChar && inputBuffer.current.endsWith(input.toLowerCase())) {
          setTypedChars(prev => [...prev, char]);
          setCurrentStep(prev => prev + 1);
          inputBuffer.current = ''; 
          matched = true;
          
          if (currentStep === TARGET_SEQUENCE.length - 1) {
            setIsCompleted(true);
          }
          break;
        }
      }

      if (!matched && inputBuffer.current.length > 10) {
        inputBuffer.current = inputBuffer.current.slice(-5);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAuthorized, currentStep, isCompleted]);

  const handleAuthorize = () => {
    localStorage.setItem(ACCESS_KEY, 'true');
    setIsAuthorized(true);
  };

  if (isAuthorized === null) return null;
  if (isAuthorized) return <>{children}</>;

  return (
    <div className="fixed inset-0 z-[9999] bg-[#0a0a0a] flex items-center justify-center p-6 select-none overflow-hidden font-serif">
      {/* 에러 페이지 위장 레이어 */}
      <motion.div 
        animate={{ 
          opacity: isCompleted ? 0.1 : 1, 
          scale: isCompleted ? 0.95 : 1,
          filter: isCompleted ? 'blur(8px)' : 'blur(0px)'
        }}
        transition={{ duration: 0.8 }}
        className="max-w-md w-full text-center space-y-6 z-10"
      >
        <div className="space-y-2">
          <h1 className="text-7xl font-light text-neutral-200 tracking-tighter">503</h1>
          <h2 className="text-2xl font-medium text-neutral-400">Service Unavailable</h2>
          <p className="text-neutral-500 text-xs leading-relaxed max-w-[320px] mx-auto opacity-80">
            The requested resource is currently unavailable. The server is undergoing scheduled maintenance or is overloaded.
          </p>
        </div>
        
        <div className="pt-8 border-t border-neutral-800/50 max-w-[200px] mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-900/50 text-[10px] text-neutral-500 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-neutral-600 animate-pulse" />
            ERR_CONNECTION_REFUSED
          </div>
        </div>
      </motion.div>

      {/* 타이핑 애니메이션 레이어 */}
      <div className="absolute inset-0 flex flex-col items-center justify-center z-20 pointer-events-none">
        <div className="flex items-center justify-center gap-6 h-32">
          <AnimatePresence mode="popLayout">
            {typedChars.map((char, index) => (
              <motion.span
                key={index}
                initial={{ opacity: 0, x: 40, filter: 'blur(12px)' }}
                animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                transition={{ 
                  type: 'spring', 
                  stiffness: 120, 
                  damping: 18,
                  delay: 0.05
                }}
                className="text-white text-7xl md:text-8xl font-light tracking-widest drop-shadow-[0_0_20px_rgba(255,255,255,0.3)]"
                style={{ fontFamily: "'Noto Serif KR', serif" }}
              >
                {char}
              </motion.span>
            ))}
          </AnimatePresence>
        </div>

        {/* 접속 버튼 (완성 시 등장) */}
        <AnimatePresence>
          {isCompleted && (
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
              className="mt-16 pointer-events-auto flex flex-col items-center gap-4"
            >
              <button
                onClick={handleAuthorize}
                className="group relative px-16 py-4 overflow-hidden rounded-sm bg-white text-black text-[13px] font-bold tracking-[0.4em] transition-all hover:scale-105 active:scale-95 shadow-[0_20px_50px_rgba(255,255,255,0.15)]"
              >
                <span className="relative z-10">ENTER ROOM</span>
                <div className="absolute inset-0 bg-neutral-200 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
              </button>
              <div className="h-[1px] w-12 bg-neutral-800 my-2" />
              <p className="text-neutral-500 text-[9px] tracking-[0.6em] uppercase opacity-50">
                Authorized access only
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@200;400;700&display=swap');
        body {
          background-color: #0a0a0a !important;
        }
      `}</style>
    </div>
  );
}


