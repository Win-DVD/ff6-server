const { safeJSONParse, sendJson, parseBodyObject, parseRequestUrl } = require('../utils/common');

const STORE_PAYOUTS = {
  result: {
    data: {
      payoutSets: [
        {
          payouts: [
            { productId: '1', cost: 2.99, numOfIGC: 30, coststring: '$2.99', thirdPartyId: 'com.kabam.fast.299', show: true, payoutid: 1, visible: 1, art: 1, longName: 'STACK_OF_GOLD' },
            { productId: '2', cost: 4.99, numOfIGC: 55, coststring: '$4.99', thirdPartyId: 'com.kabam.fast.499', show: true, payoutid: 2, visible: 1, art: 2, longName: 'DUFFEL_BAG_OF_GOLD' },
            { productId: '3', cost: 9.99, numOfIGC: 115, coststring: '$9.99', thirdPartyId: 'com.kabam.fast.999', show: true, payoutid: 3, visible: 1, art: 3, longName: 'CRATES_OF_GOLD' },
            { productId: '4', cost: 19.99, numOfIGC: 250, coststring: '$19.99', thirdPartyId: 'com.kabam.fast.1999', show: true, payoutid: 4, visible: 1, art: 4, longName: 'CAR_TRUNK_OF_GOLD', popular: 1 },
            { productId: '5', cost: 59.99, numOfIGC: 900, coststring: '$59.99', thirdPartyId: 'com.kabam.fast.5999', show: true, payoutid: 5, visible: 1, art: 5, longName: 'VAULT_OF_GOLD' },
            { productId: '6', cost: 99.99, numOfIGC: 1600, coststring: '$99.99', thirdPartyId: 'com.kabam.fast.9999', show: true, payoutid: 6, visible: 1, art: 6, longName: 'SEMI_TRUCK_OF_GOLD', value: 1 }
          ]
        }
      ]
    },
    externalTrkid: 'offline@dummy:googleapp'
  }
};

module.exports = function(deps) {
  const StateManager = deps.StateManager;

  function resolveNaid(req, body, parsedUrlInput) {
    const parsedUrl = parsedUrlInput || parseRequestUrl(req);
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

  function handleStorePayouts(req, res, body, parsedUrl) {
    return sendJson(res, STORE_PAYOUTS);
  }

  function handleStoreVerifyPayout(req, res, body, parsedUrl, pathname) {
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

    const offersJson = STORE_PAYOUTS;

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
        err: 'ID_SPARX_ERROR_UNKNOWN',
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
  }

  handleStoreVerifyPayout.handleStorePayouts = handleStorePayouts;
  return handleStoreVerifyPayout;
};
