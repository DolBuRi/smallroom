import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Toaster } from "sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL('http://localhost:3000'),
  title: "AION2 Guild Manager",
  description: "아리엘 서버 츄 레기온 성역 파티 관리 매니저",
  openGraph: {
    title: "AION2 Guild Manager",
    description: "아리엘 서버 츄 레기온 성역 파티 관리 매니저",
    images: ['/og.jpg'],
  },
  twitter: {
    card: 'summary_large_image',
    title: "AION2 Guild Manager",
    description: "아리엘 서버 츄 레기온 성역 파티 관리 매니저",
    images: ['/og.jpg'],
  },
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-50 dark:bg-slate-950 transition-colors duration-300`}
        suppressHydrationWarning
      >
        <Providers>
          {children}
          <Toaster position="top-center" richColors />
        </Providers>
      </body>
    </html>
  );
}
