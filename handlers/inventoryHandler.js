const url = require('url');
const { safeJSONParse, sendJson, parseBodyObject } = require('../utils/common');

module.exports = function(deps) {
  const StateManager = deps.StateManager;

  function buildInventoryPayload(state) {
    const inv = {};
    const source = state && state.result && state.result.inventory ? state.result.inventory : {};
    const keys = Object.keys(source);
    for (let i = 0; i < keys.length; i++) inv[keys[i]] = source[keys[i]];

    const profile = state && state.result && state.result.profile ? state.result.profile : {};
    const coins = parseInt(profile && profile.coins !== undefined ? profile.coins : 0, 10) || 0;
    const gold = parseInt(profile && profile.gold !== undefined ? profile.gold : 0, 10) || 0;

    inv.sc = coins;
    inv.hc = gold;
    return inv;
  }

  function resolveNaid(req, body) {
    const parsedUrl = url.parse(req.url, true);
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

  return function handleInventory(req, res, body, pathname) {
    const naid = resolveNaid(req, body);
    const state = StateManager.loadSave(naid);
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
        StateManager.writeSave(state, naid);
      }
      return sendJson(res, { ts: Math.floor(Date.now() / 1000), result: buildInventoryPayload(state) });
    }

    if (pathname === '/inventory/use') {
      const json = safeJSONParse(body, {});
      if (json && json.items && typeof json.items === 'object') {
        const keys = Object.keys(json.items);
        for (let i = 0; i < keys.length; i++) {
          const k = keys[i];
          const v = parseInt(json.items[k] || 0, 10) || 0;
          if (v <= 0) continue;
          const cur = parseInt(state.result.inventory[k] || 0, 10) || 0;
          let useCount = v;
          if ((k === 'pu' || k === 'vu') && v > cur && cur > 0) useCount = 1;
          if (useCount > cur) useCount = cur;
          const next = cur - useCount;
          state.result.inventory[k] = next > 0 ? next : 0;
        }
        StateManager.writeSave(state, naid);
      }
      return sendJson(res, { ts: Math.floor(Date.now() / 1000), result: buildInventoryPayload(state) });
    }

    return sendJson(res, { ts: Math.floor(Date.now() / 1000), result: buildInventoryPayload(state) });
  };
};
