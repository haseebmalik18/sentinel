'use client';

import { useState } from 'react';
import { Activity } from 'lucide-react';
import RequestFlow from '@/components/RequestFlow';
import ActivityLog from '@/components/Commentary';

type BackendState = 'HEALTHY' | 'DEGRADING' | 'UNHEALTHY' | 'CIRCUIT_OPEN';
type SystemMode = 'STABLE' | 'DEGRADING' | 'OVERLOADED' | 'RECOVERING';

interface Backend {
  id: string;
  weight: number;
  state: BackendState;
  latency: number;
  rps: number;
  errorRate: number;
}

interface ActivityMessage {
  id: string;
  timestamp: number;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
}

export default function Dashboard() {
  const [systemMode, setSystemMode] = useState<SystemMode>('STABLE');
  const [totalRps, setTotalRps] = useState(2340);
  const [backends, setBackends] = useState<Backend[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityMessage[]>([
    {
      id: '1',
      timestamp: Date.now(),
      message: 'No backends configured. Add a backend to begin routing traffic.',
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

  const handleInjectLatency = (backendId: string) => {
    setBackends(prev => prev.map(b => {
      if (b.id === backendId) {
        logActivity(`Injecting latency to ${backendId} (50ms → 420ms)`, 'warning');
        return { ...b, latency: 420, state: 'DEGRADING' };
      }
      return b;
    }));

    setTimeout(() => {
      setBackends(prev => prev.map(b => {
        if (b.id === backendId) {
          logActivity(`Reducing ${backendId} weight: 100% → 85%`, 'warning');
          return { ...b, weight: 85 };
        }
        return b;
      }));
    }, 2000);

    setTimeout(() => {
      setBackends(prev => prev.map(b => {
        if (b.id === backendId) {
          logActivity(`Further reducing ${backendId} weight: 85% → 50%`, 'warning');
          return { ...b, weight: 50 };
        }
        return b;
      }));
      setSystemMode('DEGRADING');
    }, 4000);

    setTimeout(() => {
      setBackends(prev => prev.map(b => {
        if (b.id === backendId) {
          logActivity(`Isolating ${backendId}, weight: 50% → 20%`, 'error');
          return { ...b, weight: 20 };
        }
        return b;
      }));
    }, 6000);
  };

  const handleInjectErrors = (backendId: string) => {
    setBackends(prev => prev.map(b => {
      if (b.id === backendId) {
        logActivity(`Injecting errors to ${backendId} (error rate: 0% → 80%)`, 'error');
        return { ...b, errorRate: 80, state: 'UNHEALTHY' };
      }
      return b;
    }));

    setTimeout(() => {
      setBackends(prev => prev.map(b => {
        if (b.id === backendId) {
          logActivity(`Circuit breaker OPEN for ${backendId}`, 'error');
          return { ...b, state: 'CIRCUIT_OPEN', weight: 0 };
        }
        return b;
      }));
    }, 2000);
  };

  const handleCrash = (backendId: string) => {
    logActivity(`${backendId} crashed!`, 'error');
    setBackends(prev => prev.map(b => {
      if (b.id === backendId) {
        return { ...b, state: 'CIRCUIT_OPEN', weight: 0, errorRate: 100 };
      }
      return b;
    }));
    setSystemMode('DEGRADING');
  };

  const handleTrafficSpike = (multiplier: number) => {
    const newRps = Math.round(totalRps * multiplier);
    logActivity(`Traffic spike detected! RPS: ${totalRps.toLocaleString()} → ${newRps.toLocaleString()} (${multiplier}x)`, 'warning');
    setTotalRps(newRps);
    setSystemMode('OVERLOADED');
    setBackends(prev => prev.map(b => ({ ...b, state: 'DEGRADING' })));

    setTimeout(() => {
      logActivity('All backends saturated, entering overload protection mode', 'error');
    }, 1000);
  };

  const handleAddBackend = () => {
    const newId = `backend-${backends.length + 1}`;
    logActivity(`Adding ${newId} to pool`, 'success');
    setBackends(prev => [...prev, {
      id: newId,
      weight: 100,
      state: 'HEALTHY',
      latency: 55,
      rps: 0,
      errorRate: 0
    }]);
  };

  const handleRemoveBackend = (backendId: string) => {
    if (backends.length <= 1) return; // Don't remove last backend
    logActivity(`Removing ${backendId} from pool`, 'warning');
    setBackends(prev => prev.filter(b => b.id !== backendId));
  };

  const handleReset = () => {
    logActivity('Resetting system to healthy state', 'success');
    setSystemMode('STABLE');
    setTotalRps(2340);
    setBackends([
      { id: 'backend-1', weight: 100, state: 'HEALTHY', latency: 50, rps: 2340, errorRate: 0.1 },
    ]);
  };

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="border-b border-slate-200 bg-white">
        <div className="container mx-auto px-8 py-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-semibold">Sentinel</h1>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-8 py-12">
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-8 mb-8">
          <RequestFlow
            backends={backends}
            totalRps={totalRps}
            onAddBackend={handleAddBackend}
            canAddBackend={backends.length < 4}
            onRemoveBackend={handleRemoveBackend}
            onInjectLatency={handleInjectLatency}
            onInjectErrors={handleInjectErrors}
            onCrash={handleCrash}
            onTrafficSpike={handleTrafficSpike}
            onReset={handleReset}
            onRpsChange={setTotalRps}
          />
        </div>

        <ActivityLog messages={activityLog} />
      </div>
    </div>
  );
}
