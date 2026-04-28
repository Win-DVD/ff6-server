const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  safeJSONParse,
  sendJson,
  parseBodyObject,
  normalizeCarRecord,
  ensureCarsNested,
  carsObjToArray,
  carsArrayToObj,
  isCarRecordLike,
  parseRequestUrl
} = require('../utils/common');

function sanitizeId(id) {
  const s = String(id || 'guest');
  return s.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 64) || 'guest';
}

function randomIntCompat(min, max) {
  const lo = parseInt(min, 10) || 0;
  const hi = parseInt(max, 10) || 0;
  if (hi <= lo) return lo;
  const span = hi - lo;
  const n = crypto.randomBytes(6).readUIntBE(0, 6);
  return lo + (n % span);
}

function randomDigits(length) {
  const len = parseInt(length, 10) || 1;
  let out = '';
  while (out.length < len) {
    const b = crypto.randomBytes(16);
    for (let i = 0; i < b.length && out.length < len; i++) out += String(b[i] % 10);
  }
  return out;
}

function createUid() {
  return randomDigits(17);
}

function uidUsedInProfiles(profiles, uid) {
  const keys = Object.keys(profiles || {});
  for (let i = 0; i < keys.length; i++) {
    const pr = profiles[keys[i]];
    if (pr && pr.uid !== undefined && String(pr.uid) === String(uid)) return true;
  }
  return false;
}

function uidUsedInUsers(saveDir, uid) {
  try {
    const usersPath = path.join(saveDir, 'users.json');
    if (!fs.existsSync(usersPath)) return false;
    const raw = fs.readFileSync(usersPath, 'utf8');
    const users = raw && raw.trim().length ? JSON.parse(raw) : {};
    if (!users || typeof users !== 'object') return false;
    const keys = Object.keys(users);
    for (let i = 0; i < keys.length; i++) {
      const rec = users[keys[i]];
      if (rec && rec.uid !== undefined && String(rec.uid) === String(uid)) return true;
    }
  } catch (e) {}
  return false;
}

function createStateManager(config) {
  const SAVE_DIR = config.SAVE_DIR;
  const SAVE_FILE = config.SAVE_FILE;
  const PROFILE_FILE = config.PROFILE_FILE;
  const logError = config.logError;

  const StateManager = {
    _profilePath: function() {
      return path.join(SAVE_DIR, PROFILE_FILE);
    },

    _savePath: function(naid) {
      const safeNaid = sanitizeId(naid || 'guest');
      return path.join(SAVE_DIR, `save_${safeNaid}.json`);
    },

    _legacySavePath: function() {
      return path.join(SAVE_DIR, SAVE_FILE);
    },

    _loadProfiles: function() {
      const p = this._profilePath();
      let profiles = {};
      try {
        if (fs.existsSync(p)) {
          const raw = fs.readFileSync(p, 'utf8');
          if (raw && raw.trim().length) profiles = JSON.parse(raw);
        }
      } catch (e) {
        profiles = {};
      }
      if (!profiles || typeof profiles !== 'object' || Array.isArray(profiles)) profiles = {};
      return profiles;
    },

    _writeProfiles: function(profiles) {
      try {
        fs.writeFileSync(this._profilePath(), JSON.stringify(profiles || {}, null, 4));
      } catch (e) {}
    },

    loadSave: function(naid) {
      const scopedPath = this._savePath(naid || 'guest');
      const p = scopedPath;
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
      if (!data.result.profile) data.result.profile = { coins: 23450, gold: 25, xp: 0, energy: 10, uid: '', name: '', email: '', loggedIn: false, guest: true };
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

    writeSave: function(data, naid) {
      const p = this._savePath(naid || 'guest');
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

    findNaidByStoken: function(stoken) {
      if (!stoken) return null;
      const profiles = this._loadProfiles();
      const keys = Object.keys(profiles);
      for (let i = 0; i < keys.length; i++) {
        const pr = profiles[keys[i]];
        if (pr && pr.stoken === stoken) return keys[i];
      }
      return null;
    },

    findNaidByUid: function(uid) {
      if (!uid) return null;
      const target = String(uid);
      const profiles = this._loadProfiles();
      const keys = Object.keys(profiles);
      for (let i = 0; i < keys.length; i++) {
        const pr = profiles[keys[i]];
        if (pr && pr.uid !== undefined && String(pr.uid) === target) return keys[i];
      }
      return null;
    },

    isUidInUse: function(uid) {
      if (!uid) return false;
      const profiles = this._loadProfiles();
      if (uidUsedInProfiles(profiles, uid)) return true;
      return uidUsedInUsers(SAVE_DIR, uid);
    },

    generateUniqueUid: function() {
      let uid = '';
      for (let i = 0; i < 50; i++) {
        uid = createUid();
        if (!this.isUidInUse(uid)) return uid;
      }
      return randomDigits(17);
    },

    getProfile: function(naidInput) {
      const naid = String(naidInput || 'guest');
      const profiles = this._loadProfiles();

      if (!profiles[naid]) {
        profiles[naid] = {
          uid: this.generateUniqueUid(),
          naid: naid,
          name: '',
          stoken: crypto.randomBytes(16).toString('hex') + '|0',
          created: Date.now(),
          email: '',
          loggedIn: false,
          guest: true
        };
        this._writeProfiles(profiles);
      }

      return profiles[naid];
    },

    ensureProfile: function(naidInput) {
      return this.getProfile(String(naidInput || 'guest'));
    },

    saveProfile: function(profile) {
      if (!profile || !profile.naid) return false;
      const profiles = this._loadProfiles();
      profiles[String(profile.naid)] = profile;
      this._writeProfiles(profiles);
      return true;
    },

    migrateSave: function(fromNaid, toNaid) {
      const from = String(fromNaid || '');
      const to = String(toNaid || '');
      if (!from || !to || from === to) return;

      const fromPath = this._savePath(from);
      const toPath = this._savePath(to);

      if (!fs.existsSync(fromPath) || fs.existsSync(toPath)) return;

      try {
        const content = fs.readFileSync(fromPath, 'utf8');
        if (!content || !content.trim()) return;
        fs.writeFileSync(toPath, content);
        try { fs.copyFileSync(fromPath, fromPath + '.migrated.bak'); } catch (e) {}
        try { fs.unlinkSync(fromPath); } catch (e) {}
      } catch (e) {}
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

  return StateManager;
}

function createSaveHandler(deps) {
  const StateManager = deps.StateManager;
  const broadcast = deps.broadcast;





  function handleCarsList(req, res, body, parsedUrlInput) {
    const parsedUrl = parsedUrlInput || parseRequestUrl(req);
    const data = parseBodyObject(body, parsedUrl);

    let naid = String(data.naid || data.openudid || data.player_id || data.device_id || data.udid || '');
    if (!naid && data.uid !== undefined && data.uid !== null) {
      const byUid = StateManager.findNaidByUid(String(data.uid));
      if (byUid) naid = String(byUid);
    }
    if (!naid) {
      const stoken = data.stoken || data.session || data.token || data.st || data.s;
      if (stoken) {
        const byToken = StateManager.findNaidByStoken(String(stoken));
        if (byToken) naid = String(byToken);
      }
    }
    if (!naid) naid = 'guest';

    const state = StateManager.loadSave(naid);
    const profile = state && state.result ? state.result.profile || {} : {};
    const uid = String(data.uid || profile.uid || '1001');

    const carsByUid = ensureCarsNested(state, uid);
    let list = carsObjToArray(carsByUid, uid);

    if (!list || list.length === 0) {
      const carsRoot = state && state.result ? state.result.cars || {} : {};
      if (carsRoot && typeof carsRoot === 'object' && !Array.isArray(carsRoot)) {
        const uids = Object.keys(carsRoot);
        for (let i = 0; i < uids.length; i++) {
          const otherUid = uids[i];
          const otherCars = carsRoot[otherUid];
          if (!otherCars || typeof otherCars !== 'object') continue;
          const alt = carsObjToArray(otherCars, otherUid);
          if (alt && alt.length > 0) {
            list = alt;
            break;
          }
        }
      }
    }

    return sendJson(res, {
      ts: Math.floor(Date.now() / 1000),
      result: list || []
    });
  }

  function resolveUpgradeNaid(req, body, parsedUrlInput) {
    const parsedUrl = parsedUrlInput || parseRequestUrl(req);
    const data = parseBodyObject(body, parsedUrl);
    let naid = String(data.naid || data.openudid || data.player_id || data.device_id || data.udid || '');

    if (!naid && data.uid !== undefined && data.uid !== null) {
      const byUid = StateManager.findNaidByUid(String(data.uid));
      if (byUid) naid = String(byUid);
    }

    if (!naid) {
      const stoken = data.stoken || data.session || data.token || data.st || data.s;
      if (stoken) {
        const byToken = StateManager.findNaidByStoken(String(stoken));
        if (byToken) naid = String(byToken);
      }
    }

    if (!naid) naid = 'guest';
    return naid;
  }

  function ensureUpgradeProfile(state, naid) {
    if (!state.result) state.result = {};
    if (!state.result.profile) state.result.profile = {};

    const account = StateManager.getProfile(naid);
    if (!state.result.profile.uid && account && account.uid) state.result.profile.uid = account.uid;

    if (!state.result.profile.active_carid) {
      const uid = String(state.result.profile.uid || (account && account.uid) || '1001');
      const cars = ensureCarsNested(state, uid);
      const ids = Object.keys(cars || {});
      if (ids.length > 0) state.result.profile.active_carid = ids[0];
    }

    if (state.result.profile.xp === undefined || state.result.profile.xp === null) state.result.profile.xp = 0;
    if (state.result.profile.coins === undefined || state.result.profile.coins === null) state.result.profile.coins = 0;
    if (state.result.profile.gold === undefined || state.result.profile.gold === null) state.result.profile.gold = 0;
  }

  function parseIntSafe(v, fallback) {
    const n = parseInt(v, 10);
    if (!isFinite(n)) return fallback;
    return n;
  }

  function findUpgradeCar(state, uid, carId) {
    const cars = ensureCarsNested(state, uid);
    if (!cars || typeof cars !== 'object') return null;
    if (carId && cars[carId]) return cars[carId];

    const keys = Object.keys(cars);
    if (keys.length === 0) return null;

    const activeId = state && state.result && state.result.profile ? state.result.profile.active_carid : '';
    if (activeId && cars[activeId]) return cars[activeId];

    return cars[keys[0]];
  }

  function normalizeUpgradeCar(car) {
    if (!car.r || typeof car.r !== 'object') car.r = {};
    if (!Array.isArray(car.r.p)) car.r.p = [];
    if (!Array.isArray(car.r.vu)) car.r.vu = [];
    if (!Array.isArray(car.r.eu)) car.r.eu = [];
    if (!Array.isArray(car.r.ut)) car.r.ut = [];

    while (car.r.p.length < 11) car.r.p.push(0);
    while (car.r.vu.length < 9) car.r.vu.push(-1);
    while (car.r.eu.length < 9) car.r.eu.push(0);
    while (car.r.ut.length < 9) car.r.ut.push(0);

    if (car.r.q === undefined || car.r.q === null) car.r.q = Number(car.q || 0) || 0;
    if (car.r.et === undefined || car.r.et === null) car.r.et = 1;
    if (car.r.dc === undefined || car.r.dc === null) car.r.dc = -1;
    if (car.r.tid === undefined || car.r.tid === null) car.r.tid = '';
    if (car.r.pc === undefined || car.r.pc === null) car.r.pc = '';
    if (car.q === undefined || car.q === null) car.q = Number(car.r.q || 0) || 0;
    if (car.e === undefined || car.e === null) car.e = 0;
  }

  function applyUpgradePayment(profile, payment, price) {
    const cur = String(payment || '').toLowerCase();
    const amount = parseIntSafe(price, 0);
    if (amount <= 0) return true;

    if (cur === 'sc' || cur === 'coins' || cur === 'soft') {
      const coins = parseIntSafe(profile.coins, 0);
      if (coins < amount) return false;
      profile.coins = coins - amount;
      return true;
    }

    if (cur === 'hc' || cur === 'gold' || cur === 'hard') {
      const gold = parseIntSafe(profile.gold, 0);
      if (gold < amount) return false;
      profile.gold = gold - amount;
      return true;
    }

    return true;
  }

  function updateUpgradeXp(profile, xpAward) {
    const oldXp = parseIntSafe(profile.xp, 0);
    const gain = Math.max(0, parseIntSafe(xpAward, 0));
    const newXp = oldXp + gain;
    profile.xp = newXp;
    return { oldXp, newXp };
  }

  function sendUpgradeResponse(res, car, xp, profile) {
    const balance = parseIntSafe(profile && profile.gold !== undefined ? profile.gold : 0, 0);
    return sendJson(res, {
      ts: Math.floor(Date.now() / 1000),
      result: {
        car: car,
        xp: xp,
        balance: balance,
        __wallet: { balance: balance }
      }
    });
  }

  function buildPurchasedCar(uid, carName) {
    const safeUid = String(uid || '1001');
    const trimmed = String(carName || '').replace(/^car_attribute_/, '');
    const quality = 15;
    const out = normalizeCarRecord({
      uid: safeUid,
      r: {
        c: 0,
        n: trimmed,
        p: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        vu: [-1, -1, -1, -1, -1, -1, -1, -1, -1],
        eu: [0, 0, 0, 0, 0, 0, 0, 0, 0],
        ut: [0, 0, 0, 0, 0, 0, 0, 0, 0],
        q: quality
      },
      q: quality
    }, safeUid, null);
    if (out && out.e === undefined) out.e = 0;
    return out;
  }

  function handleBuyCarWithCurrency(req, res, body, parsedUrl) {
    const naid = resolveUpgradeNaid(req, body, parsedUrl);
    const state = StateManager.loadSave(naid);
    const data = parseBodyObject(body, parsedUrl);

    ensureUpgradeProfile(state, naid);

    const profile = state.result.profile || {};
    const uid = String(profile.uid || data.uid || '1001');
    const payment = String(data.payment || '').toLowerCase();
    const price = parseIntSafe(data.price, 0);
    const carNameRaw = String(data.carName || '').trim();
    const carName = carNameRaw.replace(/^car_attribute_/, '');

    if (!carName || price < 0) {
      return sendJson(res, { ts: Math.floor(Date.now() / 1000), err: 'ID_SPARX_ERROR_UNKNOWN', result: { retry: false, fatal: false, invalid_session: false } });
    }

    if (!applyUpgradePayment(profile, payment, price)) {
      return sendJson(res, { ts: Math.floor(Date.now() / 1000), err: 'ID_SPARX_ERROR_UNKNOWN', result: { retry: false, fatal: false, invalid_session: false } });
    }

    const purchasedCar = buildPurchasedCar(uid, carName);
    if (!purchasedCar || !purchasedCar._id || !purchasedCar.r || !purchasedCar.r.n) {
      return sendJson(res, { ts: Math.floor(Date.now() / 1000), err: 'ID_SPARX_ERROR_UNKNOWN', result: { retry: false, fatal: false, invalid_session: false } });
    }

    const carsByUid = ensureCarsNested(state, uid);
    carsByUid[purchasedCar._id] = purchasedCar;
    profile.active_carid = purchasedCar._id;

    const xp = updateUpgradeXp(profile, data.xp);
    StateManager.writeSave(state, naid);

    if (payment === 'hc' && typeof broadcast === 'function') {
      broadcast({ component: 'WalletManager', message: 'sync', payload: {} });
    }

    return sendJson(res, {
      ts: Math.floor(Date.now() / 1000),
      result: {
        car: purchasedCar,
        xp: xp,
        balance: parseIntSafe(profile.gold, 0),
        __wallet: { balance: parseIntSafe(profile.gold, 0) }
      }
    });
  }

  function handleCarUpgrades(req, res, body, parsedUrl, pathname) {
    const naid = resolveUpgradeNaid(req, body, parsedUrl);
    const state = StateManager.loadSave(naid);
    const data = parseBodyObject(body, parsedUrl);

    ensureUpgradeProfile(state, naid);
    const uid = String(state.result.profile.uid || '1001');
    const car = findUpgradeCar(state, uid, String(data.id || ''));

    if (!car) return sendJson(res, { ts: Math.floor(Date.now() / 1000), err: 'ID_SPARX_ERROR_UNKNOWN' });

    normalizeUpgradeCar(car);

    if (!applyUpgradePayment(state.result.profile, data.payment, data.price)) {
      return sendJson(res, { ts: Math.floor(Date.now() / 1000), err: 'ID_SPARX_ERROR_UNKNOWN', result: { retry: false, fatal: false, invalid_session: false } });
    }

    if (pathname === '/carupgrades/partUpgrade') {
      const category = parseIntSafe(data.uc, -1);
      const index = parseIntSafe(data.ui, -1);
      if (category >= 0 && category < car.r.eu.length && index >= 0) {
        car.r.eu[category] = index;
        if (category < car.r.ut.length) car.r.ut[category] = 0;
      }
    } else if (pathname === '/carupgrades/prestigeCar') {
      const prestigeName = String(data.pc || '').replace(/^car_attribute_/, '');
      const newClass = parseIntSafe(data.c, car.r.c || 0);
      if (prestigeName) car.r.n = prestigeName;
      if (isFinite(newClass) && newClass >= 0) car.r.c = newClass;
    } else if (pathname === '/carupgrades/visualUpgrade') {
      const category = parseIntSafe(data.uc !== undefined ? data.uc : data.vc, -1);
      const upgradeValue = parseIntSafe(data.ui !== undefined ? data.ui : data.vu, -1);
      if (category >= 0 && category < car.r.vu.length) car.r.vu[category] = upgradeValue;
    } else {
      return sendJson(res, { ts: Math.floor(Date.now() / 1000) });
    }

    const xp = updateUpgradeXp(state.result.profile, data.xp);
    car.q = Number(car.r.q || car.q || 0) || 0;

    StateManager.writeSave(state, naid);

    if (String(data.payment || '').toLowerCase() === 'hc' && typeof broadcast === 'function') {
      broadcast({ component: 'WalletManager', message: 'sync', payload: {} });
    }

    return sendUpgradeResponse(res, car, xp, state.result.profile);
  }

  const handleCarsSave = function(req, res, body) {
    const parsedUrl = parseRequestUrl(req);
    const data = parseBodyObject(body, parsedUrl);

    const json = safeJSONParse(body, {});
    const carPayload = (json && json.car) ? json.car : (data && data.car ? data.car : null);

    let naid = String(data.naid || data.openudid || data.player_id || data.device_id || data.udid || '');
    if (!naid) {
      const stoken = data.stoken || data.session || data.token || data.st || data.s;
      if (stoken) {
        const foundByToken = StateManager.findNaidByStoken(String(stoken));
        if (foundByToken) naid = String(foundByToken);
      }
    }
    if (!naid && carPayload && carPayload.uid !== undefined && carPayload.uid !== null) {
      const foundByUid = StateManager.findNaidByUid(String(carPayload.uid));
      if (foundByUid) naid = String(foundByUid);
    }
    if (!naid && data.uid !== undefined && data.uid !== null) {
      const foundByUid = StateManager.findNaidByUid(String(data.uid));
      if (foundByUid) naid = String(foundByUid);
    }
    if (!naid) naid = 'guest';

    const state = StateManager.loadSave(naid);

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
    StateManager.writeSave(state, naid);

    return sendJson(res, {
      ts: Math.floor(Date.now() / 1000),
      result: {
        success: true,
        _id: normalized._id,
        car: normalized
      }
    });
  };

  handleCarsSave.handleCarUpgrades = handleCarUpgrades;
  handleCarsSave.handleCarsList = handleCarsList;
  handleCarsSave.handleBuyCarWithCurrency = handleBuyCarWithCurrency;
  return handleCarsSave;
}


createSaveHandler.createStateManager = createStateManager;

module.exports = createSaveHandler;
