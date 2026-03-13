const { safeJSONParse, sendJson } = require('../utils/common');

module.exports = function(deps) {
  const StateManager = deps.StateManager;

  return function handleInventory(req, res, body, pathname) {
    const state = StateManager.loadSave();
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
        StateManager.writeSave(state);
      }
      return sendJson(res, { ts: Math.floor(Date.now() / 1000), result: { success: true } });
    }

    return sendJson(res, { ts: Math.floor(Date.now() / 1000), result: state.result.inventory });
  };
};
