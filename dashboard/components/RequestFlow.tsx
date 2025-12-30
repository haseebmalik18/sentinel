'use client';

import { motion } from 'framer-motion';
import { useEffect, useState, useId } from 'react';
import { Plus, X, Zap, RotateCcw, Clock, AlertCircle, XCircle } from 'lucide-react';

type BackendState = 'HEALTHY' | 'DEGRADING' | 'UNHEALTHY' | 'CIRCUIT_OPEN';

interface Backend {
  id: string;
  weight: number;
  state: BackendState;
  latency: number;
  rps: number;
  errorRate: number;
}

interface RequestFlowProps {
  backends: Backend[];
  totalRps: number;
  onAddBackend: () => void;
  canAddBackend: boolean;
  onRemoveBackend: (backendId: string) => void;
  onInjectLatency: (backendId: string) => void;
  onInjectErrors: (backendId: string) => void;
  onCrash: (backendId: string) => void;
  onTrafficSpike: (multiplier: number) => void;
  onReset: () => void;
  onRpsChange: (rps: number) => void;
}

interface Particle {
  id: string;
  targetIndex: number;
}

export default function RequestFlow({
  backends,
  totalRps,
  onAddBackend,
  canAddBackend,
  onRemoveBackend,
  onInjectLatency,
  onInjectErrors,
  onCrash,
  onTrafficSpike,
  onReset,
  onRpsChange
}: RequestFlowProps) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [hoveredBackend, setHoveredBackend] = useState<string | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [selectedBackend, setSelectedBackend] = useState<string>('');
  const [latencyAmount, setLatencyAmount] = useState(420);
  const [errorRate, setErrorRate] = useState(80);
  const [spikeMultiplier, setSpikeMultiplier] = useState(3);
  const gradientId = useId();

  // Update selected backend when backends change
  useEffect(() => {
    if (backends.length > 0 && !backends.find(b => b.id === selectedBackend)) {
      setSelectedBackend(backends[0].id);
    }
  }, [backends, selectedBackend]);

  useEffect(() => {
    // Scale particle spawn rate with RPS
    // At 100 RPS: ~800ms interval
    // At 2340 RPS: ~300ms interval
    // At 10000 RPS: ~100ms interval
    const baseInterval = Math.max(100, Math.min(800, 50000 / totalRps));

    const interval = setInterval(() => {
      const totalWeight = backends.reduce((sum, b) => sum + b.weight, 0);
      if (totalWeight === 0) return;

      const random = Math.random() * totalWeight;
      let cumulative = 0;
      let targetIndex = 0;

      for (let i = 0; i < backends.length; i++) {
        cumulative += backends[i].weight;
        if (random <= cumulative) {
          targetIndex = i;
          break;
        }
      }

      const newParticle: Particle = {
        id: `${Date.now()}-${Math.random()}`,
        targetIndex,
      };

      setParticles(prev => [...prev, newParticle]);

      setTimeout(() => {
        setParticles(prev => prev.filter(p => p.id !== newParticle.id));
      }, 3000);
    }, baseInterval);

    return () => clearInterval(interval);
  }, [backends, totalRps]);

  const getBackendY = (index: number, total: number = backends.length) => {
    if (backends.length === 1 && index === 0) return 50;
    const spacing = 70 / (total - 1);
    return 15 + (spacing * index);
  };

  return (
    <div className="flex gap-4" style={{ height: '400px' }}>
      <div className="relative flex-1 overflow-hidden">
        <svg
          key={backends.map(b => b.id).join('-')}
          className="absolute inset-0 pointer-events-none"
          width="100%"
          height="100%"
          suppressHydrationWarning
        >
          {backends.map((backend, index) => {
            const totalSlots = canAddBackend ? backends.length + 1 : backends.length;
            const targetY = getBackendY(index, totalSlots);
            const opacity = backend.weight / 100;
            const trafficIntensity = Math.min(1, totalRps / 5000);
            const strokeWidth = Math.max(2.5, 2 + (trafficIntensity * 1.5));
            const lineOpacity = Math.max(0.7, 0.5 + (opacity * 0.3) + (trafficIntensity * 0.15));
            const uniqueGradientId = `${gradientId}-${backend.id}`;
            return (
              <g key={`line-${backend.id}`}>
                <defs>
                  <linearGradient id={uniqueGradientId} x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#94a3b8" stopOpacity="0.9" />
                  </linearGradient>
                </defs>
                <line
                  x1="25%"
                  y1="50%"
                  x2="75%"
                  y2={`${targetY}%`}
                  stroke={`url(#${uniqueGradientId})`}
                  strokeWidth={strokeWidth}
                  opacity={lineOpacity}
                  strokeLinecap="round"
                />
                <text
                  x="50%"
                  y={`${(50 + targetY) / 2}%`}
                  fill="#64748b"
                  fontSize="11"
                  fontWeight="600"
                  textAnchor="middle"
                >
                  {backend.weight}%
                </text>
              </g>
            );
          })}
        </svg>

        {particles.map((particle) => {
          const totalSlots = canAddBackend ? backends.length + 1 : backends.length;
          const targetY = getBackendY(particle.targetIndex, totalSlots);
          return (
            <motion.div
              key={particle.id}
              className="absolute w-1.5 h-1.5 rounded-full bg-blue-400"
              style={{
                left: '25%',
                top: '50%',
                boxShadow: '0 0 4px rgba(59, 130, 246, 0.3)',
              }}
              initial={{ opacity: 0.7, scale: 1 }}
              animate={{
                left: '75%',
                top: `${targetY}%`,
                opacity: 0,
                scale: 0.9,
              }}
              transition={{
                duration: 2.5,
                ease: [0.16, 1, 0.3, 1],
              }}
            />
          );
        })}

        <motion.div
          className="absolute left-[20%] top-1/2 -translate-x-1/2 -translate-y-1/2"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="bg-gradient-to-br from-white to-slate-50 rounded-xl shadow-lg border border-slate-200 px-6 py-4 min-w-35 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent pointer-events-none"></div>
            <div className="text-center relative">
              <div className="text-xs text-slate-400 font-medium mb-1">Proxy</div>
              <div className="text-base font-semibold text-slate-900">Sentinel</div>
              <div className="text-xs text-blue-600 font-medium mt-1">{totalRps.toLocaleString()} req/s</div>
            </div>
          </div>
        </motion.div>

        {backends.map((backend, index) => {
          const totalSlots = canAddBackend ? backends.length + 1 : backends.length;
          const targetY = getBackendY(index, totalSlots);
          const isHovered = hoveredBackend === backend.id;
          return (
            <motion.div
              key={backend.id}
              className="absolute left-[75%] -translate-y-1/2 cursor-pointer"
              initial={{ opacity: 0, scale: 0.96, top: `${targetY}%` }}
              animate={{
                opacity: 1,
                scale: 1,
                top: `${targetY}%`
              }}
              transition={{
                duration: 0.4,
                ease: [0.16, 1, 0.3, 1]
              }}
              onMouseEnter={() => setHoveredBackend(backend.id)}
              onMouseLeave={() => setHoveredBackend(null)}
            >
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 px-5 py-3 transition-all duration-200 hover:shadow-lg hover:border-slate-400 hover:scale-105 hover:bg-slate-50 cursor-pointer relative group">
                <div className="text-center">
                  <div className="text-xs text-slate-400 font-medium mb-1">Backend</div>
                  <div className="text-sm font-semibold text-slate-900">{backend.id}</div>
                  <div className="flex items-center justify-center gap-2 mt-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${
                      backend.state === 'HEALTHY' ? 'bg-green-400' :
                      backend.state === 'DEGRADING' ? 'bg-amber-400' :
                      'bg-slate-300'
                    }`} />
                    <div className="text-xs text-slate-500">{backend.latency}ms</div>
                  </div>
                </div>
                {backends.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveBackend(backend.id);
                    }}
                    className="absolute top-1 right-1 w-4 h-4 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center"
                    title="Remove backend"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {isHovered && (
                <div className="absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-slate-900 text-white rounded-lg px-4 py-3 shadow-lg min-w-50 z-10">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-300">Weight</span>
                      <span className="font-semibold">{backend.weight}%</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-300">RPS</span>
                      <span className="font-semibold">{backend.rps}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-300">Error Rate</span>
                      <span className="font-semibold">{backend.errorRate.toFixed(1)}%</span>
                    </div>
                    <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-700">
                      <span className="text-slate-300">State</span>
                      <span className="font-semibold">{backend.state.replace('_', ' ')}</span>
                    </div>
                  </div>
                  <div className="absolute left-full top-1/2 -translate-y-1/2 w-0 h-0 border-8 border-transparent border-l-slate-900"></div>
                </div>
              )}
            </motion.div>
          );
        })}

        {canAddBackend && (
          <motion.div
            className="absolute left-[75%] -translate-y-1/2 cursor-pointer"
            initial={{ opacity: 0, scale: 0.96, top: backends.length === 0 ? '50%' : `${getBackendY(backends.length, backends.length + 1)}%` }}
            animate={{
              opacity: 1,
              scale: 1,
              top: backends.length === 0 ? '50%' : `${getBackendY(backends.length, backends.length + 1)}%`
            }}
            transition={{
              duration: 0.4,
              ease: [0.16, 1, 0.3, 1]
            }}
            onClick={onAddBackend}
          >
            <div className="bg-white rounded-xl shadow-sm border-2 border-dashed border-slate-300 hover:border-slate-400 hover:bg-slate-50 px-5 py-3 transition-all duration-200 hover:scale-105">
              <div className="text-center flex flex-col items-center gap-1">
                <Plus className="w-5 h-5 text-slate-400" />
                <div className="text-xs font-medium text-slate-600">Add Backend</div>
              </div>
            </div>
          </motion.div>
        )}

        {!isPanelOpen && (
          <button
            onClick={() => setIsPanelOpen(true)}
            className="absolute top-1/2 -translate-y-1/2 right-0 bg-white border border-slate-200 hover:bg-slate-50 transition-all p-2 rounded-l-lg shadow-sm z-10 border-r-0 cursor-pointer"
          >
            <svg
              className="w-4 h-4 text-slate-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
      </div>

      {isPanelOpen && (
        <div className="w-72 bg-white border border-slate-200 rounded-lg shadow-sm flex flex-col shrink-0">
          <div className={`h-full flex flex-col`}>
            <div className="p-4 border-b border-slate-200 flex items-center justify-between shrink-0">
              <h3 className="text-sm font-semibold text-slate-900">Demo Controls</h3>
              <button
                onClick={() => setIsPanelOpen(false)}
                className="p-1 hover:bg-slate-100 rounded transition-all"
              >
                <X className="w-4 h-4 text-slate-600" />
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-2">Target Backend</label>
                {backends.length === 0 ? (
                  <div className="text-xs text-slate-500 py-2 text-center">No backends available</div>
                ) : (
                  <div className="grid grid-cols-3 gap-1.5">
                    {backends.map((backend) => (
                      <button
                        key={backend.id}
                        onClick={() => setSelectedBackend(backend.id)}
                        className={`px-2 py-1.5 border rounded text-xs font-medium transition-all ${
                          selectedBackend === backend.id
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                        }`}
                      >
                        {backend.id.split('-')[1]}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-3 pt-2 border-t border-slate-200">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-slate-700">Latency</label>
                    <span className="text-xs font-medium text-slate-900">{latencyAmount}ms</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="2000"
                    step="50"
                    value={latencyAmount}
                    onChange={(e) => setLatencyAmount(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                  <button
                    onClick={() => onInjectLatency(selectedBackend)}
                    disabled={!selectedBackend}
                    className="w-full mt-2 px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-semibold transition-all shadow-sm hover:shadow flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-amber-500"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    Inject Latency
                  </button>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-slate-700">Error Rate</label>
                    <span className="text-xs font-medium text-slate-900">{errorRate}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={errorRate}
                    onChange={(e) => setErrorRate(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-red-500"
                  />
                  <button
                    onClick={() => onInjectErrors(selectedBackend)}
                    disabled={!selectedBackend}
                    className="w-full mt-2 px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-semibold transition-all shadow-sm hover:shadow flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-red-500"
                  >
                    <AlertCircle className="w-3.5 h-3.5" />
                    Inject Errors
                  </button>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-slate-700">Spike Multiplier</label>
                    <span className="text-xs font-medium text-slate-900">{spikeMultiplier}x</span>
                  </div>
                  <input
                    type="range"
                    min="2"
                    max="10"
                    step="1"
                    value={spikeMultiplier}
                    onChange={(e) => setSpikeMultiplier(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900"
                  />
                </div>

                <button
                  onClick={() => onCrash(selectedBackend)}
                  disabled={!selectedBackend}
                  className="w-full px-3 py-2 bg-slate-700 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-all shadow-sm hover:shadow flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-slate-700"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Crash Backend
                </button>
              </div>

              <div className="pt-2 border-t border-slate-200 space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-slate-700">Incoming RPS</label>
                    <span className="text-xs font-medium text-slate-900">{totalRps.toLocaleString()}</span>
                  </div>
                  <input
                    type="range"
                    min="100"
                    max="10000"
                    step="100"
                    value={totalRps}
                    onChange={(e) => onRpsChange(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>

                <button
                  onClick={() => onTrafficSpike(spikeMultiplier)}
                  className="w-full px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-all shadow-sm hover:shadow flex items-center justify-center gap-2"
                >
                  <Zap className="w-3.5 h-3.5" />
                  Traffic Spike ({spikeMultiplier}x)
                </button>

                <button
                  onClick={onReset}
                  className="w-full px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
