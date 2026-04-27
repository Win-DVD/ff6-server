// guess whos back, back again (it sure isn't the giant server.js)

const fs       = require('fs');
const http     = require('http');
const https    = require('https');
const WebSocket = require('ws');
const constants = require('crypto').constants;
const path     = require('path');

const {
  timestamp,
  pretty,
  parseRequestUrl
} = require('./utils/common');
const createAuthHandler = require('./handlers/authHandler');
const createDataStoreHandler = require('./handlers/dataStoreHandler');
const createSaveHandler = require('./handlers/saveHandler');
const createWalletHandler = require('./handlers/walletHandler');
const createStoreHandler = require('./handlers/storeHandler');
const createInventoryHandler = require('./handlers/inventoryHandler');
const createWebsocketHandler = require('./handlers/websocketHandler');
const createGachaHandler = require('./handlers/gachaHandler');

// toggle logging here
const consoleLoggingEnabled = true;
const fileLoggingEnabled    = false;

// you can set file name here if you want for the file log
const logStream = fileLoggingEnabled
  ? fs.createWriteStream('server.log', { flags: 'a' })
  : null;

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

logInfo('FF6 Custom Server v0.1.2 DEV');
logInfo('NOTE: This server is very unfinished, development is still underway.');
logInfo(`Console logging is ${consoleLoggingEnabled ? 'ENABLED' : 'DISABLED'}`);
logInfo(`File logging is ${fileLoggingEnabled    ? 'ENABLED' : 'DISABLED'}`);
logInfo('Server is starting...');

// read the certificate and private key, need this for HTTPS ingame but you can also just use HTTP.
// if you do decide to use HTTPS you will need to replace the certificate in the client's assets.
const serverConfig = {
  key: fs.readFileSync('localhost.key'),
  cert: fs.readFileSync('localhost.crt'),

  // allow tls 1.0 to 1.2
  minVersion: 'TLSv1',
  maxVersion: 'TLSv1.2',

  ciphers: [
    // best suites for new clients that support them
    'ECDHE-RSA-AES128-GCM-SHA256',
    'ECDHE-RSA-AES256-GCM-SHA384',
    'ECDHE-RSA-AES128-SHA256',
    'ECDHE-RSA-AES256-SHA384',
	'ECDHE-RSA-CHACHA20-POLY1305',

    // for older clients
    'ECDHE-RSA-AES128-SHA',
    'ECDHE-RSA-AES256-SHA',

    // dhe if no ecdhe support on the client
    'DHE-RSA-AES128-SHA',
    'DHE-RSA-AES256-SHA',

    // last resort for really old clients
    'AES128-SHA',
    'AES256-SHA',

    // needed for TLS 1.0
    '@SECLEVEL=0'
  ].join(':'),

  honorCipherOrder: true
};

const SAVE_DIR = path.join(__dirname, 'savedata');
const RESPONSES_DIR = path.join(__dirname, 'jsonresponses');
const SAVE_FILE = 'save.json';
const PROFILE_FILE = 'profile.json';

try { if (!fs.existsSync(SAVE_DIR)) fs.mkdirSync(SAVE_DIR, { recursive: true }); } catch (e) {}
try { if (!fs.existsSync(RESPONSES_DIR)) fs.mkdirSync(RESPONSES_DIR, { recursive: true }); } catch (e) {}

const StateManager = createSaveHandler.createStateManager({
  SAVE_DIR,
  SAVE_FILE,
  PROFILE_FILE,
  logError
});

const handleAuth = createAuthHandler({ StateManager, SAVE_DIR });
const handleDataStore = createDataStoreHandler({ StateManager });
const handleConnection = createWebsocketHandler({ logInfo, logError, StateManager });
const handleCarsSave = createSaveHandler({ StateManager, broadcast: (msg) => handleConnection.broadcast(msg) });
const walletHandlers = createWalletHandler({ StateManager });
const handleStoreVerifyPayout = createStoreHandler({ StateManager, RESPONSES_DIR });
const handleInventory = createInventoryHandler({ StateManager });
const handleGacha = createGachaHandler({
  StateManager,
  RESPONSES_DIR,
  handleCarsSave,
  getWsServers: () => ({ wss: wssServer, ws: wsServer }),
  logInfo,
  logError
});

// new fancy logging stuff, looks prettier
function logRequest(req, body) {
  if (req.url === '/bugs') return;

  const isHttps = !!req.socket.encrypted;
  const tlsProtocol = isHttps && req.socket.getProtocol ? req.socket.getProtocol() : null;
  const tlsCipher = isHttps && req.socket.getCipher ? req.socket.getCipher() : null;

  const lines = [
    isHttps ? '─── HTTPS Request ───' : '─── HTTP Request ───',
    `Method : ${req.method}`,
    `URL    : ${req.url}`,
    ...(isHttps ? [
      `TLS    : ${tlsProtocol || '<unknown>'}`,
      `Cipher : ${tlsCipher && tlsCipher.name ? tlsCipher.name : '<unknown>'}`
    ] : []),
    `Headers: ${pretty(req.headers)}`,
    `Body   : ${body || '<empty>'}`,
    '────────────────────'
  ].join('\n');

  logInfo(lines);
}

function handleJsonResponse(filePath, res) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(data);
  } catch (err) {
    logError(`Error reading ${filePath}: ${err.message}`);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

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
    let logs = [];

    if (!err && data && String(data).trim().length) {
      try {
        const existing = JSON.parse(data);
        if (Array.isArray(existing)) logs = existing;
      } catch (e) {
        logs = [];
      }
    }

    logs.push(entry);

    fs.writeFile('bugs.json', JSON.stringify(logs, null, 2), (err2) => {
      if (err2) {
        logError(`Failed to write bugs.json: ${err2.message}`);
      } else {
        logInfo('/bugs payload appended to bugs.json');
      }
    });
  });
}

function handleBugs(req, res, body) {
  logBugsRequest(body);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  return res.end(JSON.stringify({ ts: Math.floor(Date.now() / 1000) }));
}

// routes
const routes = [
  { path: '/inventory/add', handler: (req, res, body, parsedUrl, pathname) => handleInventory(req, res, body, pathname) },
  { path: '/inventory/use', handler: (req, res, body, parsedUrl, pathname) => handleInventory(req, res, body, pathname) },
  { path: '/inventory',     handler: (req, res, body, parsedUrl, pathname) => handleInventory(req, res, body, pathname) },
  { path: '/motd/status',   handler: (req, res) => handleJsonResponse('jsonresponses/motdstatus.json',    res) },
  { path: '/carinfo/getCarTokenCosts', handler: (req, res, body, parsedUrl, pathname) => handleGacha.handleCarTokenCosts(req, res, body, parsedUrl, pathname) },
  { path: '/carinfo/check', handler: (req, res) => handleJsonResponse('jsonresponses/carinfocheck.json',  res) },
  { path: '/carinfo',       handler: (req, res) => handleJsonResponse('jsonresponses/carinfo.json',       res) },
  { path: '/cars/save',     handler: (req, res, body) => handleCarsSave(req, res, body) },
  { path: '/cars/find',     handler: (req, res) => handleJsonResponse('jsonresponses/carsfind.json',      res) },
  { path: '/cars/buyCarWithCurrency', handler: (req, res, body, parsedUrl, pathname) => handleCarsSave.handleBuyCarWithCurrency(req, res, body, parsedUrl, pathname) },
  { path: '/cars',          handler: (req, res, body, parsedUrl) => handleCarsSave.handleCarsList(req, res, body, parsedUrl) },
  { path: '/carupgrades/partUpgrade', handler: (req, res, body, parsedUrl, pathname) => handleCarsSave.handleCarUpgrades(req, res, body, parsedUrl, pathname) },
  { path: '/carupgrades/prestigeCar', handler: (req, res, body, parsedUrl, pathname) => handleCarsSave.handleCarUpgrades(req, res, body, parsedUrl, pathname) },
  { path: '/carupgrades/visualUpgrade', handler: (req, res, body, parsedUrl, pathname) => handleCarsSave.handleCarUpgrades(req, res, body, parsedUrl, pathname) },
  { path: '/content',       handler: (req, res) => handleJsonResponse('jsonresponses/info.json',          res) },
  { path: '/auth/init',     handler: (req, res) => handleJsonResponse('jsonresponses/authinit.json',      res) },
  { path: '/kabam/register',handler: (req, res, body, parsedUrl) => handleAuth(req, res, body, parsedUrl) },
  { path: '/kabam/upgrade', handler: (req, res, body, parsedUrl) => handleAuth(req, res, body, parsedUrl) },
  { path: '/kabam/guest',   handler: (req, res, body, parsedUrl) => handleAuth(req, res, body, parsedUrl) },
  { path: '/kabam/login',   handler: (req, res, body, parsedUrl) => handleAuth(req, res, body, parsedUrl) },
  { path: '/kabam/name',    handler: (req, res, body, parsedUrl) => handleAuth.handleKabamName(req, res, body, parsedUrl) },
  { path: '/tuning',        handler: (req, res) => handleJsonResponse('jsonresponses/tuning.json',        res) },
  { path: '/wallet/debit',  handler: (req, res, body) => walletHandlers.handleWalletDebit(req, res, body) },
  { path: '/wallet/credit', handler: (req, res, body) => walletHandlers.handleWalletCredit(req, res, body) },
  { path: '/wallet/balance',handler: (req, res, body, parsedUrl, pathname) => walletHandlers.handleWalletBalance(req, res, body, pathname) },
  { path: '/wallet',        handler: (req, res, body, parsedUrl, pathname) => walletHandlers.handleWalletBalance(req, res, body, pathname) },
  { path: '/currency/debit', handler: (req, res, body, parsedUrl, pathname) => walletHandlers.handleCurrency(req, res, body, pathname) },
  { path: '/currency/credit', handler: (req, res, body, parsedUrl, pathname) => walletHandlers.handleCurrency(req, res, body, pathname) },
  { path: '/gacha/getTokens', handler: (req, res, body, parsedUrl, pathname) => handleGacha(req, res, body, parsedUrl, pathname) },
  { path: '/gacha/getSet', handler: (req, res, body, parsedUrl, pathname) => handleGacha(req, res, body, parsedUrl, pathname) },
  { path: '/gacha/getRewardCars', handler: (req, res, body, parsedUrl, pathname) => handleGacha(req, res, body, parsedUrl, pathname) },
  { path: '/gacha/getTables', handler: (req, res, body, parsedUrl, pathname) => handleGacha(req, res, body, parsedUrl, pathname) },
  { path: '/gacha/getAttractImages', handler: (req, res, body, parsedUrl, pathname) => handleGacha(req, res, body, parsedUrl, pathname) },
  { path: '/gacha/pick', handler: (req, res, body, parsedUrl, pathname) => handleGacha(req, res, body, parsedUrl, pathname) },
  { path: '/gacha/buyCarWithTokens', handler: (req, res, body, parsedUrl, pathname) => handleGacha(req, res, body, parsedUrl, pathname) },
  { path: '/util/ping', handler: (req, res, body, parsedUrl) => handleAuth.handlePing(req, res, body, parsedUrl) },
  { path: '/store/payouts', handler: (req, res, body, parsedUrl, pathname) => handleStoreVerifyPayout.handleStorePayouts(req, res, body, parsedUrl, pathname) },
  { path: '/store/verify-payout', handler: (req, res, body, parsedUrl, pathname) => handleStoreVerifyPayout(req, res, body, parsedUrl, pathname) },
  { path: '/tournaments/latest', handler: (req, res) => handleJsonResponse('jsonresponses/tournamentslatest.json', res) },
  { path: '/racewars/latest',     handler: (req, res) => handleJsonResponse('jsonresponses/racewarslatest.json',  res) },
  { path: '/racewars/myInfo',     handler: (req, res) => handleJsonResponse('jsonresponses/racewarsmyinfo.json',  res) },
  { path: '/prizes/refresh',      handler: (req, res) => handleJsonResponse('jsonresponses/prizesrefresh.json',   res) },
  { path: '/web/webViewTabs',     handler: (req, res) => handleJsonResponse('jsonresponses/webviewtabs.json',     res) },
  { path: '/push/token',          handler: (req, res) => handleConnection.handlePushToken(req, res) }
];

// handle HTTP/HTTPS requests
function handleRequest(req, res) {
  let body = '';
  req.on('data', chunk => body += chunk.toString());
  req.on('end', () => {
    logRequest(req, body);

    const parsedUrl = parseRequestUrl(req);
    const pathname = parsedUrl && parsedUrl.pathname ? parsedUrl.pathname : req.url;

    // log POST requests to /bugs to a JSON file
    if (req.method === 'POST' && pathname === '/bugs') {
      return handleBugs(req, res, body);
    }

    // check if the request is for index page
    if (pathname === '/') {
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

    if (pathname === '/guest' || pathname.indexOf('/guest/') === 0 || pathname === '/register' || pathname.indexOf('/register/') === 0) {
      return handleAuth(req, res, body, parsedUrl);
    }

    if (pathname.indexOf('/ds/') === 0) {
      if (req.method === 'POST' || req.method === 'GET') return handleDataStore(req, res, body, parsedUrl);
    }

    const route = routes.find(r => pathname.startsWith(r.path));
    if (route) {
      return route.handler(req, res, body, parsedUrl, pathname);
    }

    res.end(JSON.stringify({ ts: Math.floor(Date.now() / 1000) }));
  });
}

// create HTTPS server
const httpsServer = https.createServer(serverConfig, handleRequest);
httpsServer.listen(443, () => logInfo('HTTPS listening on port 443'));
httpsServer.on('tlsClientError', (err, socket) => {
  const remote = socket && socket.remoteAddress ? `${socket.remoteAddress}:${socket.remotePort}` : '<unknown>';
  logError(`TLS Client Error from ${remote}: ${err.message}`);
});
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
httpsServer.on('upgrade', (req, sock, head) => {
  const parsedUrl = parseRequestUrl(req);
  const pathname = parsedUrl && parsedUrl.pathname ? parsedUrl.pathname : req.url;
  if (pathname === '/push/token') {
    logInfo(`WSS Upgrade: ${req.method} ${req.url}`);
    wssServer.handleUpgrade(req, sock, head, ws => handleConnection(ws, true, req));
  } else {
    sock.destroy();
  }
});

httpServer.on('upgrade', (req, sock, head) => {
  const parsedUrl = parseRequestUrl(req);
  const pathname = parsedUrl && parsedUrl.pathname ? parsedUrl.pathname : req.url;
  if (pathname === '/push/token') {
    logInfo(`WS Upgrade: ${req.method} ${req.url}`);
    wsServer.handleUpgrade(req, sock, head, ws => handleConnection(ws, false, req));
  } else {
    sock.destroy();
  }
});

httpServer.keepAliveTimeout = 60000;
httpsServer.keepAliveTimeout = 60000;

if (httpServer.headersTimeout !== undefined) httpServer.headersTimeout = 65000;
if (httpsServer.headersTimeout !== undefined) httpsServer.headersTimeout = 65000;

logInfo('Server is running...');

// clean up ur mess
process.on('exit', () => {
  if (logStream) logStream.end();
});
