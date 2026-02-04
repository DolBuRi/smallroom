import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { nickname } = body;

        console.log(`[TestAPI] Searching for: ${nickname} via Local Scraper`);

        // 전략 2: 로컬 Puppeteer Scraper (Port 4000)을 경유
        const response = await fetch('http://localhost:4000/scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nickname })
        });

        if (!response.ok) {
            return NextResponse.json({
                success: false,
                error: `Scraper Server Error: ${response.status}`,
                details: await response.text()
            });
        }

        const data = await response.json();
        console.log('[TestAPI] Result from Scraper:', data);

        return NextResponse.json(data);

    } catch (error) {
        console.error('[TestAPI] Error:', error);
        return NextResponse.json({ success: false, error: String(error) });
    }
}
