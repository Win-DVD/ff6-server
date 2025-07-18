// yet another cursed rewrite lol

const fs       = require('fs');
const http     = require('http');
const https    = require('https');
const WebSocket = require('ws');
const util     = require('util');
const constants = require('crypto').constants;

// toggle logging here
const consoleLoggingEnabled = true;
const fileLoggingEnabled    = false;

// you can set file name here if you want for the file log
const logStream = fileLoggingEnabled
  ? fs.createWriteStream('server.log', { flags: 'a' })
  : null;

// for yee yee timestamp
function timestamp() {
  return new Date().toISOString();
}

function writeLog(level, msg, toStdErr = false) {
  const line = `[${timestamp()}] [${level}] ${msg}\n`;

  if (consoleLoggingEnabled) {
    if (toStdErr) process.stderr.write(line);
    else          process.stdout.write(line);
  }

  if (fileLoggingEnabled && logStream) {
    logStream.write(line);
  }
}

function logInfo(message) {
  writeLog('INFO', message, false);
}

function logError(message) {
  writeLog('ERROR', message, true);
}

function pretty(obj) {
  return util.inspect(obj, { depth: null, colors: false });
}

logInfo('FF6 Custom Server v0.0.2');
logInfo('NOTE: This server is very unfinished, development is still underway.');
logInfo(`Console logging is ${consoleLoggingEnabled ? 'ENABLED' : 'DISABLED'}`);
logInfo(`File logging is ${fileLoggingEnabled    ? 'ENABLED' : 'DISABLED'}`);
logInfo('Server is starting...');

// read the certificate and private key, need this for HTTPS ingame but you can also just use HTTP.
// if you do decide to use HTTPS you will need to replace the certificate in the client's assets.
const serverConfig = {
  key: fs.readFileSync('localhost.key'),
  cert: fs.readFileSync('localhost.crt'),
  secureOptions: constants.SSL_OP_NO_TLSv1_3, // disable tls 1.3, i dont even remember why i did this but hey, there it is lol
  ciphers: [
    'DHE-RSA-AES256-SHA',
    'DHE-DSS-AES256-SHA',
    'DHE-RSA-AES128-SHA',
    'DHE-DSS-AES128-SHA',
    'DHE-RSA-DES-CBC3-SHA',
    'DHE-DSS-DES-CBC3-SHA',
    'AES256-SHA',
    'AES128-SHA',
    'DES-CBC3-SHA'
  ].join(':')
};

// new fancy logging stuff, looks prettier
function logRequest(req, body) {
  if (req.url === '/bugs') return;
  const lines = [
    '─── HTTP Request ───',
    `Method : ${req.method}`,
    `URL    : ${req.url}`,
    `Headers: ${pretty(req.headers)}`,
    `Body   : ${body || '<empty>'}`,
    '────────────────────'
  ].join('\n');
  logInfo(lines);
}

// log the body of POST requests to /bugs to a JSON file
function logBugsRequest(body) {
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (err) {
    logError(`Error parsing /bugs payload: ${err.message}`);
    return;
  }

  const entry = {
    timestamp: new Date().toISOString(),
    body: parsed
  };

  fs.readFile('bugs.json', 'utf8', (err, data) => {
    const logs = !err ? JSON.parse(data) : [];
    logs.push(entry);
    fs.writeFile('bugs.json', JSON.stringify(logs, null, 2), (err) => {
      if (err) {
        logError(`Failed to write bugs.json: ${err.message}`);
      } else {
        logInfo('/bugs payload appended to bugs.json');
      }
    });
  });
}

// for JSON responses
function handleJsonResponse(filePath, res) {
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      logError(`Error reading ${filePath}: ${err.message}`);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      return res.end(`Error: ${err.message}`);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(data);
  });
}

// routes
const routes = [
  { path: '/inventory/add', handler: (req, res) => handleJsonResponse('jsonresponses/inventoryadd.json', res) },
  { path: '/inventory',     handler: (req, res) => handleJsonResponse('jsonresponses/inventory.json',    res) },
  { path: '/motd/status',   handler: (req, res) => handleJsonResponse('jsonresponses/motdstatus.json',    res) },
  { path: '/carinfo/check', handler: (req, res) => handleJsonResponse('jsonresponses/carinfocheck.json',  res) },
  { path: '/carinfo',       handler: (req, res) => handleJsonResponse('jsonresponses/carinfo.json',       res) },
  { path: '/cars/save',     handler: (req, res) => handleJsonResponse('jsonresponses/carssave.json',     res) },
  { path: '/cars',          handler: (req, res) => handleJsonResponse('jsonresponses/cars.json',         res) },
  { path: '/content',       handler: (req, res) => handleJsonResponse('jsonresponses/info.json',         res) },
  { path: '/auth/init',     handler: (req, res) => handleJsonResponse('jsonresponses/authinit.json',     res) },
  { path: '/kabam/register',handler: (req, res) => handleJsonResponse('jsonresponses/register.json',     res) },
  { path: '/kabam/upgrade', handler: (req, res) => handleJsonResponse('jsonresponses/noacc.json',       res) },
  { path: '/kabam/guest',   handler: (req, res) => handleJsonResponse('jsonresponses/guest.json',        res) },
  { path: '/kabam/login',   handler: (req, res) => handleJsonResponse('jsonresponses/noacc.json',       res) },
  { path: '/tuning',        handler: (req, res) => handleJsonResponse('jsonresponses/tuning.json',       res) },
  { path: '/wallet/balance',handler: (req, res) => handleJsonResponse('jsonresponses/walletbalance.json',res) },
  { path: '/gacha/getTokens', handler: (req, res) => handleJsonResponse('jsonresponses/gettokens.json',   res) },
  { path: '/store/payouts', handler: (req, res) => handleJsonResponse('jsonresponses/storepayouts.json',res) },
  { path: '/tournaments/latest', handler: (req, res) => handleJsonResponse('jsonresponses/tournamentslatest.json', res) },
  { path: '/racewars/latest',     handler: (req, res) => handleJsonResponse('jsonresponses/racewarslatest.json',     res) },
  { path: '/racewars/myInfo',     handler: (req, res) => handleJsonResponse('jsonresponses/racewarsmyinfo.json',    res) },
  { path: '/prizes/refresh',      handler: (req, res) => handleJsonResponse('jsonresponses/prizesrefresh.json',     res) },
  { path: '/web/webViewTabs',     handler: (req, res) => handleJsonResponse('jsonresponses/webviewtabs.json',      res) },
  { path: '/push/token',          handler: (req, res) => handleJsonResponse('jsonresponses/pushtoken.json',        res) }
];

// handle HTTP/HTTPS requests
function handleRequest(req, res) {
  let body = '';
  req.on('data', chunk => body += chunk.toString());
  req.on('end', () => {
    logRequest(req, body);

    // log POST requests to /bugs to a JSON file
    if (req.method === 'POST' && req.url === '/bugs') {
      logBugsRequest(body);
      return res.end(JSON.stringify({ ts: Math.floor(Date.now() / 1000) }));
    }

    // check if the request is for index page
    if (req.url === '/') {
      try {
        const html = fs.readFileSync('index.html', 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end(html);
      } catch (err) {
        logError(`Error reading index.html: ${err.message}`);
        res.writeHead(500);
        return res.end(`Error: ${err.message}`);
      }
    }

    // special for /ds/1337/
    if (req.url.startsWith('/ds/1337/')) {
      if (req.method === 'POST') {
        return res.end(JSON.stringify({ ts: Math.floor(Date.now() / 1000) }));
      }
      if (req.method === 'GET') {
        return handleJsonResponse('jsonresponses/ds.json', res);
      }
      res.writeHead(405).end('Method Not Allowed');
      return;
    }

    const route = routes.find(r => req.url.startsWith(r.path));
    if (route) {
      return route.handler(req, res);
    }
    res.end(JSON.stringify({ ts: Math.floor(Date.now() / 1000) }));
  });
}

// create HTTPS server
const httpsServer = https.createServer(serverConfig, handleRequest);
httpsServer.listen(443, () => logInfo('HTTPS listening on port 443'));
httpsServer.on('secureConnection', socket => {
  socket.on('error', err => logError(`SSL Error: ${err.message}`));
});

// create HTTP server
const httpServer = http.createServer(handleRequest);
httpServer.listen(80, () => logInfo('HTTP listening on port 80'));

// create WebSocket servers
const wssServer = new WebSocket.Server({ noServer: true });
const wsServer  = new WebSocket.Server({ noServer: true });

// handle WebSocket connections, i need to look more into what websockets actually do later, but for now loopback works.
function handleConnection(ws, secure) {
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
}

httpsServer.on('upgrade', (req, sock, head) => {
  if (req.url === '/push/token') {
    logInfo(`WSS Upgrade: ${req.method} ${req.url}`);
    wssServer.handleUpgrade(req, sock, head, ws => handleConnection(ws, true));
  } else {
    sock.destroy();
  }
});

httpServer.on('upgrade', (req, sock, head) => {
  if (req.url === '/push/token') {
    logInfo(`WS Upgrade: ${req.method} ${req.url}`);
    wsServer.handleUpgrade(req, sock, head, ws => handleConnection(ws, false));
  } else {
    sock.destroy();
  }
});

logInfo('Server is running...');

// clean up ur mess
process.on('exit', () => {
  if (logStream) logStream.end();
});