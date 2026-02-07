
const fs = require('fs');
const path = 'c:/Users/admin/Documents/KHW_AI/AION2_Guild_Raid/app/src/components/raid-party-maker.tsx';

try {
    const content = fs.readFileSync(path, 'utf8');
    const lines = content.split('\n');

    // We want to keep from line 147 (index 146) to the end.
    // Line 147 should be 'use client';
    const startIdx = 146;

    if (!lines[startIdx].includes("'use client'")) {
        console.log("Warning: Line 147 does not start with 'use client'. Check formatting.");
        console.log("Line 147:", lines[startIdx]);
    }

    // Check if line 146 is empty or garbage
    // We just want to discard lines 0 to 145.

    const newLines = lines.slice(startIdx);

    fs.writeFileSync(path, newLines.join('\n'), 'utf8');
    console.log(`Restored file. Kept ${newLines.length} lines.`);

} catch (e) {
    console.error(e);
}
