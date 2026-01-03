'use client';

import { useState, useEffect } from 'react';
import RequestFlow from '@/components/RequestFlow';
import ActivityLog from '@/components/Commentary';

type BackendState = 'HEALTHY' | 'DEGRADING' | 'UNHEALTHY' | 'RECOVERING';
type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
type SystemMode = 'STABLE' | 'DEGRADING' | 'OVERLOADED' | 'RECOVERING';

interface Backend {
  id: string;
  url: string;
  weight: number;
  state: BackendState;
  circuitState: CircuitState;
  latency: number;
  rps: number;
  errorRate: number;
  healthScore: number;
  rampUpPercentage: number;
}

interface ActivityMessage {
  id: string;
  timestamp: number;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
}

const SENTINEL_URL = process.env.NEXT_PUBLIC_SENTINEL_HTTP_URL || 'http://localhost:8080';
const SENTINEL_WS_URL = process.env.NEXT_PUBLIC_SENTINEL_WS_URL || 'ws://localhost:8080/websocket/metrics';
const TRAFFIC_GEN_URL = process.env.NEXT_PUBLIC_TRAFFIC_GEN_URL || 'http://localhost:9500';

const BACKEND_URLS = [
  'http://backend-1:9001',
  'http://backend-2:9002',
  'http://backend-3:9003',
  'http://backend-4:9004'
];

export default function Dashboard() {
  const [systemMode, setSystemMode] = useState<SystemMode>('STABLE');
  const [totalRps, setTotalRps] = useState(0);
  const [targetRps, setTargetRps] = useState(0);
  const [sliderRps, setSliderRps] = useState(0);
  const [backends, setBackends] = useState<Backend[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityMessage[]>([
    {
      id: '1',
      timestamp: Date.now(),
      message: 'Connecting to Sentinel...',
      type: 'info'
    }
  ]);

  const logActivity = (message: string, type: ActivityMessage['type'] = 'info') => {
    const newMessage: ActivityMessage = {
      id: `${Date.now()}-${Math.random()}`,
      timestamp: Date.now(),
      message,
      type
    };
    setActivityLog(prev => [newMessage, ...prev].slice(0, 10));
  };

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (targetRps > 0) {
        fetch(`${TRAFFIC_GEN_URL}/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rps: targetRps })
        })
          .then(() => logActivity(`Traffic generator started at ${targetRps.toLocaleString()} RPS`, 'success'))
          .catch(() => logActivity('Failed to start traffic generator', 'error'));
      } else if (targetRps === 0) {
        fetch(`${TRAFFIC_GEN_URL}/stop`, { method: 'POST' })
          .then(() => logActivity('Traffic generator stopped', 'info'))
          .catch(() => {});
      }
    }, 200);

    return () => clearTimeout(timeout);
  }, [targetRps]);

  useEffect(() => {
    fetchBackends();

    const ws = new WebSocket(SENTINEL_WS_URL);

    ws.onopen = () => {
      logActivity('Connected to Sentinel', 'success');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        setSystemMode(data.systemMode);
        setTotalRps(data.systemStats.totalRps);

        const updatedBackends = data.backends
          .map((b: any) => ({
            id: b.id,
            url: b.url,
            weight: b.weight,
            state: b.state,
            circuitState: b.circuitState,
            latency: b.metrics.p95Latency,
            rps: b.metrics.requestRate,
            errorRate: b.metrics.errorRate,
            healthScore: b.healthScore || 0,
            rampUpPercentage: b.rampUpPercentage || 100
          }))
          .sort((a: any, b: any) => a.id.localeCompare(b.id));

        setBackends(updatedBackends);
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    ws.onerror = () => {
      logActivity('WebSocket connection failed', 'error');
    };

    ws.onclose = () => {
      logActivity('Disconnected from Sentinel', 'warning');
    };

    return () => {
      ws.close();
    };
  }, []);

  const fetchBackends = async () => {
    try {
      const res = await fetch(`${SENTINEL_URL}/api/backends`);
      const data = await res.json();

      if (data.length === 0) {
        logActivity('No backends configured', 'info');
      }
    } catch (err) {
      logActivity('Failed to fetch backends', 'error');
    }
  };

  const handleAddBackend = async () => {
    const nextBackendUrl = BACKEND_URLS[backends.length];
    if (!nextBackendUrl) {
      logActivity('Maximum 4 backends allowed', 'warning');
      return;
    }

    try {
      const res = await fetch(`${SENTINEL_URL}/api/backends`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: nextBackendUrl })
      });

      if (res.ok) {
        const backend = await res.json();
        logActivity(`Added ${backend.id} to pool`, 'success');
      } else {
        const error = await res.json();
        logActivity(error.error || 'Failed to add backend', 'error');
      }
    } catch (err) {
      logActivity('Failed to add backend', 'error');
    }
  };

  const handleRemoveBackend = async (backendId: string) => {
    try {
      const res = await fetch(`${SENTINEL_URL}/api/backends/${backendId}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        logActivity(`Removed ${backendId} from pool`, 'warning');
      } else {
        logActivity('Failed to remove backend', 'error');
      }
    } catch (err) {
      logActivity('Failed to remove backend', 'error');
    }
  };

  const getBackendAdminUrl = (backendId: string) => {
    const backend = backends.find(b => b.id === backendId);
    if (!backend?.url) return '';

    return backend.url
      .replace('http://backend-1:9001', 'http://localhost:9001')
      .replace('http://backend-2:9002', 'http://localhost:9002')
      .replace('http://backend-3:9003', 'http://localhost:9003')
      .replace('http://backend-4:9004', 'http://localhost:9004');
  };

  const handleInjectLatency = async (backendId: string, latencyMs: number) => {
    const backendUrl = getBackendAdminUrl(backendId);
    if (!backendUrl) return;

    try {
      await fetch(`${backendUrl}/_admin/inject-latency`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latencyMs })
      });
      logActivity(`Injecting ${latencyMs}ms latency to ${backendId}`, 'warning');
    } catch (err) {
      logActivity(`Failed to inject latency to ${backendId}`, 'error');
    }
  };

  const handleInjectErrors = async (backendId: string, errorRate: number) => {
    const backendUrl = getBackendAdminUrl(backendId);
    if (!backendUrl) return;

    try {
      await fetch(`${backendUrl}/_admin/inject-errors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ errorRate })
      });
      logActivity(`Injecting ${errorRate}% error rate to ${backendId}`, 'error');
    } catch (err) {
      logActivity(`Failed to inject errors to ${backendId}`, 'error');
    }
  };

  const handleCrash = async (backendId: string) => {
    const backendUrl = getBackendAdminUrl(backendId);
    if (!backendUrl) return;

    try {
      await fetch(`${backendUrl}/_admin/inject-errors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ errorRate: 100 })
      });
      logActivity(`${backendId} crashed!`, 'error');
    } catch (err) {
      logActivity(`Failed to crash ${backendId}`, 'error');
    }
  };

  const handleTrafficSpike = (multiplier: number) => {
    const newRps = Math.round(targetRps * multiplier);
    setSliderRps(newRps);
    setTargetRps(newRps);
  };

  const handleRpsChange = (rps: number) => {
    setSliderRps(rps);
    setTargetRps(rps);
  };

  const handleReset = async () => {
    try {
      setSliderRps(0);
      setTargetRps(0);

      const res = await fetch(`${SENTINEL_URL}/api/backends/reset`, {
        method: 'POST'
      });

      if (res.ok) {
        logActivity('Reset all backends to baseline', 'success');
      } else {
        logActivity('Failed to reset backends', 'error');
      }
    } catch (err) {
      logActivity('Failed to reset backends', 'error');
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="border-b border-slate-200 bg-white">
        <div className="container mx-auto px-8 py-6">
          <h1 className="text-xl font-semibold">Sentinel</h1>
        </div>
      </div>

      <div className="container mx-auto px-8 py-12">
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-8 mb-8">
          <RequestFlow
            backends={backends}
            totalRps={sliderRps || totalRps}
            onAddBackend={handleAddBackend}
            canAddBackend={backends.length < 4}
            onRemoveBackend={handleRemoveBackend}
            onInjectLatency={handleInjectLatency}
            onInjectErrors={handleInjectErrors}
            onCrash={handleCrash}
            onTrafficSpike={handleTrafficSpike}
            onReset={handleReset}
            onRpsChange={handleRpsChange}
          />
        </div>

        <ActivityLog messages={activityLog} />
      </div>
    </div>
  );
}
