const { app, BrowserWindow, ipcMain, screen, desktopCapturer, protocol, globalShortcut } = require('electron');
app.disableHardwareAcceleration(); 
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-gpu'); 
app.commandLine.appendSwitch('disable-software-rasterizer');
const path = require('path');
const https = require('https');
const fs = require('fs');
const http = require('http'); // HTTP 서버 모듈 추가

app.name = 'aion2-od-helper';
app.on('ready', () => {
  console.log('[Main] UserData Path:', app.getPath('userData'));
});

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
  .then(() => {
    console.log('Firebase Anonymous Auth Success');
    isAuthReady = true;
    // 대기 중인 구독 요청 처리
    if (pendingSubscriptions.length > 0) {
      console.log(`[Main] Processing ${pendingSubscriptions.length} pending subscriptions...`);
      pendingSubscriptions.forEach(path => doSubscribe(path));
      pendingSubscriptions = [];
    }
  })
  .catch((err) => console.error('Firebase Auth Error:', err));

let hudWindow = null;
let configPath = '';
const activeListeners = new Map();
let isAuthReady = false;
let pendingSubscriptions = [];

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
      webSecurity: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (!app.isPackaged) {
    hudWindow.loadURL('http://localhost:3000/hud');
  } else {
    // 내장 웹 서버를 통해 로드 (가장 확실한 해결책)
    const server = http.createServer((req, res) => {
      let filePath = path.join(app.getAppPath(), 'out', req.url === '/' ? 'index.html' : req.url);
      
      // trailingSlash 대응: 폴더 경로면 index.html 찾기
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end(JSON.stringify(err));
          return;
        }
        
        // 간단한 Content-Type 설정
        const ext = path.extname(filePath);
        const mimeTypes = {
          '.html': 'text/html',
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.json': 'application/json',
          '.png': 'image/png',
          '.jpg': 'image/jpg',
          '.svg': 'image/svg+xml'
        };
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        res.end(data);
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      hudWindow.loadURL(`http://127.0.0.1:${port}/hud/`);
    });
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
}

// --- IPC Handlers ---

// [FIX] 경로 유효성 검사 함수
function isValidFirebasePath(path) {
  if (!path || typeof path !== 'string') return false;
  const isInvalid = /[.#$[\]]/.test(path);
  if (isInvalid) console.warn(`[Main] Invalid Firebase path detected: ${path}`);
  return !isInvalid;
}

function doSubscribe(dbPath) {
  if (activeListeners.has(dbPath)) {
    get(ref(db, dbPath)).then(snapshot => {
      if (hudWindow) hudWindow.webContents.send('firebase-data-update', { path: dbPath, data: snapshot.val() });
    });
    return;
  }
  
  const dbRef = ref(db, dbPath);
  console.log(`[Main] Subscribing to: ${dbPath}`);
  const unsubscribe = onValue(dbRef, (snapshot) => {
    if (hudWindow) {
      hudWindow.webContents.send('firebase-data-update', { path: dbPath, data: snapshot.val() });
    }
  }, (error) => {
    console.error(`Firebase Sub Error (${dbPath}):`, error.message);
    if (error.message.includes('PERMISSION_DENIED')) {
      activeListeners.delete(dbPath);
    }
  });

  activeListeners.set(dbPath, unsubscribe);
}

ipcMain.on('subscribe-firebase-data', (event, dbPath) => {
  if (!isValidFirebasePath(dbPath)) {
    console.error('Invalid Firebase Path Blocked:', dbPath);
    return;
  }
  
  if (!isAuthReady) {
    console.log(`[Main] Auth not ready, queuing: ${dbPath}`);
    if (!pendingSubscriptions.includes(dbPath)) pendingSubscriptions.push(dbPath);
    return;
  }
  
  doSubscribe(dbPath);
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

ipcMain.on('resize-window', (event, width, height) => {
  if (hudWindow) {
    hudWindow.setSize(width, height);
    // 중앙 정렬이 필요하다면 추가할 수 있으나 보통은 크기만 조절함
  }
});

ipcMain.handle('close-window', () => {
  if (hudWindow) { saveWindowState(); hudWindow.close(); }
});

ipcMain.on('log-from-renderer', (event, level, ...args) => {
  const prefix = `[Renderer-${level.toUpperCase()}]`;
  if (level === 'error') console.error(prefix, ...args);
  else if (level === 'warn') console.warn(prefix, ...args);
  else console.log(prefix, ...args);
});

// [NEW] 설정 파일 저장/불러오기 (localStorage 대체용)
function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

ipcMain.handle('load-config', async () => {
  try {
    const p = getConfigPath();
    console.log(`[Main] Loading config from: ${p}`);
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      console.log(`[Main] Config loaded successfully (syncKey: ${data.syncKey ? 'YES' : 'NO'})`);
      return { ok: true, data };
    }
    console.log(`[Main] Config file not found, returning empty`);
    return { ok: true, data: {} };
  } catch (e) { 
    console.error(`[Main] Config load error: ${e.message}`);
    return { ok: false, error: e.message }; 
  }
});

ipcMain.handle('save-config', async (event, config) => {
  try {
    const p = getConfigPath();
    console.log(`[Main] Saving config to: ${p}`);
    fs.writeFileSync(p, JSON.stringify(config, null, 2));
    console.log(`[Main] Config saved successfully (syncKey: ${config.syncKey ? 'YES' : 'NO'})`);
    return { ok: true };
  } catch (e) { 
    console.error(`[Main] Config save error: ${e.message}`);
    return { ok: false, error: e.message }; 
  }
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

// [NEW] 단축키 등록 관리 함수
function registerAppShortcuts(shortcuts) {
  // 기존 단축키 모두 해제
  globalShortcut.unregisterAll();
  
  const { 
    toggleHud = 'Shift+`', 
    toggleCompact = 'Shift+1',
    toggleDetails = 'Shift+2'
  } = shortcuts || {};

  // 1. HUD 토글
  try {
    const success = globalShortcut.register(toggleHud, () => {
      if (!hudWindow || hudWindow.isDestroyed()) return;
      if (hudWindow.isVisible()) {
        hudWindow.hide();
      } else {
        hudWindow.show();
        hudWindow.setAlwaysOnTop(true, 'screen-saver', 1);
      }
    });
    console.log(`[Hotkey] Toggle HUD (${toggleHud}) registration: ${success ? 'SUCCESS' : 'FAILED'}`);
  } catch (e) {
    console.error(`[Hotkey] Error registering toggleHud: ${e.message}`);
  }

  // 2. 압축 모드 토글
  try {
    const success = globalShortcut.register(toggleCompact, () => {
      if (!hudWindow || hudWindow.isDestroyed()) return;
      hudWindow.webContents.send('toggle-compact-mode');
    });
    console.log(`[Hotkey] Toggle Compact (${toggleCompact}) registration: ${success ? 'SUCCESS' : 'FAILED'}`);
  } catch (e) {
    console.error(`[Hotkey] Error registering toggleCompact: ${e.message}`);
  }

  // 3. 상세 정보 토글
  try {
    const success = globalShortcut.register(toggleDetails, () => {
      if (!hudWindow || hudWindow.isDestroyed()) return;
      hudWindow.webContents.send('toggle-details-view');
    });
    console.log(`[Hotkey] Toggle Details (${toggleDetails}) registration: ${success ? 'SUCCESS' : 'FAILED'}`);
  } catch (e) {
    console.error(`[Hotkey] Error registering toggleDetails: ${e.message}`);
  }
}

ipcMain.handle('update-hotkeys', async (event, shortcuts) => {
  registerAppShortcuts(shortcuts);
  return { ok: true };
});

app.whenReady().then(async () => {
  createHUD();
  
  // 창이 로드된 후 단축키 재등록 (동기화 보장)
  hudWindow.webContents.on('did-finish-load', () => {
    try {
      const p = getConfigPath();
      if (fs.existsSync(p)) {
        const config = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (config.hotkeys) {
          registerAppShortcuts(config.hotkeys);
          return;
        }
      }
    } catch (e) {}
    registerAppShortcuts();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
