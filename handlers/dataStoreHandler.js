const { safeJSONParse, sendJson, parseBodyObject } = require('../utils/common');

module.exports = function(deps) {
  const StateManager = deps.StateManager;

  function resolveNaid(data, parsedUrl) {
    let naid = String(data.naid || data.openudid || data.player_id || data.device_id || data.udid || '');

    const pathname = String(parsedUrl && parsedUrl.pathname ? parsedUrl.pathname : '');
    if (!naid && pathname.indexOf('/ds/') === 0) {
      const seg = pathname.split('/')[2];
      if (seg) {
        const byUid = StateManager.findNaidByUid(String(seg));
        if (byUid) naid = String(byUid);
      }
    }

    if (!naid) {
      const stoken = data.stoken || data.session || data.token || data.st || data.s;
      if (stoken) {
        const byToken = StateManager.findNaidByStoken(String(stoken));
        if (byToken) naid = String(byToken);
      }
    }

    if (!naid && data.uid !== undefined && data.uid !== null) {
      const byUid = StateManager.findNaidByUid(String(data.uid));
      if (byUid) naid = String(byUid);
    }

    if (!naid) naid = 'guest';
    return naid;
  }

  return function handleDataStore(req, res, body, parsedUrl) {
    const data = parseBodyObject(body, parsedUrl);
    const naid = resolveNaid(data, parsedUrl);
    const state = StateManager.loadSave(naid);

    if (req.method === 'POST') {
      const incoming = safeJSONParse(body, null);
      if (incoming && incoming.data && typeof incoming.data === 'object') {
        state.result = StateManager.merge(state.result, incoming.data);
        StateManager.writeSave(state, naid);
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
