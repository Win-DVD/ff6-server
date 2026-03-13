const {
  sendJson,
  parseBodyObject,
  getCarsByUid,
  carsObjToArray
} = require('../utils/common');

module.exports = function(deps) {
  const StateManager = deps.StateManager;

  return function handleAuth(req, res, body, parsedUrl) {
    const data = parseBodyObject(body, parsedUrl);
    const naid = data.naid || data.openudid || data.player_id || data.device_id || data.udid || 'guest';
    const profile = StateManager.getProfile(String(naid));
    const state = StateManager.loadSave();

    const carsById = getCarsByUid(state.result.cars || {}, profile.uid || '1001');
    const carsArr = carsObjToArray(carsById, profile.uid || '1001');

    return sendJson(res, {
      result: {
        success: true,
        ts: Math.floor(Date.now() / 1000),
        stoken: profile.stoken,
        naid: profile.naid,
        player_id: profile.naid,
        user: { uid: profile.uid, name: profile.name, naid: profile.naid },
        data: {
          cars: carsArr
        }
      }
    });
  };
};
