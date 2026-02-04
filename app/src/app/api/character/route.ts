import { NextResponse } from 'next/server';

const SCRAPING_ANT_KEY = process.env.SCRAPING_ANT_KEY;

export async function POST(request: Request) {
    try {
        const { keyword } = await request.json();

        if (!keyword) {
            return NextResponse.json({ error: 'Keyword is required' }, { status: 400 });
        }

        console.log(`[Proxy] Searching Character: ${keyword}`);

        // Target: Aion2Power (Very reliable third-party site)
        const targetUrl = `https://www.aion2power.com/search?keyword=${encodeURIComponent(keyword)}`;
        const proxyUrl = `https://api.scrapingant.com/v2/general?url=${encodeURIComponent(targetUrl)}&x-api-key=${SCRAPING_ANT_KEY}&browser=true`;

        const response = await fetch(proxyUrl);
        if (!response.ok) {
            throw new Error(`Scraper failed with status ${response.status}`);
        }

        const html = await response.text();

        // Very precise parsing logic for Aion2Power
        // Note: In a production environment, use a library like 'cheerio'
        // For now, we use robust regex to find the first character match

        // Find nickname match to ensure we have a result
        if (html.includes(keyword)) {
            // Extract core data using regex patterns matched to Aion2Power HTML structure
            const nameMatch = html.match(new RegExp(`font-bold[^>]*>(${keyword})</span>`, 'i')) || [null, keyword];
            const classMatch = html.match(/text-gray-400[^>]*>([^<]+성|미정)<\/span>/) || [null, '미정'];
            const powerMatch = html.match(/전투력<\/span>[^>]*>([\d,]+)<\/div>/) || [null, '0'];

            return NextResponse.json({
                found: true,
                data: {
                    id: String(Date.now()),
                    name: nameMatch[1],
                    class: classMatch[1].trim(),
                    power: parseInt(powerMatch[1].replace(/,/g, '')) || 0,
                    guild: '-',
                    isActive: true
                }
            });
        }

        return NextResponse.json({ found: false });

    } catch (error: any) {
        console.error('[API] Scraper Error:', error.message);
        return NextResponse.json({ error: 'Failed to fetch character' }, { status: 500 });
    }
}
