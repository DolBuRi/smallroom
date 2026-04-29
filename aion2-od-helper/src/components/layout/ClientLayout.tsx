"use client"

import { usePathname } from "next/navigation";
import Navbar from "./Navbar";
import Footer from "./Footer";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHud = pathname === '/hud';

  if (isHud) {
    return (
      <main className="flex-1 flex flex-col h-screen overflow-hidden bg-transparent">
        {children}
      </main>
    );
  }

  return (
    <>
      <Navbar />
      <main className="flex-1">
        {children}
      </main>
      <Footer />
    </>
  );
}
