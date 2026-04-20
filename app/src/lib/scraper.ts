export const SERVER_LIST = [
    { id: 'all', name: '전체 서버', faction: '전체' },
    
    // 천족 (Elyos)
    { id: '1001', name: '시엘', faction: '천족' },
    { id: '1002', name: '네자칸', faction: '천족' },
    { id: '1003', name: '바이젤', faction: '천족' },
    { id: '1004', name: '카이시넬', faction: '천족' },
    { id: '1005', name: '유스티엘', faction: '천족' },
    { id: '1006', name: '아리엘', faction: '천족' },
    { id: '1007', name: '프레기온', faction: '천족' },
    { id: '1008', name: '메스람타에다', faction: '천족' },
    { id: '1009', name: '히타니에', faction: '천족' },
    { id: '1010', name: '나니아', faction: '천족' },
    { id: '1011', name: '타하바타', faction: '천족' },
    { id: '1012', name: '루터스', faction: '천족' },
    { id: '1013', name: '페르노스', faction: '천족' },
    { id: '1014', name: '다미누', faction: '천족' },
    { id: '1015', name: '카사카', faction: '천족' },
    { id: '1016', name: '바카르마', faction: '천족' },
    { id: '1017', name: '챈가룽', faction: '천족' },
    { id: '1018', name: '코치룽', faction: '천족' },
    { id: '1019', name: '이슈타르', faction: '천족' },
    { id: '1020', name: '티아마트', faction: '천족' },
    { id: '1021', name: '포에타', faction: '천족' },

    // 마족 (Asmodian)
    { id: '2001', name: '이스라펠', faction: '마족' },
    { id: '2002', name: '지켈', faction: '마족' },
    { id: '2003', name: '트리니엘', faction: '마족' },
    { id: '2004', name: '루미엘', faction: '마족' },
    { id: '2005', name: '마르쿠탄', faction: '마족' },
    { id: '2006', name: '아스펠', faction: '마족' },
    { id: '2007', name: '에레슈키갈', faction: '마족' },
    { id: '2008', name: '브리트라', faction: '마족' },
    { id: '2009', name: '네먼', faction: '마족' },
    { id: '2010', name: '하달', faction: '마족' },
    { id: '2011', name: '루드라', faction: '마족' },
    { id: '2012', name: '울고른', faction: '마족' },
    { id: '2013', name: '무닌', faction: '마족' },
    { id: '2014', name: '오다르', faction: '마족' },
    { id: '2015', name: '젠카카', faction: '마족' },
    { id: '2016', name: '크로메데', faction: '마족' },
    { id: '2017', name: '콰이링', faction: '마족' },
    { id: '2018', name: '바바룽', faction: '마족' },
    { id: '2019', name: '파프니르', faction: '마족' },
    { id: '2020', name: '인드라투', faction: '마족' },
    { id: '2021', name: '이스할겐', faction: '마족' },
];

export const scrapeMember = async (name: string, serverId: string = '1006') => {
    try {
        const res = await fetch('/api/proxy/scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, serverId })
        });
        if (res.ok) {
            const data = await res.json();
            if (data.success) return data;
        }
    } catch (e) { }

    const serverName = SERVER_LIST.find(s => s.id === serverId)?.name || '아리엘';
    const faction = SERVER_LIST.find(s => s.id === serverId)?.faction;

    return new Promise<any>((resolve) => {
        const handleResponse = (event: MessageEvent) => {
            if (event.source !== window || event.data.type !== 'AONI_SEARCH_RESPONSE') return;
            window.removeEventListener('message', handleResponse);
            resolve(event.data);
        };
        window.addEventListener('message', handleResponse);
        setTimeout(() => {
            window.removeEventListener('message', handleResponse);
            resolve({ success: false, error: 'Timeout' });
        }, 20000);
        window.postMessage({ type: 'AONI_SEARCH_REQUEST', name, server: serverName, serverId, faction }, "*");
    });
};

/**
 * Standardized parser for Power and Item Level.
 * Handles:
 * 1. Commas in strings (e.g., "341,342")
 * 2. Combined raw values (e.g., 3687341342 where 3687 is IL and 341342 is Power)
 */
export const parsePowerAndItemLevel = (rawPower: any, rawItemLevel: any = 0) => {
    let p = parseInt(String(rawPower || 0).replace(/,/g, ''));
    let il = parseInt(String(rawItemLevel || 0).replace(/,/g, '')) || 0;

    // AION2 specific: If power is > 10M and il is missing, it's likely [IL(4)][Power(6?)]
    if (!il && p > 10000000) {
        const s = String(p);
        il = parseInt(s.substring(0, 4));
        p = parseInt(s.substring(4));
    }

    return { power: p, itemLevel: il };
};
