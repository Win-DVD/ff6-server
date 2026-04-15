const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  sendJson,
  parseBodyObject,
  getCarsByUid,
  carsObjToArray
} = require('../utils/common');

function nowTs() {
  return Math.floor(Date.now() / 1000);
}

function normalizeEmail(v) {
  const s = String(v || '').trim().toLowerCase();
  if (!s || s.length > 254) return '';
  return s;
}

function hashPassword(password, saltHex) {
  const salt = saltHex ? Buffer.from(String(saltHex), 'hex') : crypto.randomBytes(16);
  const pw = Buffer.from(String(password || ''), 'utf8');
  const dk = crypto.pbkdf2Sync(pw, salt, 120000, 32, 'sha256');
  return { salt: salt.toString('hex'), hash: dk.toString('hex') };
}

function verifyPassword(password, saltHex, hashHex) {
  try {
    const out = hashPassword(password, saltHex);
    return crypto.timingSafeEqual(
      Buffer.from(out.hash, 'hex'),
      Buffer.from(String(hashHex || ''), 'hex')
    );
  } catch (e) {
    return false;
  }
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

function createAccountNaid() {
  return randomDigits(9);
}

function createUidFromState(StateManager) {
  if (StateManager && typeof StateManager.generateUniqueUid === 'function') {
    return String(StateManager.generateUniqueUid());
  }
  return randomDigits(17);
}

function ensureUserIdentityFields(profile) {
  if (!profile) return;
  if (!profile.uid || String(profile.uid).length !== 17) profile.uid = createUid();
}

function isNaidInUse(StateManager, users, naid) {
  const n = String(naid || '');
  if (!n) return true;

  if (typeof StateManager.findNaidByUid === 'function') {
    const profiles = typeof StateManager._loadProfiles === 'function' ? StateManager._loadProfiles() : {};
    if (profiles && profiles[n]) return true;
  }

  const keys = Object.keys(users || {});
  for (let i = 0; i < keys.length; i++) {
    const rec = users[keys[i]];
    if (rec && String(rec.naid || '') === n) return true;
  }
  return false;
}

function createUniqueAccountNaid(StateManager, users) {
  for (let i = 0; i < 100; i++) {
    const candidate = createAccountNaid();
    if (!isNaidInUse(StateManager, users, candidate)) return candidate;
  }
  return createAccountNaid();
}

function isValidEmailFormat(email) {
  const v = String(email || '').trim().toLowerCase();
  if (!v || v.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function normalizePlayerName(v) {
  if (Array.isArray(v)) v = v[0];
  return String(v || '').trim();
}

function getIncomingName(data) {
  return normalizePlayerName(
    data.name ||
    data.player_name ||
    data.username ||
    data.user_name ||
    data.playerName
  );
}

function validatePlayerName(name) {
  const n = normalizePlayerName(name);
  if (!n || n.length < 3) return { ok: false, error: 'ID_SPARX_ERROR_NAME_SHORT' };
  if (n.length > 12) return { ok: false, error: 'ID_SPARX_ERROR_NAME_SHORT' };
  if (!/^[A-Za-z0-9_]+$/.test(n)) return { ok: false, error: 'ID_SPARX_ERROR_NAME_INVALID' };
  return { ok: true, value: n };
}

function isNumericNaid(v) {
  return /^\d{6,20}$/.test(String(v || ""));
}

function normalizeGuestNaid(currentNaid, data) {
  const existing = String(currentNaid || "").trim();
  if (existing.indexOf('guest_') === 0) return existing;
  if (isNumericNaid(existing)) return existing;

  const info = data && typeof data.info === "object" ? data.info : {};
  const source = String(
    data.udid ||
    data.device_id ||
    data.openudid ||
    info.device_id ||
    info.udid ||
    data.naid ||
    ""
  ).trim();

  if (source) {
    const safe = source.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 64) || crypto.randomBytes(8).toString('hex');
    return 'guest_' + safe;
  }

  return 'guest_' + crypto.randomBytes(8).toString('hex');
}

function getSparxErrorResponse(errCode, flags) {
  const f = flags && typeof flags === 'object' ? flags : {};
  return {
    ts: nowTs(),
    err: errCode,
    result: {
      retry: !!f.retry,
      fatal: !!f.fatal,
      invalid_session: !!f.invalid_session
    }
  };
}

function parseClientVersion(data) {
  const raw = data && data.version !== undefined && data.version !== null ? String(data.version).trim() : '';
  return raw;
}

function parseClientPlatform(data) {
  const raw = data && data.platform !== undefined && data.platform !== null ? String(data.platform).trim() : '';
  return raw;
}

function parseClientBuild(data) {
    const version = parseClientVersion(data);
    if (!version) return 0;
    const legacy = version.match(/^1\.0\.(\d+)$/);
    if (legacy) return parseInt(legacy[1], 10) || 0;
    return 0;
}

function createSessionToken() {
  return crypto.randomBytes(16).toString('hex') + '|0';
}

module.exports = function(deps) {
  const StateManager = deps.StateManager;
  const SAVE_DIR = deps.SAVE_DIR;

  function usersFilePath() {
    return path.join(SAVE_DIR, 'users.json');
  }

  function loadUsers() {
    const file = usersFilePath();
    let users = {};

    try {
      if (fs.existsSync(file)) {
        const raw = fs.readFileSync(file, 'utf8');
        users = raw && raw.trim().length ? JSON.parse(raw) : {};
      }
    } catch (e) {
      users = {};
    }

    if (!users || typeof users !== 'object' || Array.isArray(users)) users = {};
    return users;
  }

  function saveUsers(users) {
    try {
      fs.writeFileSync(usersFilePath(), JSON.stringify(users || {}, null, 2));
    } catch (e) {}
  }

  function readCredentials(data) {
    const email = normalizeEmail(
      data.email ||
      data.mail ||
      data.user_email ||
      data.userEmail ||
      data.login
    );

    const password =
      data.password !== undefined ? data.password :
      (data.pass !== undefined ? data.pass :
      (data.pwd !== undefined ? data.pwd : data.user_password));

    const password2 =
      data.password2 !== undefined ? data.password2 :
      (data.pass2 !== undefined ? data.pass2 :
      (data.pwd2 !== undefined ? data.pwd2 : data.user_password2));

    return { email, password, password2 };
  }

  function getDeviceIds(data) {
    const info = data && typeof data.info === 'object' ? data.info : {};
    const candidates = [
      data.device_id,
      data.deviceId,
      data.udid,
      data.openudid,
      data.odin1,
      data.ifa,
      data.mac,
      data.device,
      info.device_id,
      info.udid,
      info.openudid,
      info.odin1,
      info.ifa,
      info.mac,
      info.model
    ];

    const out = [];
    for (let i = 0; i < candidates.length; i++) {
      const v = String(candidates[i] || '').trim();
      if (!v) continue;
      if (out.indexOf(v) !== -1) continue;
      out.push(v);
    }
    return out;
  }

  function bindDevicesToUserRecord(rec, deviceIds) {
    if (!rec || !deviceIds || !deviceIds.length) return;
    if (!Array.isArray(rec.devices)) rec.devices = [];
    for (let i = 0; i < deviceIds.length; i++) {
      if (rec.devices.indexOf(deviceIds[i]) === -1) rec.devices.push(deviceIds[i]);
    }
  }

  function removeGuestProfile(naid) {
    const key = String(naid || '');
    if (!key || typeof StateManager._loadProfiles !== 'function' || typeof StateManager._writeProfiles !== 'function') return;
    const profiles = StateManager._loadProfiles();
    if (profiles && profiles[key]) {
      delete profiles[key];
      StateManager._writeProfiles(profiles);
    }
  }

  function resolveNaid(data, parsedUrl) {
    const direct = data.naid || data.openudid || data.player_id || data.device_id || data.udid;
    if (direct) return String(direct);

    const pathname = String(parsedUrl && parsedUrl.pathname ? parsedUrl.pathname : '');
    if (pathname.indexOf('/ds/') === 0) {
      const seg = pathname.split('/')[2];
      if (seg) {
        const byUid = StateManager.findNaidByUid(String(seg));
        if (byUid) return String(byUid);
      }
    }

    if (data.uid !== undefined && data.uid !== null) {
      const byUid = StateManager.findNaidByUid(String(data.uid));
      if (byUid) return String(byUid);
    }

    const stoken = data.stoken || data.session || data.token || data.st || data.s;
    if (stoken) {
      const found = StateManager.findNaidByStoken(String(stoken));
      if (found) return String(found);
    }

    return 'guest';
  }

  function fillProfileSave(state, profile) {
    if (!state.result) state.result = {};
    if (!state.result.profile) state.result.profile = {};
    state.result.profile.uid = profile.uid || state.result.profile.uid || createUidFromState(StateManager);
    state.result.profile.name = profile.name || state.result.profile.name || '';
    state.result.profile.email = profile.email || '';
    state.result.profile.loggedIn = !!profile.loggedIn;
    state.result.profile.guest = !profile.loggedIn;
    state.result.profile.created = profile.created || state.result.profile.created || Date.now();
    return state;
  }

  function buildAuthPayload(profile, state) {
    const carsById = getCarsByUid(state.result.cars || {}, profile.uid || '1001');
    const carsArr = carsObjToArray(carsById, profile.uid || '1001');
    const uid = profile.uid;

    return {
      success: true,
      ts: nowTs(),
      stoken: profile.stoken,
      naid: profile.naid,
      player_id: profile.naid,
      uid: uid,
      loggedIn: !!profile.loggedIn,
      guest: !profile.loggedIn,
      is_guest: !profile.loggedIn,
      email: profile.email || '',
      account: profile.email || '',
      user: {
        uid: uid,
        id: uid,
        userId: uid,
        name: profile.name,
        naid: profile.naid,
        email: profile.email || '',
        loggedIn: !!profile.loggedIn,
        guest: !profile.loggedIn
      },
      data: {
        profile: state.result.profile,
        user: {
          uid: uid,
          name: profile.name || '',
          naid: profile.naid,
          email: profile.email || '',
          guest: !profile.loggedIn
        },
        cars: carsArr
      }
    };
  }

  function applyIncomingName(profile, data) {
    const incomingName = getIncomingName(data);
    const check = validatePlayerName(incomingName);
    if (check.ok) profile.name = check.value;
  }

  function getClientVersion(data) {
      const v = parseClientVersion(data);
      if (!v) return null;
      const m = v.match(/^(\d+)\.(\d+)\.(\d+)$/);
      if (!m) return null;
      const major = parseInt(m[1], 10);
      if (major <= 1) return null;
      return { major: major, minor: parseInt(m[2], 10), patch: parseInt(m[3], 10) };
  }

  function applyClientInfo(profile, data) {
      const clientVersion = parseClientVersion(data);
      const clientPlatform = parseClientPlatform(data);
      const clientBuild = parseClientBuild(data);
      if (clientVersion) profile.clientVersion = clientVersion;
      if (clientPlatform) profile.clientPlatform = clientPlatform;
      if (clientBuild > 0) {
          profile.clientBuild = clientBuild;
      } else if (getClientVersion(data)) {
          profile.clientBuild = 0;
      }
      if (clientVersion || clientPlatform) profile.clientInfoUpdatedAt = Date.now();
  }

  function resolveIncomingStoken(data) {
    return String(data.stoken || '').trim();
  }

  function isNameTaken(naid, name) {
    const profiles = typeof StateManager._loadProfiles === 'function' ? StateManager._loadProfiles() : {};
    const keys = Object.keys(profiles || {});
    const target = String(name || '').toLowerCase();
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (String(k) === String(naid)) continue;
      const p = profiles[k];
      const existing = p && p.name ? String(p.name).trim().toLowerCase() : '';
      if (existing && existing === target) return true;
    }
    return false;
  }

  function resetProfileToGuest(naid) {
    const profile = StateManager.ensureProfile(String(naid || 'guest'));
    profile.email = '';
    profile.loggedIn = false;
    profile.guest = true;
    StateManager.saveProfile(profile);
    return profile;
  }

  function handleKabamName(req, res, body, parsedUrl) {
    const data = parseBodyObject(body, parsedUrl);
    const naid = resolveNaid(data, parsedUrl);
    const profile = StateManager.ensureProfile(String(naid));

    const incomingName = getIncomingName(data);
    const check = validatePlayerName(incomingName);
    if (!check.ok) return sendJson(res, getSparxErrorResponse(check.error));
    if (isNameTaken(profile.naid, check.value)) {
      return sendJson(res, getSparxErrorResponse('ID_SPARX_ERROR_NAME_TAKEN'));
    }

    profile.name = check.value;
    ensureUserIdentityFields(profile);
    StateManager.saveProfile(profile);

    const state = fillProfileSave(StateManager.loadSave(profile.naid), profile);
    state.result.profile.name = profile.name;
    StateManager.writeSave(state, profile.naid);

    return sendJson(res, {
      ts: nowTs(),
      result: buildAuthPayload(profile, state)
    });
  }

  function handlePing(req, res, body, parsedUrl) {
    return sendJson(res, { ts: nowTs() });
  }

  function handleAuth(req, res, body, parsedUrl) {
    const data = parseBodyObject(body, parsedUrl);
    const pathname = String(parsedUrl && parsedUrl.pathname ? parsedUrl.pathname : '');
    const isRegister = pathname.indexOf('/register') !== -1 || String(data.register || data.is_register || '') === '1';
    const isUpgrade = pathname.indexOf('/upgrade') !== -1;
    const isLogin = pathname.indexOf('/login') !== -1;
    const isGuestEndpoint =
      pathname.indexOf('/kabam/guest') !== -1 ||
      pathname === '/guest' ||
      pathname.indexOf('/guest/') === 0;

    let naid = resolveNaid(data, parsedUrl);
    const guestNaidBeforeAuth = String(naid);
    const creds = readCredentials(data);
    const deviceIds = getDeviceIds(data);
    const users = loadUsers();
    let loggedIn = false;

    if (creds.email && creds.password !== undefined && creds.password !== null) {
      if (isRegister || isUpgrade) {
        const pw = String(creds.password || '');
        const pw2 = creds.password2 !== undefined && creds.password2 !== null ? String(creds.password2) : '';

        if (!isValidEmailFormat(creds.email)) {
          return sendJson(res, getSparxErrorResponse('ID_SPARX_ERROR_INVALID_EMAIL'));
        }
        if (pw.length < 7) {
          return sendJson(res, getSparxErrorResponse('ID_SPARX_ERROR_PASSWORD_LENGTH'));
        }
        if (pw2 && pw2 !== pw) {
          return sendJson(res, getSparxErrorResponse('ID_SPARX_ERROR_PASSWORDS_DONT_MATCH'));
        }
        if (users[creds.email]) {
          return sendJson(res, getSparxErrorResponse('ID_SPARX_ERROR_ACCOUNT_EXISTS'));
        }

        const hp = hashPassword(pw);
        const profile = StateManager.ensureProfile(String(naid));
        ensureUserIdentityFields(profile);
        const naidNew = createUniqueAccountNaid(StateManager, users);
        const uidToUse = profile.uid || createUidFromState(StateManager);

        users[creds.email] = {
          salt: hp.salt,
          hash: hp.hash,
          naid: naidNew,
          uid: uidToUse,
          ts: nowTs(),
          devices: []
        };
        bindDevicesToUserRecord(users[creds.email], deviceIds);

        saveUsers(users);
        StateManager.migrateSave(guestNaidBeforeAuth, naidNew);
        removeGuestProfile(guestNaidBeforeAuth);

        naid = naidNew;
        profile.naid = naidNew;
        profile.uid = uidToUse;
        profile.email = creds.email;
        profile.loggedIn = true;
        profile.guest = false;
        StateManager.saveProfile(profile);
        loggedIn = true;
      } else if (isLogin) {
        const rec = users[creds.email];
        if (!rec || !rec.naid || !rec.salt || !rec.hash) {
          if (rec && (!rec.naid || !rec.salt || !rec.hash)) {
            delete users[creds.email];
            saveUsers(users);
          }
          resetProfileToGuest(naid);
          return sendJson(res, getSparxErrorResponse('ID_SPARX_ERROR_ACCOUNT_DOESNT_EXISTS', {
            retry: false,
            fatal: false,
            invalid_session: false
          }));
        }

        if (!verifyPassword(String(creds.password), rec.salt, rec.hash)) {
          resetProfileToGuest(naid);
          return sendJson(res, getSparxErrorResponse('ID_SPARX_ERROR_INVALID_CREDENTIALS'));
        }

        naid = String(rec.naid);
        const profile = StateManager.ensureProfile(naid);
        ensureUserIdentityFields(profile);
        if (rec.uid && (!profile.uid || String(profile.uid).trim() === '')) profile.uid = String(rec.uid);
        bindDevicesToUserRecord(rec, deviceIds);
        saveUsers(users);
        profile.email = creds.email;
        profile.loggedIn = true;
        profile.guest = false;
        StateManager.saveProfile(profile);
        loggedIn = true;
      } else {
        const rec = users[creds.email];
        if (rec && rec.naid && rec.salt && rec.hash && verifyPassword(String(creds.password), rec.salt, rec.hash)) {
          naid = String(rec.naid);
          const profile = StateManager.ensureProfile(naid);
          ensureUserIdentityFields(profile);
        ensureUserIdentityFields(profile);
          if (rec.uid && (!profile.uid || String(profile.uid).trim() === '')) profile.uid = String(rec.uid);
            bindDevicesToUserRecord(rec, deviceIds);
          saveUsers(users);
          profile.email = creds.email;
          profile.loggedIn = true;
          profile.guest = false;
          StateManager.saveProfile(profile);
          loggedIn = true;
        } else if (rec && rec.naid) {
          resetProfileToGuest(naid);
          return sendJson(res, getSparxErrorResponse('ID_SPARX_ERROR_INVALID_CREDENTIALS'));
        } else {
          resetProfileToGuest(naid);
          return sendJson(res, getSparxErrorResponse('ID_SPARX_ERROR_ACCOUNT_DOESNT_EXISTS', {
            retry: false,
            fatal: false,
            invalid_session: false
          }));
        }
      }
    } else {
      if (isGuestEndpoint) {
        naid = normalizeGuestNaid(resolveNaid(data, parsedUrl), data);
      } else if (isRegister) {
        naid = normalizeGuestNaid(naid, data);
      } else if (naid === 'guest') {
        naid = 'guest_' + crypto.randomBytes(8).toString('hex');
      }

      const profile = StateManager.ensureProfile(String(naid));
      ensureUserIdentityFields(profile);
      if (isGuestEndpoint) {
        profile.email = '';
        profile.loggedIn = false;
        profile.guest = true;
      }
      StateManager.saveProfile(profile);
      loggedIn = !!profile.loggedIn;
    }

    const profile = StateManager.getProfile(String(naid));
    ensureUserIdentityFields(profile);

    applyIncomingName(profile, data);
    applyClientInfo(profile, data);
    const incomingStoken = resolveIncomingStoken(data);
    if (incomingStoken) {
      profile.stoken = incomingStoken;
    } else if (!profile.stoken) {
      profile.stoken = createSessionToken();
    }

    if (creds.email && loggedIn) {
      profile.email = creds.email;
      profile.loggedIn = true;
      profile.guest = false;
    }
    StateManager.saveProfile(profile);

    const state = fillProfileSave(StateManager.loadSave(naid), profile);
    StateManager.writeSave(state, naid);

    return sendJson(res, {
      ts: nowTs(),
      result: buildAuthPayload(profile, state)
    });
  }

  handleAuth.handleKabamName = handleKabamName;
  handleAuth.handlePing = handlePing;
  return handleAuth;
};
