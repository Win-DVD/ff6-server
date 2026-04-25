const url = require('url');
const { sendJson, parseBodyObject } = require('../utils/common');

module.exports = function(deps) {
  const StateManager = deps.StateManager;

  function resolveNaid(req, body, parsedUrlInput) {
    const parsedUrl = parsedUrlInput || url.parse(req.url, true);
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

    if (!naid && parsedUrl && parsedUrl.pathname && parsedUrl.pathname.indexOf('/wallet/') === 0) {
      const seg = parsedUrl.pathname.split('/')[2];
      if (seg) {
        const byUid = StateManager.findNaidByUid(String(seg));
        if (byUid) naid = String(byUid);
      }
    }

    if (!naid) naid = 'guest';
    return naid;
  }

  function ensureProfile(state) {
    if (!state.result) state.result = {};
    if (!state.result.profile) state.result.profile = { coins: 0, gold: 0, xp: 0, energy: 10 };
  }

  function getGoldValue(value) {
    let gold = value;
    if (Array.isArray(gold)) gold = gold[0];
    gold = parseInt(String(gold), 10);
    if (!isFinite(gold) || gold < 0) gold = 0;
    return gold;
  }

  function getAmount(params) {
    let rawVal = (params.value !== undefined && params.value !== null) ? params.value
              : ((params.amount !== undefined && params.amount !== null) ? params.amount
              : ((params.v !== undefined && params.v !== null) ? params.v : 0));
    if (Array.isArray(rawVal)) rawVal = rawVal[0];

    let val = parseInt(String(rawVal), 10);
    if (!isFinite(val) || val < 0) val = 0;
    return val;
  }

  function handleWalletBalance(req, res, body, pathname) {
    const parsedUrl = url.parse(req.url, true);
    const naid = resolveNaid(req, body, parsedUrl);
    const state = StateManager.loadSave(naid);

    ensureProfile(state);
    state.result.profile.gold = getGoldValue(state.result.profile.gold);

    return sendJson(res, {
      ts: Math.floor(Date.now() / 1000),
      result: { balance: state.result.profile.gold }
    });
  }

  function handleWalletDebit(req, res, body) {
    const parsedUrl = url.parse(req.url, true);
    const naid = resolveNaid(req, body, parsedUrl);
    const state = StateManager.loadSave(naid);
    const params = parseBodyObject(body, parsedUrl);

    ensureProfile(state);

    const val = getAmount(params);
    const current = getGoldValue(state.result.profile.gold);

    if (val > 0 && current < val) {
      return sendJson(res, {
        ts: Math.floor(Date.now() / 1000),
        err: 'ID_SPARX_ERROR_UNKNOWN',
        result: { retry: false, fatal: false, invalid_session: false }
      });
    }

    if (val > 0) {
      state.result.profile.gold = current - val;
      if (state.result.profile.gold < 0) state.result.profile.gold = 0;
      StateManager.writeSave(state, naid);
    } else {
      state.result.profile.gold = current;
    }

    return sendJson(res, {
      ts: Math.floor(Date.now() / 1000),
      result: { balance: state.result.profile.gold || 0 }
    });
  }

  function handleWalletCredit(req, res, body) {
    const parsedUrl = url.parse(req.url, true);
    const naid = resolveNaid(req, body, parsedUrl);
    const state = StateManager.loadSave(naid);
    const params = parseBodyObject(body, parsedUrl);

    ensureProfile(state);

    const val = getAmount(params);
    const current = getGoldValue(state.result.profile.gold);

    if (val > 0) {
      state.result.profile.gold = current + val;
      if (state.result.profile.gold < 0) state.result.profile.gold = 0;
      StateManager.writeSave(state, naid);
    } else {
      state.result.profile.gold = current;
    }

    return sendJson(res, {
      ts: Math.floor(Date.now() / 1000),
      result: { balance: state.result.profile.gold || 0 }
    });
  }

  function parseIntSafe(v, fallback) {
    const n = parseInt(v, 10);
    if (!isFinite(n)) return fallback;
    return n;
  }

  function applyCurrencyDelta(profile, type, delta) {
    const t = String(type || '').toLowerCase();
    if (t === 'sc' || t === 'coins' || t === 'soft') {
      const next = parseIntSafe(profile.coins, 0) + delta;
      profile.coins = next < 0 ? 0 : next;
      return t;
    }
    if (t === 'hc' || t === 'gold' || t === 'hard') {
      const next = parseIntSafe(profile.gold, 0) + delta;
      profile.gold = next < 0 ? 0 : next;
      return t;
    }
    return '';
  }

  function handleCurrencyDebit(req, res, body) {
    const parsedUrl = url.parse(req.url, true);
    const naid = resolveNaid(req, body, parsedUrl);
    const state = StateManager.loadSave(naid);
    const params = parseBodyObject(body, parsedUrl);

    ensureProfile(state);

    const amount = Math.max(0, parseIntSafe(params.q, 0));
    const xpGain = Math.max(0, parseIntSafe(params.xp, 0));
    const type = String(params.t || '').toLowerCase();

    if (amount <= 0) {
      const xp = parseIntSafe(state.result.profile.xp, 0);
      return sendJson(res, { ts: Math.floor(Date.now() / 1000), result: { oldXp: xp, newXp: xp } });
    }

    if ((type === 'sc' || type === 'coins' || type === 'soft') && parseIntSafe(state.result.profile.coins, 0) < amount) {
      return sendJson(res, { ts: Math.floor(Date.now() / 1000), err: 'ID_SPARX_ERROR_UNKNOWN', result: { retry: false, fatal: false, invalid_session: false } });
    }
    if ((type === 'hc' || type === 'gold' || type === 'hard') && parseIntSafe(state.result.profile.gold, 0) < amount) {
      return sendJson(res, { ts: Math.floor(Date.now() / 1000), err: 'ID_SPARX_ERROR_UNKNOWN', result: { retry: false, fatal: false, invalid_session: false } });
    }

    applyCurrencyDelta(state.result.profile, type, -amount);

    const oldXp = parseIntSafe(state.result.profile.xp, 0);
    const newXp = oldXp + xpGain;
    state.result.profile.xp = newXp;

    StateManager.writeSave(state, naid);
    return sendJson(res, { ts: Math.floor(Date.now() / 1000), result: { oldXp, newXp } });
  }

  function handleCurrencyCredit(req, res, body) {
    const parsedUrl = url.parse(req.url, true);
    const naid = resolveNaid(req, body, parsedUrl);
    const state = StateManager.loadSave(naid);
    const params = parseBodyObject(body, parsedUrl);

    ensureProfile(state);

    const amount = Math.max(0, parseIntSafe(params.q !== undefined ? params.q : params.value, 0));
    const type = String(params.t || 'hc').toLowerCase();
    applyCurrencyDelta(state.result.profile, type, amount);

    StateManager.writeSave(state, naid);

    if (type === 'hc' || type === 'gold' || type === 'hard') {
      return sendJson(res, { ts: Math.floor(Date.now() / 1000), result: { balance: parseIntSafe(state.result.profile.gold, 0) } });
    }

    return sendJson(res, { ts: Math.floor(Date.now() / 1000) });
  }

  function handleCurrency(req, res, body, pathname) {
    if (pathname === '/currency/debit') return handleCurrencyDebit(req, res, body);
    if (pathname === '/currency/credit') return handleCurrencyCredit(req, res, body);
    return sendJson(res, { ts: Math.floor(Date.now() / 1000) });
  }


  return {
    handleWalletBalance,
    handleWalletDebit,
    handleWalletCredit,
    handleCurrency
  };
};
