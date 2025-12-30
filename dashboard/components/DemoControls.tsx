import { Sliders, Zap, RotateCcw } from 'lucide-react';

type BackendState = 'HEALTHY' | 'DEGRADING' | 'UNHEALTHY' | 'CIRCUIT_OPEN';

interface Backend {
  id: string;
  weight: number;
  state: BackendState;
  latency: number;
  rps: number;
  errorRate: number;
}

interface DemoControlsProps {
  backends: Backend[];
  onInjectLatency: (backendId: string) => void;
  onInjectErrors: (backendId: string) => void;
  onCrash: (backendId: string) => void;
  onTrafficSpike: () => void;
  onReset: () => void;
}

export default function DemoControls({
  backends,
  onInjectLatency,
  onInjectErrors,
  onCrash,
  onTrafficSpike,
  onReset,
}: DemoControlsProps) {
  const handleRandomLatency = () => {
    const randomBackend = backends[Math.floor(Math.random() * backends.length)];
    onInjectLatency(randomBackend.id);
  };

  const handleRandomErrors = () => {
    const randomBackend = backends[Math.floor(Math.random() * backends.length)];
    onInjectErrors(randomBackend.id);
  };

  const handleRandomCrash = () => {
    const randomBackend = backends[Math.floor(Math.random() * backends.length)];
    onCrash(randomBackend.id);
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleRandomLatency}
        className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-all"
      >
        Inject Latency
      </button>

      <button
        onClick={handleRandomErrors}
        className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-all"
      >
        Inject Errors
      </button>

      <button
        onClick={handleRandomCrash}
        className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-all"
      >
        Crash Backend
      </button>

      <div className="h-5 w-px bg-slate-200 mx-1"></div>

      <button
        onClick={onTrafficSpike}
        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium transition-all flex items-center gap-1.5"
      >
        <Zap className="w-3.5 h-3.5" />
        Traffic Spike
      </button>

      <button
        onClick={onReset}
        className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5"
      >
        <RotateCcw className="w-3.5 h-3.5" />
        Reset
      </button>
    </div>
  );
}
