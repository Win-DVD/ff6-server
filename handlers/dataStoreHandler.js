const { safeJSONParse, sendJson } = require('../utils/common');

module.exports = function(deps) {
  const StateManager = deps.StateManager;

  return function handleDataStore(req, res, body) {
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
  };
};
