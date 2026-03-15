const path = require('path');
const url = require('url');
const { fs, safeJSONParse, sendJson, parseBodyObject } = require('../utils/common');

module.exports = function(deps) {
  const StateManager = deps.StateManager;
  const RESPONSES_DIR = deps.RESPONSES_DIR;

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

    if (!naid && parsedUrl && parsedUrl.pathname && parsedUrl.pathname.indexOf('/store/') === 0) {
      const seg = parsedUrl.pathname.split('/')[2];
      if (seg) {
        const byUid = StateManager.findNaidByUid(String(seg));
        if (byUid) naid = String(byUid);
      }
    }

    if (!naid) naid = 'guest';
    return naid;
  }

  return function handleStoreVerifyPayout(req, res, body, parsedUrl, pathname) {
    const naid = resolveNaid(req, body, parsedUrl);
    const state = StateManager.loadSave(naid);

    if (!state.result) state.result = {};
    if (!state.result.profile) state.result.profile = { coins: 0, gold: 0, xp: 0, energy: 10 };

    const payload = safeJSONParse(body, {});
    const data = (payload && payload.data && typeof payload.data === 'object') ? payload.data : payload;

    const payoutidRaw = (data && data.payoutid !== undefined && data.payoutid !== null) ? data.payoutid : 0;
    const payoutid = parseInt(String(Array.isArray(payoutidRaw) ? payoutidRaw[0] : payoutidRaw), 10) || 0;

    const responseDataStr = (data && (data['response-data'] || data.responseData)) ? (data['response-data'] || data.responseData) : '';
    const purchase = safeJSONParse(responseDataStr, {});

    const orderId   = purchase && purchase.orderId ? String(purchase.orderId) : '';
    const productId = purchase && purchase.productId ? String(purchase.productId) : '';

    if (!state.result.iap) state.result.iap = {};
    if (!state.result.iap.orders) state.result.iap.orders = {};

    if (orderId && state.result.iap.orders[orderId]) {
      let cur = state.result.profile.gold;
      if (Array.isArray(cur)) cur = cur[0];
      cur = parseInt(String(cur), 10);
      if (!isFinite(cur) || cur < 0) cur = 0;

      return sendJson(res, {
        ts: Math.floor(Date.now() / 1000),
        result: { success: true, duplicate: true, balance: cur }
      });
    }

    let offersJson = null;
    try {
      const p = path.join(RESPONSES_DIR, 'storepayouts.json');
      if (fs.existsSync(p)) offersJson = safeJSONParse(fs.readFileSync(p, 'utf8'), null);
    } catch (e) {
      offersJson = null;
    }

    let credit = 0;

    function matchPayout(p) {
      if (!p || typeof p !== 'object') return false;
      const igc = p.numOfIGC !== undefined && p.numOfIGC !== null ? (parseInt(String(p.numOfIGC), 10) || 0) : 0;
      if (igc <= 0) return false;

      const pid = p.payoutid !== undefined && p.payoutid !== null ? (parseInt(String(p.payoutid), 10) || 0) : 0;
      const tp  = p.thirdPartyId ? String(p.thirdPartyId) : '';

      if (payoutid && pid && payoutid === pid) { credit = igc; return true; }
      if (productId && tp && productId === tp) { credit = igc; return true; }
      return false;
    }

    if (offersJson && offersJson.result && offersJson.result.data && Array.isArray(offersJson.result.data.payoutSets)) {
      const sets = offersJson.result.data.payoutSets;
      for (let i = 0; i < sets.length && credit <= 0; i++) {
        const s = sets[i];
        const payouts = s && Array.isArray(s.payouts) ? s.payouts : [];
        for (let j = 0; j < payouts.length && credit <= 0; j++) {
          matchPayout(payouts[j]);
        }
      }
    }

    if (credit <= 0) {
      return sendJson(res, {
        ts: Math.floor(Date.now() / 1000),
        err: 'unknown_product',
        result: { success: false }
      });
    }

    let current = state.result.profile.gold;
    if (Array.isArray(current)) current = current[0];
    current = parseInt(String(current), 10);
    if (!isFinite(current) || current < 0) current = 0;

    state.result.profile.gold = current + credit;
    if (state.result.profile.gold < 0) state.result.profile.gold = 0;

    if (orderId) {
      state.result.iap.orders[orderId] = {
        productId: productId,
        payoutid: payoutid,
        credited: credit,
        time: Date.now()
      };
    }

    StateManager.writeSave(state, naid);

    return sendJson(res, {
      ts: Math.floor(Date.now() / 1000),
      result: { success: true, balance: state.result.profile.gold || 0 }
    });
  };
};
