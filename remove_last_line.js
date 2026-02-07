
const fs = require('fs');
const path = 'c:/Users/admin/Documents/KHW_AI/AION2_Guild_Raid/app/src/components/raid-party-maker.tsx';

try {
    const content = fs.readFileSync(path, 'utf8');
    let lines = content.split('\n');

    // Remove empty lines at end
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
        lines.pop();
    }

    // Check if the last line is just '}'
    if (lines.length > 0 && lines[lines.length - 1].trim() === '}') {
        console.log("Found trailing '}'. Removing it.");
        lines.pop();
    } else {
        console.log("Last line is not '}'. It is:", lines[lines.length - 1]);
    }

    fs.writeFileSync(path, lines.join('\n'), 'utf8');
    console.log(`Updated file. New line count: ${lines.length}`);

} catch (e) {
    console.error(e);
}
