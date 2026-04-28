module.exports = function(deps) {
  const logInfo = deps.logInfo;
  const logError = deps.logError;
  const sockets = new Set();

  function isSecureRequest(req) {
    const xfProto = req && req.headers && req.headers['x-forwarded-proto'] ? String(req.headers['x-forwarded-proto']).toLowerCase() : '';
    if (xfProto === 'https') return true;
    if (req && req.socket && req.socket.encrypted) return true;
    return false;
  }

  function inferHost(req) {
    if (req && req.headers && req.headers.host) return String(req.headers.host);

    const addr = req && req.socket && req.socket.localAddress ? String(req.socket.localAddress) : '';
    const port = req && req.socket && req.socket.localPort ? String(req.socket.localPort) : '';
    if (!addr) return '';

    if (addr.indexOf(':') !== -1 && addr.charAt(0) !== '[') {
      if (port) return '[' + addr + ']:' + port;
      return '[' + addr + ']';
    }

    if (port) return addr + ':' + port;
    return addr;
  }

  function handlePushToken(req, res) {
    const secure = isSecureRequest(req);
    const scheme = secure ? 'wss' : 'ws';
    const host = inferHost(req) || '127.0.0.1:80';
    const stoken = parseStokenFromReq(req);
    const suffix = stoken ? ('?stoken=' + encodeURIComponent(stoken)) : '';

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ts: Math.floor(Date.now() / 1000),
      result: {
        websocket: scheme + '://' + host + '/push/token' + suffix
      }
    }));
  }

  function parseStokenFromReq(req) {
    try {
      const rawUrl = req && req.url ? String(req.url) : '';
      const parsed = new URL(rawUrl, 'http://local');
      return String(parsed.searchParams.get('stoken') || '').trim();
    } catch (e) {
      return '';
    }
  }



  function broadcast(messageObj) {
    let payload = '';
    try {
      payload = JSON.stringify(messageObj || {});
    } catch (e) {
      return;
    }

    sockets.forEach((ws) => {
      try {
        if (ws && ws.readyState === 1) ws.send(payload);
      } catch (e) {}
    });
  }

  function handleConnection(ws, secure) {
    const tag = secure ? 'WSS' : 'WS';
    sockets.add(ws);
    ws.on('message', message => {
      logInfo(`${tag} Message: ${message}`);
      ws.send(message);
    });
    ws.on('error', err => {
      logError(`${tag} Error: ${err.message}`);
    });
    ws.on('close', (code, reason) => {
      sockets.delete(ws);
      logInfo(`${tag} Close: code=${code}, reason=${reason}`);
    });
  }

  handleConnection.broadcast = broadcast;
  handleConnection.handlePushToken = handlePushToken;
  return handleConnection;
};
