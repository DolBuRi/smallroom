'use client';

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import AccessGate from "../common/AccessGate";
import ClientLayout from "./ClientLayout";
import { cn } from "@/lib/utils";

export default function RootClientWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHud = pathname?.includes('/hud');

  useEffect(() => {
    // Aggressive cleaner for Dev Indicators
    const cleaner = setInterval(() => {
      const selectors = [
        '#next-dev-indicator',
        '.__next-dev-indicator',
        'nextjs-portal',
        '[data-nextjs-toast]',
        '[data-nextjs-dialog]',
        '[data-nextjs-portal]'
      ];
      selectors.forEach(s => {
        document.querySelectorAll(s).forEach(el => el.remove());
      });
    }, 500);
    return () => clearInterval(cleaner);
  }, []);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        #next-dev-indicator, 
        .__next-dev-indicator,
        nextjs-portal,
        [data-nextjs-toast], 
        [data-nextjs-dialog], 
        [data-nextjs-portal] { 
          display: none !important; 
          visibility: hidden !important;
        }
        
        ${isHud ? `
          * {
            -webkit-user-select: none;
            -webkit-user-drag: none;
          }
          
          .navbar-flat, nav, footer, #next-dev-indicator {
            display: none !important;
            visibility: hidden !important;
            height: 0 !important;
            overflow: hidden !important;
            pointer-events: none !important;
          }

          html, body {
            background: transparent !important;
            background-color: transparent !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: hidden !important;
          }
        ` : `
          html, body {
            margin: 0;
            padding: 0;
            min-height: 100vh;
          }
        `}
      `}} />
      <div className={cn(
        "min-h-screen flex flex-col transition-colors duration-300",
        isHud ? "bg-transparent overflow-hidden" : "bg-slate-50 dark:bg-slate-950 overflow-auto"
      )}>
        <AccessGate>
          <ClientLayout>{children}</ClientLayout>
        </AccessGate>
      </div>
    </>
  );
}
