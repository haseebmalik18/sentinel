const express = require('express');
const axios = require('axios');
const http = require('http');
const https = require('https');

const app = express();

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});

app.use(express.json());

const PORT = process.env.PORT || 9500;
const SENTINEL_URL = process.env.SENTINEL_URL || 'http://localhost:8080';
const MAX_RPS = parseInt(process.env.MAX_RPS || '25000');

const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 2000,
  maxFreeSockets: 512,
  timeout: 60000,
  keepAliveMsecs: 1000
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 2000,
  maxFreeSockets: 512,
  timeout: 60000,
  keepAliveMsecs: 1000
});

const axiosInstance = axios.create({
  httpAgent,
  httpsAgent,
  timeout: 5000,
  maxRedirects: 0,
  validateStatus: () => true
});

let isRunning = false;
let currentRps = 0;
let targetRps = 0;
let intervalIds = [];
let stats = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  timeouts: 0,
  startTime: null
};

const REQUEST_PATHS = [
  '/api/test',
  '/api/health',
  '/api/data',
  '/users',
  '/products',
  '/orders'
];

const USER_AGENTS = [
  'SentinelLoadTest/1.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
  'LoadGenerator/1.0'
];

function getRandomPath() {
  return REQUEST_PATHS[Math.floor(Math.random() * REQUEST_PATHS.length)];
}

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function makeRequest() {
  if (!isRunning) return;

  const path = getRandomPath();
  const startTime = Date.now();

  try {
    const response = await axiosInstance.get(`${SENTINEL_URL}${path}`, {
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'X-Load-Test': 'true',
        'X-Request-ID': `gen-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      }
    });

    stats.totalRequests++;

    if (response.status >= 200 && response.status < 400) {
      stats.successfulRequests++;
    } else {
      stats.failedRequests++;
    }
  } catch (error) {
    stats.totalRequests++;

    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      stats.timeouts++;
    } else {
      stats.failedRequests++;
    }
  }
}

function startTraffic(rps) {
  if (isRunning && currentRps === rps) {
    return;
  }

  stopTraffic();

  if (rps <= 0) return;

  isRunning = true;
  currentRps = rps;
  targetRps = rps;
  stats.startTime = Date.now();

  // Use fixed 5ms interval for better accuracy
  // Calculate how many requests to send per 5ms tick
  const intervalMs = 5;
  const requestsPerInterval = Math.max(1, Math.round(rps / 200));

  const intervalId = setInterval(() => {
    if (!isRunning) {
      clearInterval(intervalId);
      return;
    }

    for (let i = 0; i < requestsPerInterval; i++) {
      makeRequest();
    }
  }, intervalMs);

  intervalIds.push(intervalId);

  console.log(`Traffic generator started: ${rps} RPS (${requestsPerInterval} req per ${intervalMs}ms)`);
}

function stopTraffic() {
  isRunning = false;
  currentRps = 0;
  targetRps = 0;

  intervalIds.forEach(id => clearInterval(id));
  intervalIds = [];

  console.log('Traffic generator stopped');
}

app.post('/start', (req, res) => {
  const { rps } = req.body;

  if (!rps || rps <= 0 || rps > MAX_RPS) {
    return res.status(400).json({
      error: `RPS must be between 1 and ${MAX_RPS}`
    });
  }

  startTraffic(rps);

  res.json({
    message: 'Traffic generator started',
    rps: currentRps,
    sentinelUrl: SENTINEL_URL
  });
});

app.post('/stop', (req, res) => {
  stopTraffic();

  res.json({
    message: 'Traffic generator stopped',
    stats
  });
});

app.get('/status', (req, res) => {
  const uptime = stats.startTime ? (Date.now() - stats.startTime) / 1000 : 0;
  const actualRps = uptime > 0 ? (stats.totalRequests / uptime).toFixed(2) : 0;

  res.json({
    running: isRunning,
    targetRps: currentRps,
    actualRps: parseFloat(actualRps),
    sentinelUrl: SENTINEL_URL,
    stats: {
      ...stats,
      uptime: uptime.toFixed(2),
      successRate: stats.totalRequests > 0
        ? ((stats.successfulRequests / stats.totalRequests) * 100).toFixed(2)
        : 0
    }
  });
});

app.post('/reset-stats', (req, res) => {
  stats = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    timeouts: 0,
    startTime: isRunning ? Date.now() : null
  };

  res.json({ message: 'Stats reset', stats });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', running: isRunning });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Traffic generator listening on port ${PORT}`);
  console.log(`Target: ${SENTINEL_URL}`);
  console.log(`Max RPS: ${MAX_RPS.toLocaleString()}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, stopping traffic...');
  stopTraffic();
  process.exit(0);
});
