'use client';

import React, { createContext, useContext, ReactNode, useMemo } from 'react';
import { usePathname } from 'next/navigation';

export type AppMode = 'legion' | 'fixed';

interface ModeContextType {
    mode: AppMode;
    dbPath: {
        members: string;
        raidApplications: string;
        raidMatchingSession: string;
        raidMatchedForces: string;
        raidUnassignedMembers: string;
        fixedGroups: string;
        algoSettings: string;
        raidAttendance: string;
        lastFullRefresh: string;
        subCharsLastRefresh: string;
        settings: string;
        statistics: string;
        presence: string;
        subCharacters: string;
    };
}

const ModeContext = createContext<ModeContextType | undefined>(undefined);

export function ModeProvider({ children, forcedMode }: { children: ReactNode, forcedMode?: AppMode }) {
    const pathname = usePathname();
    
    // Determine mode based on URL if not forced
    const mode: AppMode = useMemo(() => {
        if (forcedMode) return forcedMode;
        if (pathname === '/fixed-party' || pathname.startsWith('/fixed-party/')) return 'fixed';
        return 'legion';
    }, [pathname, forcedMode]);

    const value = useMemo(() => {
        const prefix = mode === 'fixed' ? 'fixed_' : '';
        return {
            mode,
            dbPath: {
                members: `${prefix}members`,
                raidApplications: `${prefix}raid_applications`,
                raidMatchingSession: `${prefix}raid_matching_session`,
                raidMatchedForces: `${prefix}raid_matched_forces`,
                raidUnassignedMembers: `${prefix}raid_unassigned_members`,
                fixedGroups: `${prefix}raid_fixed_groups`,
                algoSettings: `${prefix}raid_algo_settings`,
                raidAttendance: `${prefix}raid_attendance_settings`,
                lastFullRefresh: mode === 'fixed' ? 'metadata/fixed_members_lastRefresh' : 'metadata/lastFullRefresh',
                subCharsLastRefresh: mode === 'fixed' ? 'metadata/fixed_subChars_lastRefresh' : 'metadata/subChars_lastRefresh',
                settings: `settings/${mode}`,
                statistics: `${prefix}statistics`,
                presence: `${prefix}presence`,
                subCharacters: `${prefix}sub_characters`
            }
        };
    }, [mode]);

    return (
        <ModeContext.Provider value={value}>
            {children}
        </ModeContext.Provider>
    );
}

export function useAppMode() {
    const context = useContext(ModeContext);
    if (context === undefined) {
        throw new Error('useAppMode must be used within a ModeProvider');
    }
    return context;
}
