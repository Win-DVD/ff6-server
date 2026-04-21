const crypto = require('crypto');
const url = require('url');
const { sendJson, parseBodyObject } = require('../utils/common');

const GACHA_TABLES = [
  {
    tableID: 0, softCost: 1000, hardCost: 5, multiplier: 1, carsRequired: 0,
    items: [
      { type: 'sc', weight: 50, count: 800 },
      { type: 'fuel', weight: 25, count: 2 },
      { type: 'pu', weight: 13, count: 1 },
      { type: 'vu', weight: 10, count: 1 },
      { type: 'ct', weight: 2, count: 1 }
    ]
  },
  {
    tableID: 1, softCost: 3000, hardCost: 10, multiplier: 5, carsRequired: 2,
    items: [
      { type: 'sc', weight: 45, count: 2500 },
      { type: 'fuel', weight: 25, count: 5 },
      { type: 'pu', weight: 15, count: 2 },
      { type: 'vu', weight: 12, count: 2 },
      { type: 'ct', weight: 3, count: 2 }
    ]
  },
  {
    tableID: 2, softCost: 5000, hardCost: 20, multiplier: 10, carsRequired: 4,
    items: [
      { type: 'sc', weight: 36, count: 5000 },
      { type: 'fuel', weight: 20, count: 8 },
      { type: 'pu', weight: 14, count: 2 },
      { type: 'vu', weight: 12, count: 2 },
      { type: 'ct', weight: 10, count: 4 },
      { type: 'lc', weight: 4, count: 1, car: 'car_attribute_ford_escort_rs2000', carClass: 2 },
      { type: 'lc', weight: 4, count: 1, car: 'car_attribute_ford_escort_rs2000_ff6', carClass: 2 }
    ]
  },
  {
    tableID: 3, softCost: 8000, hardCost: 30, multiplier: 20, carsRequired: 6,
    items: [
      { type: 'sc', weight: 28, count: 10000 },
      { type: 'fuel', weight: 15, count: 15 },
      { type: 'pu', weight: 12, count: 2 },
      { type: 'vu', weight: 10, count: 2 },
      { type: 'ct', weight: 10, count: 8 },
      { type: 'lc', weight: 5, count: 1, car: 'car_attribute_ford_mustang_mach1_69', carClass: 3 },
      { type: 'lc', weight: 5, count: 1, car: 'car_attribute_ford_mustang_mach1_69_ff6', carClass: 3 },
      { type: 'lc', weight: 5, count: 1, car: 'car_attribute_dodge_charger_daytona', carClass: 4 },
      { type: 'lc', weight: 5, count: 1, car: 'car_attribute_dodge_challenger_srt8', carClass: 5 },
      { type: 'hc', weight: 3, count: 1, car: 'car_attribute_dodge_charger_daytona_ff6', carClass: 5 },
      { type: 'hc', weight: 2, count: 1, car: 'car_attribute_dodge_challenger_srt8_2013_ff6', carClass: 5 }
    ]
  }
];

const CAR_DATA = {
  ford_escort_rs2000: { q: 12.93, c: 2 },
  ford_escort_rs2000_ff6: { q: 12.55, c: 2 },
  ford_mustang_mach1_69: { q: 11.87, c: 3 },
  ford_mustang_mach1_69_ff6: { q: 11.60, c: 3 },
  dodge_charger_daytona: { q: 11.18, c: 4 },
  dodge_charger_daytona_ff6: { q: 10.11, c: 5 },
  dodge_challenger_srt8: { q: 11.19, c: 5 },
  dodge_challenger_srt8_2013_ff6: { q: 10.07, c: 5 }
};

const REWARD_CARS_2X = [
  { car: 'car_attribute_ford_escort_rs2000', tokenCost: 20, carClass: 2 },
  { car: 'car_attribute_ford_escort_rs2000_ff6', tokenCost: 40, carClass: 2 },
  { car: 'car_attribute_ford_mustang_mach1_69', tokenCost: 25, carClass: 3 },
  { car: 'car_attribute_ford_mustang_mach1_69_ff6', tokenCost: 45, carClass: 3 },
  { car: 'car_attribute_dodge_charger_daytona', tokenCost: 30, carClass: 4 },
  { car: 'car_attribute_dodge_charger_daytona_ff6', tokenCost: 50, carClass: 4 },
  { car: 'car_attribute_dodge_challenger_srt8', tokenCost: 30, carClass: 4 },
  { car: 'car_attribute_dodge_challenger_srt8_2013_ff6', tokenCost: 55, carClass: 5 }
];

const GACHA_TABLES_2X = GACHA_TABLES.map(t => ({
  gachaTableID: t.tableID,
  softCost: t.softCost,
  hardCost: t.hardCost,
  multiplier: t.multiplier,
  carsRequired: t.carsRequired
}));

function trimCarPrefix(name) {
  const s = String(name || '');
  const prefix = 'car_attribute_';
  return s.indexOf(prefix) === 0 ? s.slice(prefix.length) : s;
}

function getCarData(name) {
  return CAR_DATA[trimCarPrefix(name)] || { q: 15.0, c: 0 };
}

function weightedPick(items) {
  let total = 0;
  for (let i = 0; i < items.length; i++) total += items[i].weight;

  let rand = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    rand -= items[i].weight;
    if (rand <= 0) return items[i];
  }

  return items[items.length - 1];
}

function resolveNaid(req, StateManager) {
  try {
    const parsedUrl = url.parse(req.url, true);
    const stoken = parsedUrl.query && parsedUrl.query.stoken ? String(parsedUrl.query.stoken) : '';
    if (stoken) {
      const naid = StateManager.findNaidByStoken(stoken);
      if (naid) return String(naid);
    }
  } catch (e) {}

  return 'guest';
}

function ensureCarRecord(state, uid, carId, trimmed, carClass) {
  const carData = getCarData(trimmed);
  return {
    uid: uid,
    _id: carId,
    r: {
      c: carClass || carData.c,
      n: trimmed,
      p: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      vu: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      eu: [-1, -1, -1, -1, -1, -1, -1, -1, -1],
      ut: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      q: carData.q
    },
    q: carData.q
  };
}

function applyReward(state, reward) {
  if (!state.result.inventory) state.result.inventory = {};
  if (!state.result.profile) state.result.profile = {};

  if (reward.type === 'sc') state.result.profile.coins = (state.result.profile.coins || 0) + reward.count;
  else if (reward.type === 'fuel') state.result.profile.energy = Math.min((state.result.profile.energy || 0) + reward.count, 100);
  else if (reward.type === 'pu') state.result.inventory.pu = (state.result.inventory.pu || 0) + reward.count;
  else if (reward.type === 'vu') state.result.inventory.vu = (state.result.inventory.vu || 0) + reward.count;
  else if (reward.type === 'ct') state.result.inventory.ct = (state.result.inventory.ct || 0) + reward.count;
}

function getClientVersion(profile) {
    const v = String(profile && profile.clientVersion != null ? profile.clientVersion : '').trim();
    const m = v.match(/^(\d+)\.(\d+)\.(\d+)$/);
    if (!m) return null;
    const major = parseInt(m[1], 10);
    if (major <= 1) return null;
    return { major: major, minor: parseInt(m[2], 10), patch: parseInt(m[3], 10) };
}

function parseClientBuild(profile) {
    if (!getClientVersion(profile)) {
        const fromProfile = parseInt(profile && profile.clientBuild != null ? profile.clientBuild : 0, 10) || 0;
        if (fromProfile > 0) return fromProfile;
    }
    const v = String(profile && profile.clientVersion != null ? profile.clientVersion : '').trim();
    const legacy = v.match(/^1\.0\.(\d+)$/);
    if (legacy) return parseInt(legacy[1], 10) || 0;
    return 0;
}

function isOldGachaBuild(profile) {
    if (getClientVersion(profile)) return false;
    const b = parseClientBuild(profile);
    return b >= 11902 && b <= 12160;
}

function isGachaApi3Build(profile) {
    if (getClientVersion(profile)) return false;
    const b = parseClientBuild(profile);
    return b >= 13131 && b <= 13274;
}

function isGachaApi5Build(profile) {
    if (getClientVersion(profile)) return false;
    const b = parseClientBuild(profile);
    return b >= 13313 && b <= 13598;
}

function resolveGachaProtocol(req, body, profile) {
  const parsedUrl = url.parse(req.url, true);
  const params = parseBodyObject(body, parsedUrl);
  const apiVersion = parseInt(String(params.api || 0), 10) || 0;
  if (apiVersion === 3) return 'api3';
  if (apiVersion === 5) return 'api5';
  if (isGachaApi3Build(profile)) return 'api3';
  if (isGachaApi5Build(profile)) return 'api5';
  if (isOldGachaBuild(profile)) return 'old';
  return 'none';
}

function nowTs() {
  return Math.floor(Date.now() / 1000);
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

function blankGachaResponse(pathname) {
  if (pathname === '/gacha/getTokens') return { result: { tokens: [] } };
  if (pathname === '/gacha/getRewardCars') return { result: [] };
  if (pathname === '/gacha/getTables') return { result: [] };
  if (pathname === '/gacha/getAttractImages') return { result: [] };
  return { ts: Math.floor(Date.now() / 1000) };
}

function gacha2xResponse(pathname) {
  if (pathname === '/gacha/getTokens') return { result: { tokens: [] } };
  if (pathname === '/gacha/getRewardCars') return { result: REWARD_CARS_2X };
  if (pathname === '/gacha/getTables') return { result: GACHA_TABLES_2X };
  if (pathname === '/gacha/getAttractImages') {
    return {
      result: REWARD_CARS_2X.map(r => ({ carName: 'ui_thumbnails/' + r.car }))
    };
  }
  return { ts: Math.floor(Date.now() / 1000) };
}

function makeGachaApiSetForGroup(group) {
  function mapPrize(item) {
    return { type: item.type, data: item.car ? item.car : item.type };
  }

  const boxes = GACHA_TABLES.map(t => ({
    name: 'box_' + String(t.tableID),
    token: 'ct',
    image: 'ui_gacha/Gacha_Box_' + String(t.tableID),
    multiplier: t.multiplier,
    possiblePrizes: t.items.map(mapPrize),
    sc: { cost: t.softCost, xp: 1 },
    hc: { cost: t.hardCost, xp: 1 },
    tokenc: { cost: Math.max(1, t.multiplier), xp: 1 }
  }));

  const possiblePrizes = [];
  for (let i = 0; i < GACHA_TABLES.length; i++) {
    for (let j = 0; j < GACHA_TABLES[i].items.length; j++) {
      possiblePrizes.push(mapPrize(GACHA_TABLES[i].items[j]));
    }
  }

  return {
    version: '1',
    name: String(group || 'base') + '_set',
    attracts: REWARD_CARS_2X.map(r => 'ui_thumbnails/' + r.car),
    possiblePrizes: possiblePrizes,
    boxes: boxes
  };
}

module.exports = function createGachaHandler(deps) {
  const StateManager = deps.StateManager;
  const handleCarsSave = deps.handleCarsSave;
  const getWsServers = deps.getWsServers;
  const logInfo = deps.logInfo;
  const logError = deps.logError;

  function pushCarToClients(carRecord) {
    try {
      const msg = JSON.stringify({ component: 'CarManager', message: 'add', payload: carRecord });
      const servers = getWsServers ? getWsServers() : {};
      const list = [servers.wss, servers.ws];

      for (let i = 0; i < list.length; i++) {
        const srv = list[i];
        if (!srv || !srv.clients) continue;
        srv.clients.forEach(client => {
          try {
            if (client.readyState === 1) client.send(msg);
          } catch (e) {}
        });
      }

      logInfo('[Gacha] WS push CarManager.add sent');
    } catch (e) {
      logError('[Gacha] WS push error: ' + e.message);
    }
  }

  function pushSyncToClients(componentName) {
    try {
      const msg = JSON.stringify({ component: componentName, message: 'sync', payload: {} });
      const servers = getWsServers ? getWsServers() : {};
      const list = [servers.wss, servers.ws];

      for (let i = 0; i < list.length; i++) {
        const srv = list[i];
        if (!srv || !srv.clients) continue;
        srv.clients.forEach(client => {
          try {
            if (client.readyState === 1) client.send(msg);
          } catch (e) {}
        });
      }
    } catch (e) {}
  }

  function saveAndBroadcastCar(naid, state, carName, carClass) {
    const uid = (state.result.profile && state.result.profile.uid) ? String(state.result.profile.uid) : naid;
    const carId = crypto.randomBytes(12).toString('hex');
    const trimmed = trimCarPrefix(carName);

    if (!state.result.cars) state.result.cars = {};
    if (!state.result.cars[uid]) state.result.cars[uid] = {};

    state.result.cars[uid][carId] = ensureCarRecord(state, uid, carId, trimmed, carClass);
    StateManager.writeSave(state, naid);

    const profile = StateManager.getProfile ? StateManager.getProfile(naid) : {};
    const stoken = profile && profile.stoken ? profile.stoken : '';
    const carBody = JSON.stringify({ car: state.result.cars[uid][carId] });

    try {
      const fakeReq = { method: 'POST', url: '/cars/save?stoken=' + encodeURIComponent(stoken), headers: { 'content-type': 'application/json' } };
      const fakeRes = { writeHead: function() {}, end: function() {} };
      handleCarsSave(fakeReq, fakeRes, carBody);
    } catch (e) {
      logError('[Gacha] callCarsSave: ' + e.message);
    }

    pushCarToClients(state.result.cars[uid][carId]);
    return { uid, carId, trimmed };
  }

  function handlePick(req, res, body) {
    try {
      const parsedUrl = url.parse(req.url, true);
      const params = parseBodyObject(body, parsedUrl);

      const naid = resolveNaid(req, StateManager);
      const profile = StateManager.getProfile ? StateManager.getProfile(naid) : null;
      const protocol = resolveGachaProtocol(req, body, profile);
      if (protocol === 'api3') return handlePickApi3(req, res, body, naid);
      if (protocol === 'api5') return handlePickApi5(req, res, body, naid);

      const tableID = parseInt(params.gachaTableID !== undefined ? params.gachaTableID : 0, 10);
      const softPaid = parseInt(params.softPaid || 0, 10);
      const hardPaid = parseInt(params.hardPaid || 0, 10);
      const table = GACHA_TABLES.find(t => t.tableID === tableID);

      logInfo('[Gacha] pick tableID=' + tableID + ' softPaid=' + softPaid + ' hardPaid=' + hardPaid);

      if (!table) return sendJson(res, getSparxErrorResponse('ID_SPARX_ERROR_UNKNOWN'));

      if (!isOldGachaBuild(profile)) return sendJson(res, { ts: Math.floor(Date.now() / 1000) });
      const state = StateManager.loadSave(naid);
      const picked = weightedPick(table.items);
      const result = { type: picked.type, count: picked.count };

      applyReward(state, picked);
      StateManager.writeSave(state, naid);

      if (picked.car && (picked.type === 'hc' || picked.type === 'lc')) {
        const carResult = saveAndBroadcastCar(naid, StateManager.loadSave(naid), picked.car, picked.carClass);
        result.car = picked.car;
        result._id = carResult.carId;
        return setTimeout(() => sendJson(res, { result, ts: Math.floor(Date.now() / 1000) }), 800);
      }

      return sendJson(res, { result, ts: Math.floor(Date.now() / 1000) });
    } catch (e) {
      logError('[Gacha] pick FATAL: ' + e.message);
      return sendJson(res, getSparxErrorResponse('ID_SPARX_ERROR_UNKNOWN'));
    }
  }

  function handlePickApi5(req, res, body, naid) {
    try {
      const parsedUrl = url.parse(req.url, true);
      const params = parseBodyObject(body, parsedUrl);

      const group = String(params.group || 'base');
      const version = String(params.version || '1');
      const setName = String(params.set || (group + '_set'));
      const boxName = String(params.box || '');
      const paymentRaw = String(params.payment || 'token').toLowerCase();
      const payment = paymentRaw === 'hc' ? 'hard' : (paymentRaw === 'sc' ? 'soft' : paymentRaw);

      const tableID = parseInt(boxName.replace('box_', ''), 10);
      const table = GACHA_TABLES.find(t => t.tableID === tableID);
      if (!table) return sendJson(res, getSparxErrorResponse('ID_SPARX_ERROR_UNKNOWN'));

      const expectedSet = makeGachaApiSetForGroup(group);
      if (version !== expectedSet.version || setName !== expectedSet.name) return sendJson(res, getSparxErrorResponse('ID_SPARX_ERROR_UNKNOWN'));

      const state = StateManager.loadSave(naid);
      if (!state.result.profile) state.result.profile = {};
      if (!state.result.inventory) state.result.inventory = {};
      let hardSpent = false;

      if (payment === 'token') {
        const tokenCost = Math.max(1, table.multiplier);
        const balance = state.result.inventory.ct || 0;
        if (balance < tokenCost) return sendJson(res, getSparxErrorResponse('ID_SPARX_ERROR_UNKNOWN'));
        state.result.inventory.ct = balance - tokenCost;
      } else if (payment === 'soft') {
        const coins = state.result.profile.coins || 0;
        if (coins < table.softCost) return sendJson(res, getSparxErrorResponse('ID_SPARX_ERROR_UNKNOWN'));
        state.result.profile.coins = coins - table.softCost;
      } else if (payment === 'hard') {
        const gold = state.result.profile.gold || 0;
        if (gold < table.hardCost) return sendJson(res, getSparxErrorResponse('ID_SPARX_ERROR_UNKNOWN'));
        state.result.profile.gold = gold - table.hardCost;
        hardSpent = true;
      } else {
        return sendJson(res, getSparxErrorResponse('ID_SPARX_ERROR_UNKNOWN'));
      }

      const picked = weightedPick(table.items);
      applyReward(state, picked);
      StateManager.writeSave(state, naid);
      if (hardSpent) pushSyncToClients('WalletManager');

      const item = { type: picked.type, data: picked.car ? picked.car : picked.type, quantity: picked.count };
      const result = { softToPay: payment === 'soft' ? table.softCost : 0, xpToGive: 1, items: [item] };
      if (payment === 'token') result.balance = (StateManager.loadSave(naid).result.inventory || {}).ct || 0;

      if (picked.car && (picked.type === 'hc' || picked.type === 'lc')) {
        saveAndBroadcastCar(naid, StateManager.loadSave(naid), picked.car, picked.carClass);
      }

      return sendJson(res, { result, ts: Math.floor(Date.now() / 1000) });
    } catch (e) {
      logError('[Gacha] pick34 FATAL: ' + e.message);
      return sendJson(res, getSparxErrorResponse('ID_SPARX_ERROR_UNKNOWN'));
    }
  }

  function handlePickApi3(req, res, body, naid) {
    try {
      const parsedUrl = url.parse(req.url, true);
      const params = parseBodyObject(body, parsedUrl);

      const group = String(params.group || 'base');
      const version = String(params.version || '1');
      const setName = String(params.set || (group + '_set'));
      const boxName = String(params.box || '');
      const paymentRaw = String(params.payment || 'token').toLowerCase();
      const payment = paymentRaw === 'hc' ? 'hard' : (paymentRaw === 'sc' ? 'soft' : paymentRaw);

      const tableID = parseInt(boxName.replace('box_', ''), 10);
      const table = GACHA_TABLES.find(t => t.tableID === tableID);
      if (!table) return sendJson(res, getSparxErrorResponse('ID_SPARX_ERROR_UNKNOWN'));

      const expectedSet = makeGachaApiSetForGroup(group);
      if (version !== expectedSet.version || setName !== expectedSet.name) return sendJson(res, getSparxErrorResponse('ID_SPARX_ERROR_UNKNOWN'));

      const state = StateManager.loadSave(naid);
      if (!state.result.profile) state.result.profile = {};
      if (!state.result.inventory) state.result.inventory = {};
      let hardSpent = false;

      if (payment === 'token') {
        const tokenCost = Math.max(1, table.multiplier);
        const balance = state.result.inventory.ct || 0;
        if (balance < tokenCost) return sendJson(res, getSparxErrorResponse('ID_SPARX_ERROR_UNKNOWN'));
        state.result.inventory.ct = balance - tokenCost;
      } else if (payment === 'soft') {
        const coins = state.result.profile.coins || 0;
        if (coins < table.softCost) return sendJson(res, getSparxErrorResponse('ID_SPARX_ERROR_UNKNOWN'));
        state.result.profile.coins = coins - table.softCost;
      } else if (payment === 'hard') {
        const gold = state.result.profile.gold || 0;
        if (gold < table.hardCost) return sendJson(res, getSparxErrorResponse('ID_SPARX_ERROR_UNKNOWN'));
        state.result.profile.gold = gold - table.hardCost;
        hardSpent = true;
      } else {
        return sendJson(res, getSparxErrorResponse('ID_SPARX_ERROR_UNKNOWN'));
      }

      const picked = weightedPick(table.items);
      applyReward(state, picked);
      StateManager.writeSave(state, naid);
      if (hardSpent) pushSyncToClients('WalletManager');

      if (picked.car && (picked.type === 'hc' || picked.type === 'lc')) {
        saveAndBroadcastCar(naid, StateManager.loadSave(naid), picked.car, picked.carClass);
      }

      const result = {
        type: picked.type,
        data: picked.car ? picked.car : picked.type,
        quantity: picked.count,
        softToPay: payment === 'soft' ? table.softCost : 0,
        xpToGive: 1
      };
      if (payment === 'token') result.balance = (StateManager.loadSave(naid).result.inventory || {}).ct || 0;

      return sendJson(res, { result, ts: Math.floor(Date.now() / 1000) });
    } catch (e) {
      logError('[Gacha] pickApi3 FATAL: ' + e.message);
      return sendJson(res, getSparxErrorResponse('ID_SPARX_ERROR_UNKNOWN'));
    }
  }

  function handleGetSetApi5(req, res, parsedUrl) {
    try {
      const groupsRaw = parsedUrl && parsedUrl.query && parsedUrl.query.groups ? String(parsedUrl.query.groups) : 'base';
      const groups = groupsRaw.split(',').map(s => s.trim()).filter(Boolean);
      const result = {};
      const list = groups.length ? groups : ['base'];
      for (let i = 0; i < list.length; i++) result[list[i]] = makeGachaApiSetForGroup(list[i]);
      return sendJson(res, { result, ts: Math.floor(Date.now() / 1000) });
    } catch (e) {
      logError('[Gacha] getSetApi5 FATAL: ' + e.message);
      return sendJson(res, getSparxErrorResponse('ID_SPARX_ERROR_UNKNOWN'));
    }
  }

  function handleGetSetApi3(req, res, parsedUrl) {
    try {
      const group = parsedUrl && parsedUrl.query && parsedUrl.query.group ? String(parsedUrl.query.group) : 'base';
      return sendJson(res, { result: makeGachaApiSetForGroup(group), ts: Math.floor(Date.now() / 1000) });
    } catch (e) {
      logError('[Gacha] getSetApi3 FATAL: ' + e.message);
      return sendJson(res, getSparxErrorResponse('ID_SPARX_ERROR_UNKNOWN'));
    }
  }

  function handleBuyCarWithTokens(req, res, body) {
    try {
      let params = {};
      try { params = JSON.parse(body || '{}'); } catch (e) {}

      const carName = params.carName || '';
      if (!carName) return sendJson(res, getSparxErrorResponse('ID_SPARX_ERROR_UNKNOWN'));

      const naid = resolveNaid(req, StateManager);
      const profile = StateManager.getProfile ? StateManager.getProfile(naid) : null;
      if (!isOldGachaBuild(profile)) return sendJson(res, { ts: Math.floor(Date.now() / 1000) });
      const state = StateManager.loadSave(naid);
      if (!state.result.inventory) state.result.inventory = {};

      const rewardCars = REWARD_CARS_2X;
      const entry = rewardCars.find(e => e.car === carName) || {};
      const tokenCost = entry.tokenCost || 10;
      const currentTokens = state.result.inventory.ct || 0;

      if (currentTokens < tokenCost) {
        return sendJson(res, getSparxErrorResponse('ID_SPARX_ERROR_UNKNOWN'));
      }

      state.result.inventory.ct = currentTokens - tokenCost;
      StateManager.writeSave(state, naid);

      const carClass = entry.carClass !== undefined ? entry.carClass : getCarData(carName).c;
      const carResult = saveAndBroadcastCar(naid, StateManager.loadSave(naid), carName, carClass);

      logInfo('[Gacha] buyCarWithTokens car=' + carName + ' tokens_spent=' + tokenCost + ' _id=' + carResult.carId);

      return setTimeout(() => sendJson(res, { result: { _id: carResult.carId, car: carName }, ts: Math.floor(Date.now() / 1000) }), 800);
    } catch (e) {
      logError('[Gacha] buyCarWithTokens FATAL: ' + e.message);
      return sendJson(res, getSparxErrorResponse('ID_SPARX_ERROR_UNKNOWN'));
    }
  }

  function handleCarTokenCosts(req, res) {
    const naid = resolveNaid(req, StateManager);
    const profile = StateManager.getProfile ? StateManager.getProfile(naid) : null;
    if (isGachaApi3Build(profile)) {
      return sendJson(res, {
        result: REWARD_CARS_2X.map(r => ({ car: r.car, tokens: r.tokenCost })),
        ts: Math.floor(Date.now() / 1000)
      });
    }
    if (!isGachaApi5Build(profile)) return sendJson(res, { result: [] });
    return sendJson(res, {
      result: REWARD_CARS_2X.map(r => ({ car: r.car, tokens: r.tokenCost })),
      ts: Math.floor(Date.now() / 1000)
    });
  }

  const handle = function handle(req, res, body, parsedUrl, pathname) {
    const naid = resolveNaid(req, StateManager);
    const profile = StateManager.getProfile ? StateManager.getProfile(naid) : null;
    const protocol = resolveGachaProtocol(req, body, profile);
    if (pathname === '/gacha/getSet') {
      if (protocol === 'api3') return handleGetSetApi3(req, res, parsedUrl);
      if (protocol !== 'api5') return sendJson(res, { result: {}, ts: Math.floor(Date.now() / 1000) });
      return handleGetSetApi5(req, res, parsedUrl);
    }
    if (pathname === '/gacha/getTokens' && protocol === 'api3') {
      const state = StateManager.loadSave(naid);
      const ct = state && state.result && state.result.inventory ? (state.result.inventory.ct || 0) : 0;
      return sendJson(res, { result: [{ token: 'ct', count: ct }], ts: Math.floor(Date.now() / 1000) });
    }
    if (pathname === '/gacha/getTokens' && protocol === 'api5') {
      const state = StateManager.loadSave(naid);
      const ct = state && state.result && state.result.inventory ? (state.result.inventory.ct || 0) : 0;
      return sendJson(res, { result: [{ token: 'ct', count: ct }], ts: Math.floor(Date.now() / 1000) });
    }
    if (pathname === '/gacha/getTokens' || pathname === '/gacha/getRewardCars' || pathname === '/gacha/getTables' || pathname === '/gacha/getAttractImages') {
      return sendJson(res, isOldGachaBuild(profile) ? gacha2xResponse(pathname) : blankGachaResponse(pathname));
    }
    if (pathname === '/gacha/pick') return handlePick(req, res, body);
    if (pathname === '/gacha/buyCarWithTokens') return handleBuyCarWithTokens(req, res, body);
    return sendJson(res, getSparxErrorResponse('ID_SPARX_ERROR_UNKNOWN'));
  };

  handle.handleCarTokenCosts = handleCarTokenCosts;
  return handle;
};
