const express = require('express');
const app = express();

const BACKEND_ID = process.env.BACKEND_ID || 'backend-unknown';
const PORT = process.env.PORT || process.env.BACKEND_PORT || 10000;
const BASE_LATENCY = parseInt(process.env.BASE_LATENCY_MS || '50');
const MAX_CAPACITY = parseInt(process.env.MAX_CAPACITY || '50');

let injectedLatency = 0;
let injectedErrorRate = 0;
let concurrentRequests = 0;

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
    maxCapacity: MAX_CAPACITY,
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

  const loadPercent = (concurrentRequests / MAX_CAPACITY) * 100;

  if (concurrentRequests > MAX_CAPACITY) {
    concurrentRequests--;
    return res.status(503).json({
      backendId: BACKEND_ID,
      error: 'Service Unavailable - Over Capacity',
      capacity: MAX_CAPACITY,
      concurrent: concurrentRequests,
      timestamp: new Date().toISOString()
    });
  }

  let latency = BASE_LATENCY + injectedLatency;
  let errorRate = injectedErrorRate;

  if (loadPercent > 60) {
    const saturation = loadPercent - 60;
    latency += saturation * 3;
  }

  if (loadPercent > 80) {
    const pressure = loadPercent - 80;
    errorRate += pressure * 1.5;
  }

  try {
    await sleep(latency);

    if (Math.random() * 100 < errorRate) {
      concurrentRequests--;
      return res.status(500).json({
        backendId: BACKEND_ID,
        error: 'Internal Server Error',
        loadPercent: Math.round(loadPercent),
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
      loadPercent: Math.round(loadPercent),
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
  console.log(`Base latency: ${BASE_LATENCY}ms, Max capacity: ${MAX_CAPACITY} concurrent`);
});
