// guess whos back, back again

const fs       = require('fs');
const http     = require('http');
const https    = require('https');
const WebSocket = require('ws');
const util     = require('util');
const constants = require('crypto').constants;
const crypto   = require('crypto');
const path     = require('path');
const url      = require('url');
const querystring = require('querystring');

// toggle logging here
const consoleLoggingEnabled = true;
const fileLoggingEnabled    = false;

// you can set file name here if you want for the file log
const logStream = fileLoggingEnabled
  ? fs.createWriteStream('server.log', { flags: 'a' })
  : null;

// for yee yee timestamp
function timestamp() {
  return new Date().toISOString();
}

function writeLog(level, msg, toStdErr = false) {
  const line = `[${timestamp()}] [${level}] ${msg}\n`;

  if (consoleLoggingEnabled) {
    if (toStdErr) process.stderr.write(line);
    else          process.stdout.write(line);
  }

  if (fileLoggingEnabled && logStream) {
    logStream.write(line);
  }
}

function logInfo(message) {
  writeLog('INFO', message, false);
}

function logError(message) {
  writeLog('ERROR', message, true);
}

function pretty(obj) {
  return util.inspect(obj, { depth: null, colors: false });
}

logInfo('FF6 Custom Server v0.0.3');
logInfo('NOTE: This server is very unfinished, development is still underway.');
logInfo(`Console logging is ${consoleLoggingEnabled ? 'ENABLED' : 'DISABLED'}`);
logInfo(`File logging is ${fileLoggingEnabled    ? 'ENABLED' : 'DISABLED'}`);
logInfo('Server is starting...');

// read the certificate and private key, need this for HTTPS ingame but you can also just use HTTP.
// if you do decide to use HTTPS you will need to replace the certificate in the client's assets.
const serverConfig = {
  key: fs.readFileSync('localhost.key'),
  cert: fs.readFileSync('localhost.crt'),
  secureOptions: constants.SSL_OP_NO_TLSv1_3, // disable tls 1.3, i dont even remember why i did this but hey, there it is lol
  ciphers: [
    'DHE-RSA-AES256-SHA',
    'DHE-DSS-AES256-SHA',
    'DHE-RSA-AES128-SHA',
    'DHE-DSS-AES128-SHA',
    'DHE-RSA-DES-CBC3-SHA',
    'DHE-DSS-DES-CBC3-SHA',
    'AES256-SHA',
    'AES128-SHA',
    'DES-CBC3-SHA'
  ].join(':')
};

const SAVE_DIR = path.join(__dirname, 'savedata');
const RESPONSES_DIR = path.join(__dirname, 'jsonresponses');
const SAVE_FILE = 'save.json';
const PROFILE_FILE = 'profile.json';

try { if (!fs.existsSync(SAVE_DIR)) fs.mkdirSync(SAVE_DIR, { recursive: true }); } catch (e) {}
try { if (!fs.existsSync(RESPONSES_DIR)) fs.mkdirSync(RESPONSES_DIR, { recursive: true }); } catch (e) {}

function safeJSONParse(str, fallback) {
  try {
    if (!str || !String(str).trim()) return fallback;
    return JSON.parse(str);
  } catch (e) {
    return fallback;
  }
}

function trimCarPrefix(name) {
  if (!name) return '';
  const s = String(name);
  const pref = 'car_attribute_';
  if (s.indexOf(pref) === 0) return s.substring(pref.length);
  return s;
}

function normalizeArrayLen(arr, len, fillVal) {
  const out = Array.isArray(arr) ? arr.slice(0) : [];
  while (out.length < len) out.push(fillVal);
  if (out.length > len) out.length = len;
  return out;
}

function normalizeRecipe(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) r = {};
  const out = {};
  out.c = (r.c !== undefined && r.c !== null) ? (parseInt(r.c, 10) || 0) : 0;
  out.n = trimCarPrefix((r.n !== undefined && r.n !== null) ? r.n : '');
  out.p = normalizeArrayLen(r.p, 11, 0);
  out.vu = normalizeArrayLen(r.vu, 9, -1);
  out.eu = normalizeArrayLen(r.eu, 9, 0);
  out.ut = normalizeArrayLen(r.ut, 9, 0);
  out.q = (r.q !== undefined && r.q !== null) ? (Number(r.q) || 0) : 0;
  return out;
}

function normalizeCarRecord(car, defaultUid, forceId) {
  if (!car || typeof car !== 'object' || Array.isArray(car)) return null;

  const out = {};
  out.uid = (car.uid !== undefined && car.uid !== null) ? String(car.uid) : String(defaultUid || '1001');

  let id = (car._id !== undefined && car._id !== null && String(car._id).length > 0) ? String(car._id) : '';
  if (!id && car.carId !== undefined && car.carId !== null && String(car.carId).length > 0) id = String(car.carId);
  if (!id && forceId) id = String(forceId);
  if (!id) id = crypto.randomBytes(12).toString('hex');
  out._id = id;

  const r = normalizeRecipe(car.r || car.recipe || {});
  const q = (car.q !== undefined && car.q !== null) ? (Number(car.q) || 0) : (r.q || 0);
  r.q = q;
  out.r = r;
  out.q = q;

  return out;
}

function carsObjToArray(carsObj, defaultUid) {
  const arr = [];
  if (Array.isArray(carsObj)) {
    for (let i = 0; i < carsObj.length; i++) {
      const n = normalizeCarRecord(carsObj[i], defaultUid, null);
      if (n) arr.push(n);
    }
    return arr;
  }
  if (carsObj && typeof carsObj === 'object') {
    const keys = Object.keys(carsObj);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const n = normalizeCarRecord(carsObj[k], defaultUid, k);
      if (n) arr.push(n);
    }
  }
  return arr;
}

function carsArrayToObj(carsArr, defaultUid) {
  const obj = {};
  if (!Array.isArray(carsArr)) return obj;
  for (let i = 0; i < carsArr.length; i++) {
    const n = normalizeCarRecord(carsArr[i], defaultUid, null);
    if (n) obj[n._id] = n;
  }
  return obj;
}

function sendJson(res, obj, code) {
  const status = code || 200;
  const str = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(str);
}

function parseBodyObject(body, parsedUrl) {
  const out = {};
  if (parsedUrl && parsedUrl.query) {
    const q = parsedUrl.query;
    const keys = Object.keys(q);
    for (let i = 0; i < keys.length; i++) out[keys[i]] = q[keys[i]];
  }
  if (body && String(body).trim().length) {
    const maybe = safeJSONParse(body, null);
    if (maybe && typeof maybe === 'object') {
      const ks = Object.keys(maybe);
      for (let i = 0; i < ks.length; i++) out[ks[i]] = maybe[ks[i]];
    } else {
      const form = querystring.parse(body);
      const fk = Object.keys(form);
      for (let i = 0; i < fk.length; i++) out[fk[i]] = form[fk[i]];
    }
  }
  return out;
}

function isCarRecordLike(v) {
  return !!(v && typeof v === 'object' && !Array.isArray(v) && (v.r || v.recipe || v._id || v.carId));
}

function getCarsByUid(carsRoot, uid) {
  if (!carsRoot || typeof carsRoot !== 'object') return {};
  if (Array.isArray(carsRoot)) return carsArrayToObj(carsRoot, uid);

  const inner = carsRoot[uid];
  if (inner && typeof inner === 'object') {
    if (Array.isArray(inner)) return carsArrayToObj(inner, uid);
    return inner;
  }

  const keys = Object.keys(carsRoot);
  for (let i = 0; i < keys.length; i++) {
    if (isCarRecordLike(carsRoot[keys[i]])) return carsRoot;
  }

  return {};
}

function ensureCarsNested(state, uid) {
  if (!state.result) state.result = {};
  let cars = state.result.cars;
  if (!cars || typeof cars !== 'object') {
    cars = {};
    state.result.cars = cars;
  }

  if (Array.isArray(cars)) {
    const mapped = carsArrayToObj(cars, uid);
    state.result.cars = {};
    state.result.cars[uid] = mapped;
    return state.result.cars[uid];
  }

  if (cars[uid] !== undefined) {
    if (Array.isArray(cars[uid])) cars[uid] = carsArrayToObj(cars[uid], uid);
    if (!cars[uid] || typeof cars[uid] !== 'object') cars[uid] = {};
    return cars[uid];
  }

  const keys = Object.keys(cars);
  let flat = false;
  for (let i = 0; i < keys.length; i++) {
    if (isCarRecordLike(cars[keys[i]])) { flat = true; break; }
  }

  if (flat) {
    const old = cars;
    state.result.cars = {};
    state.result.cars[uid] = old;
    return state.result.cars[uid];
  }

  cars[uid] = {};
  return cars[uid];
}

const StateManager = {
  loadSave: function() {
    const p = path.join(SAVE_DIR, SAVE_FILE);
    let data = null;

    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, 'utf8');
        if (content && content.trim().length > 0) data = JSON.parse(content);
      } catch (e) {
        if (fs.existsSync(p + '.bak')) {
          try { data = JSON.parse(fs.readFileSync(p + '.bak', 'utf8')); } catch (e2) {}
        }
      }
    }

    if (!data || !data.result) {
      data = {
        result: {
          cars: {},
          profile: { coins: 23450, gold: 25, xp: 0, energy: 10 },
          inventory: {},
          stats: {},
          unlocks: { values: ['fuel'] },
          achievements: { values: {} }
        }
      };
    }

    if (!data.result.cars) data.result.cars = {};
    if (!data.result.profile) data.result.profile = { coins: 23450, gold: 25, xp: 0, energy: 10 };
    if (!data.result.inventory) data.result.inventory = {};
    if (!data.result.stats) data.result.stats = {};
    if (!data.result.unlocks) data.result.unlocks = { values: ['fuel'] };
    if (!data.result.achievements) data.result.achievements = { values: {} };

    if (Array.isArray(data.result.cars)) {
      const mapped = carsArrayToObj(data.result.cars, '1001');
      data.result.cars = { '1001': mapped };
    }

    return data;
  },

  writeSave: function(data) {
    const p = path.join(SAVE_DIR, SAVE_FILE);
    try {
      if (!data || !data.result) return;

      if (!data.result.cars) data.result.cars = {};
      if (Array.isArray(data.result.cars)) {
        const mapped = carsArrayToObj(data.result.cars, '1001');
        data.result.cars = { '1001': mapped };
      }

      if (fs.existsSync(p)) {
        try { fs.copyFileSync(p, p + '.bak'); } catch (e) {}
      }
      fs.writeFileSync(p, JSON.stringify(data, null, 4));
    } catch (e) {
      logError(`Save Error: ${e.message}`);
    }
  },

  getProfile: function(naidInput) {
    const p = path.join(SAVE_DIR, PROFILE_FILE);
    let profiles = {};
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf8');
        if (raw && raw.trim().length) profiles = JSON.parse(raw);
      }
    } catch (e) {
      profiles = {};
    }

    const naid = naidInput || 'guest';
    if (!profiles[naid]) {
      profiles[naid] = {
        uid: '1001',
        naid: naid,
        name: 'Player',
        stoken: crypto.randomBytes(16).toString('hex') + '|0',
        created: Date.now()
      };
      try { fs.writeFileSync(p, JSON.stringify(profiles, null, 4)); } catch (e2) {}
    }
    return profiles[naid];
  },

  merge: function(target, source) {
    if (!target) target = {};
    if (!source || typeof source !== 'object') return target;

    const keys = Object.keys(source);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];

      if (key === 'cars') {
        const sourceCars = source[key];
        if (!target.cars || typeof target.cars !== 'object') target.cars = {};

        if (!sourceCars) continue;

        if (Array.isArray(sourceCars)) {
          const mapped = carsArrayToObj(sourceCars, '1001');
          if (!target.cars['1001'] || typeof target.cars['1001'] !== 'object') target.cars['1001'] = {};
          const mk = Object.keys(mapped);
          for (let j = 0; j < mk.length; j++) target.cars['1001'][mk[j]] = mapped[mk[j]];
          continue;
        }

        if (typeof sourceCars === 'object') {
          const topKeys = Object.keys(sourceCars);
          if (topKeys.length === 0) continue;

          let topLooksFlat = false;
          for (let j = 0; j < topKeys.length; j++) {
            if (isCarRecordLike(sourceCars[topKeys[j]])) { topLooksFlat = true; break; }
          }

          if (topLooksFlat) {
            if (!target.cars['1001'] || typeof target.cars['1001'] !== 'object') target.cars['1001'] = {};
            for (let j = 0; j < topKeys.length; j++) {
              const cid = topKeys[j];
              const n = normalizeCarRecord(sourceCars[cid], '1001', cid);
              if (n && n.r && n.r.n) target.cars['1001'][n._id] = n;
            }
            continue;
          }

          for (let j = 0; j < topKeys.length; j++) {
            const uid = topKeys[j];
            const inner = sourceCars[uid];
            if (!inner) continue;

            if (!target.cars[uid] || typeof target.cars[uid] !== 'object') target.cars[uid] = {};

            if (Array.isArray(inner)) {
              const mappedInner = carsArrayToObj(inner, uid);
              const ik = Object.keys(mappedInner);
              for (let k = 0; k < ik.length; k++) target.cars[uid][ik[k]] = mappedInner[ik[k]];
              continue;
            }

            if (typeof inner === 'object') {
              const innerKeys = Object.keys(inner);
              if (innerKeys.length === 0) continue;

              let innerLooksFlat = false;
              for (let k = 0; k < innerKeys.length; k++) {
                if (isCarRecordLike(inner[innerKeys[k]])) { innerLooksFlat = true; break; }
              }

              if (!innerLooksFlat && isCarRecordLike(inner)) {
                const n = normalizeCarRecord(inner, uid, null);
                if (n && n.r && n.r.n) target.cars[uid][n._id] = n;
                continue;
              }

              for (let k = 0; k < innerKeys.length; k++) {
                const cid = innerKeys[k];
                const n = normalizeCarRecord(inner[cid], uid, cid);
                if (n && n.r && n.r.n) target.cars[uid][n._id] = n;
              }
            }
          }
        }
        continue;
      }

      const sv = source[key];
      const tv = target[key];

      if (sv && typeof sv === 'object' && !Array.isArray(sv) && tv && typeof tv === 'object' && !Array.isArray(tv)) {
        StateManager.merge(tv, sv);
      } else {
        target[key] = sv;
      }
    }
    return target;
  }
};

function handleAuth(req, res, body, parsedUrl) {
  const data = parseBodyObject(body, parsedUrl);
  const naid = data.naid || data.openudid || data.player_id || data.device_id || data.udid || 'guest';
  const profile = StateManager.getProfile(String(naid));
  const state = StateManager.loadSave();

  const carsById = getCarsByUid(state.result.cars || {}, profile.uid || '1001');
  const carsArr = carsObjToArray(carsById, profile.uid || '1001');

  return sendJson(res, {
    result: {
      success: true,
      ts: Math.floor(Date.now() / 1000),
      stoken: profile.stoken,
      naid: profile.naid,
      player_id: profile.naid,
      user: { uid: profile.uid, name: profile.name, naid: profile.naid },
      data: {
        cars: carsArr
      }
    }
  });
}

function handleDataStore(req, res, body) {
  const state = StateManager.loadSave();

  if (req.method === 'POST') {
    const incoming = safeJSONParse(body, null);
    if (incoming && incoming.data && typeof incoming.data === 'object') {
      state.result = StateManager.merge(state.result, incoming.data);
      StateManager.writeSave(state);
    }
    return sendJson(res, { ts: Math.floor(Date.now() / 1000) });
  }

  const out = {};
  const ks = Object.keys(state);
  for (let i = 0; i < ks.length; i++) out[ks[i]] = state[ks[i]];
  out.hash = 'secured';
  out.check = 'verified';
  return sendJson(res, out);
}

function handleCarsSave(req, res, body) {
  const state = StateManager.loadSave();
  const parsedUrl = url.parse(req.url, true);
  const data = parseBodyObject(body, parsedUrl);

  const json = safeJSONParse(body, {});
  const carPayload = (json && json.car) ? json.car : (data && data.car ? data.car : null);

  if (!carPayload || typeof carPayload !== 'object') {
    return sendJson(res, { ts: Math.floor(Date.now() / 1000), result: { success: false } });
  }

  const uid = String(carPayload.uid || data.uid || data.player_uid || '1001');
  const normalized = normalizeCarRecord(carPayload, uid, carPayload._id || carPayload.carId || null);

  if (!normalized || !normalized.r || !normalized.r.n) {
    return sendJson(res, { ts: Math.floor(Date.now() / 1000), result: { success: false } });
  }

  const container = ensureCarsNested(state, uid);
  container[normalized._id] = normalized;
  StateManager.writeSave(state);

  return sendJson(res, {
    ts: Math.floor(Date.now() / 1000),
    result: {
      success: true,
      _id: normalized._id,
      car: normalized
    }
  });
}

function handleWalletBalance(req, res, body, pathname) {
  const state = StateManager.loadSave();
  const parsedUrl = url.parse(req.url, true);

  const safePath = (pathname !== undefined && pathname !== null)
    ? String(pathname)
    : (parsedUrl && parsedUrl.pathname ? String(parsedUrl.pathname) : '');

  const params = parseBodyObject(body, parsedUrl);

  if (!state.result) state.result = {};
  if (!state.result.profile) state.result.profile = { coins: 0, gold: 0, xp: 0, energy: 10 };

  if (safePath === '/wallet/balance') {
    const gold = (state.result.profile && state.result.profile.gold) ? state.result.profile.gold : 0;

    return sendJson(res, {
      ts: Math.floor(Date.now() / 1000),
      result: {
        balance: gold
      }
    });
  }

  const val = parseInt(params.value || 0, 10) || 0;

  if (safePath.indexOf('/wallet/debit') === 0) {
    state.result.profile.gold = Math.max(0, (state.result.profile.gold || 0) - val);
  } else if (safePath.indexOf('/wallet/credit') === 0) {
    state.result.profile.gold = (state.result.profile.gold || 0) + val;
  }

  StateManager.writeSave(state);

  return sendJson(res, {
    ts: Math.floor(Date.now() / 1000),
    result: {
      success: true,
      balance: state.result.profile.gold || 0
    }
  });
}

function handleInventory(req, res, body, pathname) {
  const state = StateManager.loadSave();
  if (!state.result.inventory) state.result.inventory = {};

  if (pathname === '/inventory/add') {
    const json = safeJSONParse(body, {});
    if (json && json.items && typeof json.items === 'object') {
      const keys = Object.keys(json.items);
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        const v = parseInt(json.items[k] || 0, 10) || 0;
        state.result.inventory[k] = (state.result.inventory[k] || 0) + v;
      }
      StateManager.writeSave(state);
    }
    return sendJson(res, { ts: Math.floor(Date.now() / 1000), result: { success: true } });
  }

  return sendJson(res, { ts: Math.floor(Date.now() / 1000), result: state.result.inventory });
}

// new fancy logging stuff, looks prettier
function logRequest(req, body) {
  if (req.url === '/bugs') return;
  const lines = [
    '─── HTTP Request ───',
    `Method : ${req.method}`,
    `URL    : ${req.url}`,
    `Headers: ${pretty(req.headers)}`,
    `Body   : ${body || '<empty>'}`,
    '────────────────────'
  ].join('\n');
  logInfo(lines);
}

// log the body of POST requests to /bugs to a JSON file
function logBugsRequest(body) {
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (err) {
    logError(`Error parsing /bugs payload: ${err.message}`);
    return;
  }

  const entry = {
    timestamp: new Date().toISOString(),
    body: parsed
  };

  fs.readFile('bugs.json', 'utf8', (err, data) => {
    let logs = [];
    if (!err && data && String(data).trim().length) {
      try {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) logs = parsed;
      } catch (e) {
        logs = [];
      }
    }

    logs.push(entry);

    fs.writeFile('bugs.json', JSON.stringify(logs, null, 2), (err2) => {
      if (err2) {
        logError(`Failed to write bugs.json: ${err2.message}`);
      } else {
        logInfo('/bugs payload appended to bugs.json');
      }
    });
  });
}

// for JSON responses
function handleJsonResponse(filePath, res) {
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      logError(`Error reading ${filePath}: ${err.message}`);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      return res.end(`Error: ${err.message}`);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(data);
  });
}

// routes
const routes = [
  { path: '/inventory/add', handler: (req, res, body, parsedUrl, pathname) => handleInventory(req, res, body, pathname) },
  { path: '/inventory',     handler: (req, res, body, parsedUrl, pathname) => handleInventory(req, res, body, pathname) },
  { path: '/motd/status',   handler: (req, res) => handleJsonResponse('jsonresponses/motdstatus.json',    res) },
  { path: '/carinfo/check', handler: (req, res) => handleJsonResponse('jsonresponses/carinfocheck.json',  res) },
  { path: '/carinfo',       handler: (req, res) => handleJsonResponse('jsonresponses/carinfo.json',       res) },
  { path: '/cars/save',     handler: (req, res, body) => handleCarsSave(req, res, body) },
  { path: '/cars/find',          handler: (req, res) => handleJsonResponse('jsonresponses/carsfind.json',         res) },
  { path: '/cars',          handler: (req, res) => handleJsonResponse('jsonresponses/cars.json',         res) },
  { path: '/content',       handler: (req, res) => handleJsonResponse('jsonresponses/info.json',         res) },
  { path: '/auth/init',     handler: (req, res) => handleJsonResponse('jsonresponses/authinit.json',     res) },
  { path: '/kabam/register',handler: (req, res, body, parsedUrl) => handleAuth(req, res, body, parsedUrl) },
  { path: '/kabam/upgrade', handler: (req, res) => handleJsonResponse('jsonresponses/noacc.json',       res) },
  { path: '/kabam/guest',   handler: (req, res, body, parsedUrl) => handleAuth(req, res, body, parsedUrl) },
  { path: '/kabam/login',   handler: (req, res, body, parsedUrl) => handleAuth(req, res, body, parsedUrl) },
  { path: '/tuning',        handler: (req, res) => handleJsonResponse('jsonresponses/tuning.json',       res) },
  { path: '/wallet/balance',handler: (req, res, body, parsedUrl, pathname) => handleWalletBalance(req, res, body, pathname) },
  { path: '/wallet',        handler: (req, res, body, parsedUrl, pathname) => handleWalletBalance(req, res, body, pathname) },
  { path: '/gacha/getTokens', handler: (req, res) => handleJsonResponse('jsonresponses/gettokens.json',   res) },
  { path: '/gacha/getRewardCars', handler: (req, res) => handleJsonResponse('jsonresponses/getrewardcars.json',   res) },
  { path: '/gacha/getTables', handler: (req, res) => handleJsonResponse('jsonresponses/gachatables.json',   res) },
  { path: '/gacha/getAttractImages', handler: (req, res) => handleJsonResponse('jsonresponses/gachaattract.json',   res) },
  { path: '/store/payouts', handler: (req, res) => handleJsonResponse('jsonresponses/storepayouts.json',res) },
  { path: '/tournaments/latest', handler: (req, res) => handleJsonResponse('jsonresponses/tournamentslatest.json', res) },
  { path: '/racewars/latest',     handler: (req, res) => handleJsonResponse('jsonresponses/racewarslatest.json',     res) },
  { path: '/racewars/myInfo',     handler: (req, res) => handleJsonResponse('jsonresponses/racewarsmyinfo.json',    res) },
  { path: '/prizes/refresh',      handler: (req, res) => handleJsonResponse('jsonresponses/prizesrefresh.json',     res) },
  { path: '/web/webViewTabs',     handler: (req, res) => handleJsonResponse('jsonresponses/webviewtabs.json',      res) },
  { path: '/push/token',          handler: (req, res) => handleJsonResponse('jsonresponses/pushtoken.json',        res) }
];

// handle HTTP/HTTPS requests
function handleRequest(req, res) {
  let body = '';
  req.on('data', chunk => body += chunk.toString());
  req.on('end', () => {
    logRequest(req, body);

    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl && parsedUrl.pathname ? parsedUrl.pathname : req.url;

    // log POST requests to /bugs to a JSON file
    if (req.method === 'POST' && pathname === '/bugs') {
      logBugsRequest(body);
      return res.end(JSON.stringify({ ts: Math.floor(Date.now() / 1000) }));
    }

    // check if the request is for index page
    if (pathname === '/') {
      try {
        const html = fs.readFileSync('index.html', 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end(html);
      } catch (err) {
        logError(`Error reading index.html: ${err.message}`);
        res.writeHead(500);
        return res.end(`Error: ${err.message}`);
      }
    }

    if (pathname === '/guest' || pathname.indexOf('/guest/') === 0 || pathname === '/register' || pathname.indexOf('/register/') === 0) {
      return handleAuth(req, res, body, parsedUrl);
    }

    if (pathname.indexOf('/ds/') === 0) {
      if (req.method === 'POST' || req.method === 'GET') return handleDataStore(req, res, body);
    }

    const route = routes.find(r => pathname.startsWith(r.path));
    if (route) {
      return route.handler(req, res, body, parsedUrl, pathname);
    }
    res.end(JSON.stringify({ ts: Math.floor(Date.now() / 1000) }));
  });
}

// create HTTPS server
const httpsServer = https.createServer(serverConfig, handleRequest);
httpsServer.listen(443, () => logInfo('HTTPS listening on port 443'));
httpsServer.on('secureConnection', socket => {
  socket.on('error', err => logError(`SSL Error: ${err.message}`));
});

// create HTTP server
const httpServer = http.createServer(handleRequest);
httpServer.listen(80, () => logInfo('HTTP listening on port 80'));

// create WebSocket servers
const wssServer = new WebSocket.Server({ noServer: true });
const wsServer  = new WebSocket.Server({ noServer: true });

// handle WebSocket connections, i need to look more into what websockets actually do later, but for now loopback works.
function handleConnection(ws, secure) {
  const tag = secure ? 'WSS' : 'WS';
  ws.on('message', message => {
    logInfo(`${tag} Message: ${message}`);
    ws.send(message);
  });
  ws.on('error', err => {
    logError(`${tag} Error: ${err.message}`);
  });
  ws.on('close', (code, reason) => {
    logInfo(`${tag} Close: code=${code}, reason=${reason}`);
  });
}

httpsServer.on('upgrade', (req, sock, head) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl && parsedUrl.pathname ? parsedUrl.pathname : req.url;
  if (pathname === '/push/token') {
    logInfo(`WSS Upgrade: ${req.method} ${req.url}`);
    wssServer.handleUpgrade(req, sock, head, ws => handleConnection(ws, true));
  } else {
    sock.destroy();
  }
});

httpServer.on('upgrade', (req, sock, head) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl && parsedUrl.pathname ? parsedUrl.pathname : req.url;
  if (pathname === '/push/token') {
    logInfo(`WS Upgrade: ${req.method} ${req.url}`);
    wsServer.handleUpgrade(req, sock, head, ws => handleConnection(ws, false));
  } else {
    sock.destroy();
  }
});

httpServer.keepAliveTimeout = 60000;
httpsServer.keepAliveTimeout = 60000;

if (httpServer.headersTimeout !== undefined) httpServer.headersTimeout = 65000;
if (httpsServer.headersTimeout !== undefined) httpsServer.headersTimeout = 65000;

logInfo('Server is running...');

// clean up ur mess
process.on('exit', () => {
  if (logStream) logStream.end();
});

