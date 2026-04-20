
const { initializeApp } = require("firebase/app");
const { getDatabase, ref, get } = require("firebase/database");

const firebaseConfig = {
    databaseURL: "https://aion2-guild-default-rtdb.asia-southeast1.firebasedatabase.app"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

async function checkAether() {
    try {
        const snapshot = await get(ref(db, "aion2/sub_characters"));
        const chars = snapshot.val();
        
        console.log("--- Aether Energy Status ---");
        if (!chars) {
            console.log("No characters found.");
        } else {
            for (const [id, c] of Object.entries(chars)) {
                console.log(`[${id}] ${c.name}: Energy=${c.aetherEnergy}, LastUpdated=${c.aetherEnergyLastUpdated}`);
            }
        }
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

checkAether();
