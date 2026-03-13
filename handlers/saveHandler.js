const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const {
  safeJSONParse,
  sendJson,
  parseBodyObject,
  normalizeCarRecord,
  ensureCarsNested,
  carsArrayToObj,
  isCarRecordLike
} = require('../utils/common');

function createStateManager(config) {
  const SAVE_DIR = config.SAVE_DIR;
  const SAVE_FILE = config.SAVE_FILE;
  const PROFILE_FILE = config.PROFILE_FILE;
  const logError = config.logError;

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

  return StateManager;
}

function createSaveHandler(deps) {
  const StateManager = deps.StateManager;

  return function handleCarsSave(req, res, body) {
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
  };
}

createSaveHandler.createStateManager = createStateManager;

module.exports = createSaveHandler;