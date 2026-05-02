import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import RootClientWrapper from "../components/layout/RootClientWrapper";
import { Metadata } from "next";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "숙제 관리 도우미",
  description: "아이온2 길드 레이드 및 숙제 관리 유틸리티",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>
          <RootClientWrapper>
            {children}
          </RootClientWrapper>
        </Providers>
      </body>
    </html>
  );
}
