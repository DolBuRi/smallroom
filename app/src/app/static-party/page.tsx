'use client';

import DashboardLayout from '@/components/dashboard-layout';
import { ModeProvider } from '@/context/ModeContext';

export default function StaticPartyPage() {
  return (
    <ModeProvider forcedMode="fixed">
      <DashboardLayout />
    </ModeProvider>
  );
}
