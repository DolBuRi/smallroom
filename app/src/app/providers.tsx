'use client';

import { AuthProvider } from '@/context/AuthContext';
import { ModeProvider } from '@/context/ModeContext';

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <ModeProvider>
            <AuthProvider>{children}</AuthProvider>
        </ModeProvider>
    );
}
