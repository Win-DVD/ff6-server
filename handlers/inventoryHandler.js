const url = require('url');
const { safeJSONParse, sendJson, parseBodyObject } = require('../utils/common');

module.exports = function(deps) {
  const StateManager = deps.StateManager;

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
      return sendJson(res, { ts: Math.floor(Date.now() / 1000), result: { success: true } });
    }

    return sendJson(res, { ts: Math.floor(Date.now() / 1000), result: state.result.inventory });
  };
};
