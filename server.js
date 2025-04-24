const fs = require('fs');
const http = require('http');
const https = require('https');
const WebSocket = require('ws');
const constants = require('crypto').constants;

// set if logging is enabled.
const loggingEnabled = true;

console.log('FF6 Custom Server v0.0.1\nNOTE: This server is very unfinished, Development is still underway.\n');

if(loggingEnabled) {
    console.log("Logging is ENABLED\n");
} else {
    console.log("Logging is DISABLED\n");
}

console.log('Server is starting...\n');

// Read the certificate and private key.
const serverConfig = {
    key: fs.readFileSync('localhost.key'),
    cert: fs.readFileSync('localhost.crt'),
    secureOptions: constants.SSL_OP_NO_TLSv1_3, // TLS 1.0, 1.1 and 1.2
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

// log request details to console
function logRequest(req, body) {
    if (loggingEnabled && req.url !== '/bugs') {
        const log = `Request: ${req.method} ${req.url}, Headers: ${JSON.stringify(req.headers)}\nBody: ${body}`;
        console.log(log);
    }
}

// log the body of POST requests to /bugs to a JSON file
function logBugsRequest(body) {
    if (loggingEnabled) {
        const logFilePath = 'bugs.json';
        let logData;
        try {
            logData = {
                timestamp: new Date().toISOString(),
                body: JSON.parse(body)
            };
        } catch (error) {
            console.error('Error parsing JSON:', error);
            return;
        }

        fs.readFile(logFilePath, 'utf8', (err, data) => {
            let logs = [];
            if (!err) {
                logs = JSON.parse(data);
            }
            logs.push(logData);
            fs.writeFile(logFilePath, JSON.stringify(logs, null, 2), (err) => {
                if (err) {
                    console.error('Error writing to bugs.json:', err);
                } else {
                    console.log('/bugs was logged to JSON file.'); // Log to console
                }
            });
        });
    }
}

// for JSON responses
function handleJsonResponse(filePath, res) {
    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error(`Error reading ${filePath}:`, err);
            res.writeHead(500);
            res.end(`Error: ${err}`);
        } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(data);
        }
    });
}

// routes
const routes = [
    { path: '/inventory/add', handler: (req, res) => handleJsonResponse('jsonresponses/inventoryadd.json', res) },
    { path: '/inventory', handler: (req, res) => handleJsonResponse('jsonresponses/inventory.json', res) },
    { path: '/motd/status', handler: (req, res) => handleJsonResponse('jsonresponses/motdstatus.json', res) },
    { path: '/carinfo/check', handler: (req, res) => handleJsonResponse('jsonresponses/carinfocheck.json', res) },
    { path: '/carinfo', handler: (req, res) => handleJsonResponse('jsonresponses/carinfo.json', res) },
    { path: '/cars/save', handler: (req, res) => handleJsonResponse('jsonresponses/carssave.json', res) },
    { path: '/cars', handler: (req, res) => handleJsonResponse('jsonresponses/cars.json', res) },
    { path: '/content', handler: (req, res) => handleJsonResponse('jsonresponses/info.json', res) },
    { path: '/auth/init', handler: (req, res) => handleJsonResponse('jsonresponses/authinit.json', res) },
    { path: '/kabam/register', handler: (req, res) => handleJsonResponse('jsonresponses/register.json', res) },
    { path: '/kabam/upgrade', handler: (req, res) => handleJsonResponse('jsonresponses/noacc.json', res) },
    { path: '/kabam/guest', handler: (req, res) => handleJsonResponse('jsonresponses/guest.json', res) },
    { path: '/kabam/login', handler: (req, res) => handleJsonResponse('jsonresponses/noacc.json', res) },
    { path: '/tuning', handler: (req, res) => handleJsonResponse('jsonresponses/tuning.json', res) },
    { path: '/wallet/balance', handler: (req, res) => handleJsonResponse('jsonresponses/walletbalance.json', res) },
    { path: '/gacha/getTokens', handler: (req, res) => handleJsonResponse('jsonresponses/gettokens.json', res) },
    { path: '/store/payouts', handler: (req, res) => handleJsonResponse('jsonresponses/storepayouts.json', res) },
    { path: '/tournaments/latest', handler: (req, res) => handleJsonResponse('jsonresponses/tournamentslatest.json', res) },
    { path: '/racewars/latest', handler: (req, res) => handleJsonResponse('jsonresponses/racewarslatest.json', res) },
    { path: '/racewars/myInfo', handler: (req, res) => handleJsonResponse('jsonresponses/racewarsmyinfo.json', res) },
    { path: '/prizes/refresh', handler: (req, res) => handleJsonResponse('jsonresponses/prizesrefresh.json', res) },
    { path: '/web/webViewTabs', handler: (req, res) => handleJsonResponse('jsonresponses/webviewtabs.json', res) },
    { path: '/push/token', handler: (req, res) => handleJsonResponse('jsonresponses/pushtoken.json', res) }
];

// handle HTTP/HTTPS requests
function handleRequest(req, res) {
    let body = '';
    req.on('data', chunk => {
        body += chunk.toString();
    });
    req.on('end', () => {
        logRequest(req, body);

        // log POST requests to /bugs to a JSON file
        if (req.method === 'POST' && req.url === '/bugs') {
            logBugsRequest(body);
            const timestamp = Math.floor(Date.now() / 1000);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ts: timestamp }));
            return;
        }

        // check if the request is for index page
        if (req.url === '/') {
            try {
                const data = fs.readFileSync('index.html', 'utf8');
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(data);
                return;
            } catch (err) {
                console.error('Error reading index.html:', err);
                res.writeHead(500);
                res.end(`Error: ${err}`);
                return;
            }
        }

        // special for /ds/1337/
        if (req.url.startsWith('/ds/1337/')) {
            if (req.method === 'POST') {
                const timestamp = Math.floor(Date.now() / 1000);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ts: timestamp }));
            } else if (req.method === 'GET') {
                handleJsonResponse('jsonresponses/ds.json', res);
            } else {
                res.writeHead(405);
                res.end('Method Not Allowed');
            }
            return;
        }

        const route = routes.find(r => req.url.startsWith(r.path));
        if (route) {
            route.handler(req, res);
        } else {
            const timestamp = Math.floor(Date.now() / 1000);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ts: timestamp }));
        }
    });
}

// create HTTPS server
const httpsServer = https.createServer(serverConfig, handleRequest);
httpsServer.listen(443);

httpsServer.on('secureConnection', (tlsSocket) => {
    tlsSocket.on('error', (error) => {
        console.error('SSL Error:', error);
    });
});

// create HTTP server
const httpServer = http.createServer(handleRequest);
httpServer.listen(80);

// create WebSocket servers
const wssServer = new WebSocket.Server({ noServer: true });
const wsServer = new WebSocket.Server({ noServer: true });

// handle WebSocket connections
function handleConnection(ws, isSecure) {
    ws.on('message', (message) => {
        const log = `${isSecure ? 'WSS' : 'WS'} Message: ${message}`;
        console.log(log);
        ws.send(message);
    });

    ws.on('error', (error) => {
        const log = `${isSecure ? 'WSS' : 'WS'} Error: ${error}`;
        console.log(log);
    });

    ws.on('close', (code, reason) => {
        const log = `${isSecure ? 'WSS' : 'WS'} Close: ${code}, ${reason}`;
        console.log(log);
    });
}

httpsServer.on('upgrade', (request, socket, head) => {
    if (request.url === '/push/token') {
        const log = `WSS Upgrade: ${request.method} ${request.url}, Headers: ${JSON.stringify(request.headers)}`;
        console.log(log);
        wssServer.handleUpgrade(request, socket, head, (ws) => {
            handleConnection(ws, true);
        });
    } else {
        socket.destroy();
    }
});

httpServer.on('upgrade', (request, socket, head) => {
    if (request.url === '/push/token') {
        const log = `WS Upgrade: ${request.method} ${request.url}, Headers: ${JSON.stringify(request.headers)}`;
        console.log(log);
        wsServer.handleUpgrade(request, socket, head, (ws) => {
            handleConnection(ws, false);
        });
    } else {
        socket.destroy();
    }
});

console.log('Server is running...');