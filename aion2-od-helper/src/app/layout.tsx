"use client"

import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import ClientLayout from "../components/layout/ClientLayout";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const inter = Inter({ subsets: ["latin"] });

import AccessGate from "../components/common/AccessGate";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const isHud = pathname?.startsWith('/hud');
  
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
    <html lang="ko" className={isHud ? "hud-mode" : ""} suppressHydrationWarning>
      <head>
        <title>숙제 관리 도우미</title>
        <style>{`
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
            html, body {
              background: transparent !important;
              background-color: transparent !important;
              margin: 0 !important;
              padding: 0 !important;
              overflow: hidden !important;
              border: none !important;
              outline: none !important;
              box-shadow: none !important;
            }
            :root {
              background: transparent !important;
            }
          ` : `
            html, body {
              margin: 0;
              padding: 0;
              min-height: 100vh;
            }
          `}
        `}</style>
      </head>
      <body className={`${inter.className} ${isHud ? 'bg-transparent overflow-hidden' : 'bg-slate-50 dark:bg-slate-950 overflow-auto transition-colors duration-300'} min-h-screen flex flex-col`}>
        <Providers>
          <AccessGate>
            <ClientLayout>{children}</ClientLayout>
          </AccessGate>
        </Providers>
      </body>
    </html>
  );
}
