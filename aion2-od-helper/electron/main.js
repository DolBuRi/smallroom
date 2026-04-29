const { app, BrowserWindow, ipcMain, screen, desktopCapturer } = require('electron');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
const path = require('path');
const https = require('https');
const fs = require('fs');

const { initializeApp } = require('firebase/app');
const { getAuth, signInAnonymously } = require('firebase/auth');
const { getDatabase, ref, get, set: dbSet, update, onValue, off } = require('firebase/database');

const firebaseConfig = {
    apiKey: "AIzaSyBQRLioN1Oza-IhmRWWDO27uuteVznSdwE",
    authDomain: "aion2-guild.firebaseapp.com",
    databaseURL: "https://aion2-guild-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "aion2-guild",
    storageBucket: "aion2-guild.firebasestorage.app",
    messagingSenderId: "1017743230130",
    appId: "1:1017743230130:web:a55df102eb0eef9775b5ab",
    measurementId: "G-HX4ZCCZTQB"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);
const auth = getAuth(firebaseApp);

signInAnonymously(auth)
  .then(() => console.log('Firebase Anonymous Auth Success'))
  .catch((err) => console.error('Firebase Auth Error:', err));

let hudWindow = null;
let configPath = '';
const activeListeners = new Map();

function getSettingsPath() {
  if (!configPath) configPath = path.join(app.getPath('userData'), 'window-state.json');
  return configPath;
}

function loadWindowState() {
  try {
    const p = getSettingsPath();
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) { }
  return null;
}

function saveWindowState() {
  if (!hudWindow) return;
  try {
    const bounds = hudWindow.getBounds();
    fs.writeFileSync(getSettingsPath(), JSON.stringify(bounds));
  } catch (e) { }
}

function createHUD() {
  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
  const savedState = loadWindowState();
  
  hudWindow = new BrowserWindow({
    width: 640,
    height: 1000,
    x: savedState?.x ?? (screenWidth - 650),
    y: savedState?.y ?? 50,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (!app.isPackaged) {
    hudWindow.loadURL('http://localhost:3000/hud');
  } else {
    hudWindow.loadFile(path.join(__dirname, '../.next/server/app/hud.html'));
  }

  hudWindow.on('move', saveWindowState);
  hudWindow.setAlwaysOnTop(true, 'screen-saver', 1);
  hudWindow.on('blur', () => {
    hudWindow.setAlwaysOnTop(true, 'screen-saver', 1);
  });

  let isSideOpen = false;
  let isHudLocked = false;
  ipcMain.on('view-state-change', (event, state) => {
    isSideOpen = state.view !== 'hud';
    isHudLocked = state.isLocked;
  });

  // [NEW] 메인 프로세스 전역 마우스 추적 (렌더러 지연 우회)
  setInterval(() => {
    if (!hudWindow || hudWindow.isDestroyed()) return;
    
    const mousePoint = screen.getCursorScreenPoint();
    const windowBounds = hudWindow.getBounds();
    
    const x = mousePoint.x - windowBounds.x;
    const y = mousePoint.y - windowBounds.y;

    // HUD 영역 감지
    const isOverHudArea = x >= 0 && x <= 312 && y >= 0 && y <= 900;
    let isClickableInHud = false;
    
    if (isOverHudArea) {
      if (isHudLocked) {
        // 잠금 상태면 상단 헤더(42px)만 클릭 가능
        isClickableInHud = y <= 42;
      } else {
        isClickableInHud = true;
      }
    }

    // 설정창 영역 (폭 280px, x좌표 316px부터 시작)
    const isOverSide = isSideOpen && x >= 316 && x <= 316 + 280 && y >= 0 && y <= 900;

    if (isClickableInHud || isOverSide) {
      hudWindow.setIgnoreMouseEvents(false);
    } else {
      hudWindow.setIgnoreMouseEvents(true, { forward: true });
    }
  }, 50); // 50ms 간격으로 매우 빠르게 체크
}

// --- IPC Handlers ---

// [FIX] 경로 유효성 검사 함수
function isValidFirebasePath(path) {
  if (!path || typeof path !== 'string') return false;
  // Firebase 금지 문자: . # $ [ ]
  return !/[.#$[\]]/.test(path);
}

ipcMain.on('subscribe-firebase-data', (event, dbPath) => {
  if (!isValidFirebasePath(dbPath)) {
    console.error('Invalid Firebase Path Blocked:', dbPath);
    return;
  }
  if (activeListeners.has(dbPath)) {
    get(ref(db, dbPath)).then(snapshot => {
      if (hudWindow) hudWindow.webContents.send('firebase-data-update', { path: dbPath, data: snapshot.val() });
    });
    return;
  }
  
  const dbRef = ref(db, dbPath);
  const unsubscribe = onValue(dbRef, (snapshot) => {
    if (hudWindow) {
      hudWindow.webContents.send('firebase-data-update', { path: dbPath, data: snapshot.val() });
    }
  }, (error) => {
    console.error(`Firebase Sub Error (${dbPath}):`, error);
  });

  activeListeners.set(dbPath, unsubscribe);
});

ipcMain.on('unsubscribe-firebase-data', (event, dbPath) => {
  const unsubscribe = activeListeners.get(dbPath);
  if (unsubscribe) {
    unsubscribe();
    activeListeners.delete(dbPath);
  }
});

ipcMain.handle('fetch-firebase-data', async (event, path) => {
  if (!isValidFirebasePath(path)) return { ok: false, error: 'Invalid Path' };
  try {
    const dbRef = ref(db, path);
    const snapshot = await get(dbRef);
    return { ok: true, data: snapshot.val() };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('set-firebase-data', async (event, path, data) => {
  if (!isValidFirebasePath(path)) return { ok: false, error: 'Invalid Path' };
  try {
    const dbRef = ref(db, path);
    await update(dbRef, data);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('capture-screen', async () => {
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: screen.getPrimaryDisplay().size });
    if (sources && sources.length > 0) return { ok: true, thumbnail: sources[0].thumbnail.toDataURL() };
    return { ok: false, error: 'No sources found' };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
  if (hudWindow) hudWindow.setIgnoreMouseEvents(ignore, options || {});
});

ipcMain.handle('close-window', () => {
  if (hudWindow) { saveWindowState(); hudWindow.close(); }
});

ipcMain.handle('get-server-time', async () => {
  return new Promise((resolve) => {
    const req = https.request({ hostname: 'www.google.com', port: 443, path: '/', method: 'HEAD', timeout: 2000 }, (res) => {
      const serverDate = res.headers.date;
      resolve({ ok: !!serverDate, time: serverDate ? new Date(serverDate).getTime() : Date.now() });
    });
    req.on('error', () => resolve({ ok: false, time: Date.now() }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, time: Date.now() }); });
    req.end();
  });
});

ipcMain.handle('open-external-url', async (event, url, browser) => {
  if (!url.startsWith('http://') && !url.startsWith('https://')) return { ok: false };
  
  const { exec } = require('child_process');
  let command = '';
  
  if (browser === 'chrome') command = `start chrome "${url}"`;
  else if (browser === 'edge') command = `start msedge "${url}"`;
  else if (browser === 'whale') command = `start whale "${url}"`;
  
  if (command) {
    exec(command, (error) => {
      if (error) {
        console.error('Failed to launch specific browser, falling back to default:', error);
        require('electron').shell.openExternal(url);
      }
    });
  } else {
    require('electron').shell.openExternal(url);
  }
  return { ok: true };
});

let ocrSelectionWindow = null;

ipcMain.handle('start-ocr-selection', () => {
  if (ocrSelectionWindow) return;
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  
  ocrSelectionWindow = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  ocrSelectionWindow.loadFile(path.join(__dirname, 'ocr-selection.html'));
  
  ocrSelectionWindow.on('closed', () => {
    ocrSelectionWindow = null;
  });
});

ipcMain.on('ocr-region-selected', (event, region) => {
  if (hudWindow) {
    hudWindow.webContents.send('ocr-region-set', region);
  }
  if (ocrSelectionWindow) {
    ocrSelectionWindow.close();
  }
});

ipcMain.on('ocr-selection-cancel', () => {
  if (ocrSelectionWindow) ocrSelectionWindow.close();
});

ipcMain.handle('get-desktop-sources', async () => {
  const sources = await desktopCapturer.getSources({ types: ['screen'] });
  return sources.map(s => ({ id: s.id, name: s.name }));
});

app.whenReady().then(createHUD);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
