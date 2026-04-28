const fs = require('fs');
const util = require('util');
const crypto = require('crypto');
const querystring = require('querystring');

function timestamp() {
  return new Date().toISOString();
}

function pretty(obj) {
  return util.inspect(obj, { depth: null, colors: false });
}

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
  out.p = normalizeArrayLen(r.p, 11, -1);
  for (let i = 0; i < out.p.length; i++) {
    const partValue = parseInt(out.p[i], 10);
    out.p[i] = isFinite(partValue) && partValue >= -1 ? partValue : -1;
  }
  out.vu = normalizeArrayLen(r.vu, 9, 0);
  for (let i = 0; i < out.vu.length; i++) {
    const vuValue = parseInt(out.vu[i], 10);
    out.vu[i] = isFinite(vuValue) && vuValue >= 0 ? vuValue : 0;
  }
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

function parseRequestUrl(req) {
  const hasSocket = !!(req && req.socket);
  const isHttps = hasSocket && !!req.socket.encrypted;
  const protocol = isHttps ? 'https:' : 'http:';
  const host = (req && req.headers && req.headers.host) ? req.headers.host : 'localhost';
  const reqUrl = req && req.url ? req.url : '/';
  const parsed = new URL(reqUrl, protocol + '//' + host);
  const query = {};

  parsed.searchParams.forEach((value, key) => {
    if (Object.prototype.hasOwnProperty.call(query, key)) {
      if (Array.isArray(query[key])) query[key].push(value);
      else query[key] = [query[key], value];
    } else {
      query[key] = value;
    }
  });

  return {
    href: parsed.href,
    protocol: parsed.protocol,
    slashes: true,
    auth: (parsed.username || parsed.password) ? (parsed.username + ':' + parsed.password) : null,
    host: parsed.host,
    port: parsed.port,
    hostname: parsed.hostname,
    hash: parsed.hash,
    search: parsed.search,
    query: query,
    pathname: parsed.pathname,
    path: parsed.pathname + parsed.search
  };
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

module.exports = {
  fs,
  timestamp,
  pretty,
  safeJSONParse,
  trimCarPrefix,
  normalizeArrayLen,
  normalizeRecipe,
  normalizeCarRecord,
  carsObjToArray,
  carsArrayToObj,
  sendJson,
  parseBodyObject,
  parseRequestUrl,
  isCarRecordLike,
  getCarsByUid,
  ensureCarsNested
};
