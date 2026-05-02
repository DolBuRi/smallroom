'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Menu, X, Bird, Moon, Sun } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';

const navItems = [
  { name: '대시보드', href: '/dashboard' },
  { name: '계정 관리', href: '/accounts' },
  { name: '캐릭터 관리', href: '/characters' },
  { name: '앱 다운로드', href: 'https://github.com/DolBuRi/smallroom/releases/tag/v0.2.0', isExternal: true },
];

export default function Navbar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const handleExternalClick = (e: React.MouseEvent, name: string, href: string) => {
    if (name === '앱 다운로드') {
      e.preventDefault();
      window.open(href, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <nav className="navbar-flat sticky top-0 z-50">
      <div className="container-custom">
        <div className="flex justify-between items-center h-14">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-6 h-6 flex items-center justify-center">
              <span className="text-xl">🐣</span>
            </div>
            <span className="text-sm font-bold text-slate-800 dark:text-slate-200 tracking-tight">숙제 관리 도우미</span>
          </Link>
          
          {/* Desktop Navigation - Right Aligned */}
          <div className="hidden md:flex items-center gap-2">
            {navItems.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                onClick={(e) => item.isExternal && handleExternalClick(e, item.name, item.href)}
                className={cn(
                  "px-4 py-2 text-[13px] font-semibold transition-all relative",
                  pathname === item.href
                    ? "text-slate-900 dark:text-white after:content-[''] after:absolute after:bottom-0 after:left-4 after:right-4 after:h-[2px] after:bg-slate-900 dark:after:bg-white"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                {item.name}
              </Link>
            ))}

            <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-800 mx-2" />

            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
              aria-label="Toggle Theme"
            >
              {mounted && (theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />)}
            </button>
          </div>

          {/* Mobile Toggle */}
          <div className="md:hidden">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="p-2 text-slate-600 hover:text-slate-900"
            >
              {isOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="md:hidden bg-white border-b border-slate-100 py-2">
          {navItems.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              onClick={(e) => {
                if (item.isExternal) {
                  handleExternalClick(e, item.name, item.href);
                } else {
                  setIsOpen(false);
                }
              }}
              className={cn(
                "block px-6 py-3 text-sm font-semibold",
                pathname === item.href ? "text-indigo-600 bg-indigo-50" : "text-slate-600"
              )}
            >
              {item.name}
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
