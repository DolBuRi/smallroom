'use client';

export default function Footer() {
  return (
    <footer className="py-12 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950 transition-colors duration-300">
      <div className="container-custom text-center">
        <div className="flex justify-center gap-6 mb-4">
          <a href="#" className="text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">사이트 소개</a>
          <a href="#" className="text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">이용약관</a>
          <a href="#" className="text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">개인정보처리방침</a>
        </div>
        <div className="text-[10px] text-slate-400 dark:text-slate-600 font-medium">
          <p className="mb-1">AION2 오드 도우미 — 팬메이드 툴, 아이온2 공식과 무관합니다.</p>
          <p>© 2026 AION2 OD Helper. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
