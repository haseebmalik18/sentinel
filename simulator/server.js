const express = require('express');
const app = express();

const BACKEND_ID = process.env.BACKEND_ID || 'backend-unknown';
const PORT = process.env.PORT || process.env.BACKEND_PORT || 10000;
const BASE_LATENCY = parseInt(process.env.BASE_LATENCY_MS || '0');

let injectedLatency = 0;
let injectedErrorRate = 0;
let concurrentRequests = 0;

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

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

app.post('/_admin/inject-latency', (req, res) => {
  const { latencyMs } = req.body;
  injectedLatency = parseInt(latencyMs) || 0;
  res.json({
    backendId: BACKEND_ID,
    injectedLatency,
    totalLatency: BASE_LATENCY + injectedLatency
  });
});

app.post('/_admin/inject-errors', (req, res) => {
  const { errorRate } = req.body;
  injectedErrorRate = parseFloat(errorRate) || 0;
  res.json({
    backendId: BACKEND_ID,
    injectedErrorRate
  });
});

app.get('/_admin/status', (req, res) => {
  res.json({
    backendId: BACKEND_ID,
    baseLatency: BASE_LATENCY,
    injectedLatency,
    totalLatency: BASE_LATENCY + injectedLatency,
    injectedErrorRate,
    currentConcurrent: concurrentRequests
  });
});

app.post('/_admin/reset', (req, res) => {
  injectedLatency = 0;
  injectedErrorRate = 0;
  res.json({
    backendId: BACKEND_ID,
    message: 'Reset to baseline',
    baseLatency: BASE_LATENCY
  });
});

app.all('*', async (req, res) => {
  concurrentRequests++;

  let latency = BASE_LATENCY + injectedLatency;
  let errorRate = injectedErrorRate;

  try {
    await sleep(latency);

    if (Math.random() * 100 < errorRate) {
      concurrentRequests--;
      return res.status(500).json({
        backendId: BACKEND_ID,
        error: 'Internal Server Error',
        timestamp: new Date().toISOString()
      });
    }

    concurrentRequests--;
    res.json({
      backendId: BACKEND_ID,
      path: req.path,
      method: req.method,
      latencyMs: Math.round(latency),
      concurrent: concurrentRequests,
      timestamp: new Date().toISOString(),
      message: 'Success'
    });
  } catch (err) {
    concurrentRequests--;
    res.status(500).json({
      backendId: BACKEND_ID,
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.listen(PORT, () => {
  console.log(`Backend ${BACKEND_ID} listening on port ${PORT}`);
  console.log(`Base latency: ${BASE_LATENCY}ms`);
});
