type BackendState = 'HEALTHY' | 'DEGRADING' | 'UNHEALTHY' | 'CIRCUIT_OPEN';

interface Backend {
  id: string;
  weight: number;
  state: BackendState;
  latency: number;
  rps: number;
  errorRate: number;
}

interface BackendCardProps {
  backend: Backend;
}

export default function BackendCard({ backend }: BackendCardProps) {
  const getStateDot = (state: BackendState) => {
    switch (state) {
      case 'HEALTHY': return 'bg-green-400';
      case 'DEGRADING': return 'bg-amber-400';
      case 'UNHEALTHY': return 'bg-red-400';
      case 'CIRCUIT_OPEN': return 'bg-slate-300';
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 transition-all hover:shadow-md">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-900">{backend.id}</span>
        </div>
        <div className={`w-2 h-2 rounded-full ${getStateDot(backend.state)}`} />
      </div>

      <div className="space-y-4">
        <div>
          <div className="text-xs text-slate-500 font-medium mb-2">Traffic Weight</div>
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
              <div
                className="bg-slate-900 h-full transition-all duration-500"
                style={{ width: `${backend.weight}%` }}
              />
            </div>
            <span className="text-xl font-semibold text-slate-900">{backend.weight}%</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-2">
          <div>
            <div className="text-xs text-slate-500 font-medium">Latency</div>
            <div className="text-lg font-semibold text-slate-900">{backend.latency}ms</div>
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">RPS</div>
            <div className="text-lg font-semibold text-slate-900">{backend.rps}</div>
          </div>
        </div>

        <div>
          <div className="text-xs text-slate-500 font-medium">Error Rate</div>
          <div className="text-lg font-semibold text-slate-900">{backend.errorRate.toFixed(1)}%</div>
        </div>

        <div className="text-center py-2 rounded-lg text-xs font-medium text-slate-600 bg-slate-50">
          {backend.state.replace('_', ' ')}
        </div>
      </div>
    </div>
  );
}
