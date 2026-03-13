const fetch = require('node-fetch');

async function test() {
    const res = await fetch('http://localhost:4000/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: '부트띠', serverId: '1006' })
    });
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
}

test();
