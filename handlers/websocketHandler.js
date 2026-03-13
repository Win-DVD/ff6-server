module.exports = function(deps) {
  const logInfo = deps.logInfo;
  const logError = deps.logError;

  return function handleConnection(ws, secure) {
    const tag = secure ? 'WSS' : 'WS';
    ws.on('message', message => {
      logInfo(`${tag} Message: ${message}`);
      ws.send(message);
    });
    ws.on('error', err => {
      logError(`${tag} Error: ${err.message}`);
    });
    ws.on('close', (code, reason) => {
      logInfo(`${tag} Close: code=${code}, reason=${reason}`);
    });
  };
};
