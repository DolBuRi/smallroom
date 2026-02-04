const SCRAPING_ANT_KEY = '834767bf3696449abd78f88fbde4366b';

async function research() {
    const target = 'https://aion2.plaync.com/ko-kr/characters/rank';
    const proxyUrl = `https://api.scrapingant.com/v2/general?url=${encodeURIComponent(target)}&x-api-key=${SCRAPING_ANT_KEY}&browser=true`;

    console.log('Fetching official rank page...');
    const response = await fetch(proxyUrl);
    const html = await response.text();

    // Find script tags
    const scriptMatches = html.match(/<script[^>]*src=\"([^\"]+)\"/g) || [];
    console.log(`Found ${scriptMatches.length} script tags.`);

    const scripts = scriptMatches.map(m => m.match(/src=\"([^\"]+)\"/)[1]);
    for (const script of scripts) {
        if (script.includes('chunk') || script.includes('main') || script.includes('app')) {
            console.log(`Analyzing script: ${script}`);
            // In a real scenario, we'd fetch and search for API endpoints here
        }
    }

    // Manual check for common NCSoft API patterns in HTML
    const apiPatterns = html.match(/https?:\/\/[^\s\"']*(?:api|search)[^\s\"']*/gi) || [];
    console.log('API Patterns found:', apiPatterns);
}

research();
