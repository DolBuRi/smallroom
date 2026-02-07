
const fs = require('fs');
const path = 'c:/Users/admin/Documents/KHW_AI/AION2_Guild_Raid/app/src/components/raid-party-maker.tsx';

try {
    const content = fs.readFileSync(path, 'utf8');
    const lines = content.split('\n');

    const startIdx = 146;

    console.log("Searching for 'Tooltip State'...");
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("Tooltip State")) {
            console.log(`Found at line ${i + 1}: ${lines[i]}`);
        }
    }

    // Also check for "Algo Handlers"
    console.log("Searching for 'Algo Handlers'...");
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("Algo Handlers")) {
            console.log(`Found at line ${i + 1}: ${lines[i]}`);
        }
    }

} catch (e) {
    console.error(e);
}
