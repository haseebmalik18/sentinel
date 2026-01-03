'use client';

import { motion } from 'framer-motion';
import { useEffect, useState, useRef } from 'react';
import { Plus, X, Zap, RotateCcw, Clock, AlertCircle, XCircle } from 'lucide-react';

const LATENCY_BUCKETS = [
  5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100,
  120, 140, 160, 180, 200, 225, 250, 300,
  400, 500, 600, 700, 800, 900, 1000, 1200, 1500, 2000, 3000, 5000, 10000
];

const MAX_RPS = typeof window !== 'undefined'
  ? parseInt(process.env.NEXT_PUBLIC_MAX_RPS || '10000')
  : 10000;

function snapToNearestBucket(value: number): number {
  return LATENCY_BUCKETS.reduce((prev, curr) =>
    Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev
  );
}

type BackendState = 'HEALTHY' | 'DEGRADING' | 'UNHEALTHY' | 'RECOVERING';
type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

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

interface RequestFlowProps {
  backends: Backend[];
  totalRps: number;
  onAddBackend: () => void;
  canAddBackend: boolean;
  onRemoveBackend: (backendId: string) => void;
  onInjectLatency: (backendId: string, latencyMs: number) => void;
  onInjectErrors: (backendId: string, errorRate: number) => void;
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
  const [latencyAmount, setLatencyAmount] = useState(400);
  const [errorRate, setErrorRate] = useState(80);
  const [spikeMultiplier, setSpikeMultiplier] = useState(3);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [positions, setPositions] = useState({ sentinelX: 20, backendX: 75 });

  useEffect(() => {
    const updatePositions = () => {
      const canvas = canvasRef.current;
      if (!canvas || !canvas.parentElement) return;

      const rect = canvas.parentElement.getBoundingClientRect();
      const sentinelBox = canvas.parentElement.querySelector('[data-sentinel-box]');
      const backendElements = canvas.parentElement.querySelectorAll('[data-backend-card]');

      let sentinelRightX = rect.width * 0.20;
      if (sentinelBox) {
        const sentinelRect = sentinelBox.getBoundingClientRect();
        sentinelRightX = sentinelRect.right - rect.left;
      }

      let backendLeftX = rect.width * 0.75;
      if (backendElements && backendElements.length > 0) {
        const firstBackend = backendElements[0].getBoundingClientRect();
        backendLeftX = firstBackend.left - rect.left;
      }

      setPositions({
        sentinelX: (sentinelRightX / rect.width) * 100,
        backendX: (backendLeftX / rect.width) * 100
      });
    };

    setParticles([]);
    requestAnimationFrame(() => {
      requestAnimationFrame(updatePositions);
    });
  }, [isPanelOpen, backends]);

  useEffect(() => {
    if (backends.length > 0 && !backends.find(b => b.id === selectedBackend)) {
      setSelectedBackend(backends[0].id);
    }
  }, [backends, selectedBackend]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const drawCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.scale(dpr, dpr);

      ctx.clearRect(0, 0, rect.width, rect.height);

      const sentinelBox = canvas.parentElement?.querySelector('[data-sentinel-box]');
      const backendElements = canvas.parentElement?.querySelectorAll('[data-backend-card]');

      let sentinelRightX = rect.width * 0.20; // fallback
      let sentinelCenterY = rect.height * 0.5; // fallback

      if (sentinelBox) {
        const sentinelRect = sentinelBox.getBoundingClientRect();
        sentinelRightX = (sentinelRect.right - rect.left);
        sentinelCenterY = (sentinelRect.top + sentinelRect.height / 2) - rect.top;
      }

      setPositions({
        sentinelX: (sentinelRightX / rect.width) * 100,
        backendX: rect.width > 0 && backendElements && backendElements.length > 0
          ? ((backendElements[0].getBoundingClientRect().left - rect.left) / rect.width) * 100
          : 75
      });

      let backendLeftPosition = rect.width * 0.75; // fallback

      if (backendElements && backendElements.length > 0) {
        const firstBackend = backendElements[0].getBoundingClientRect();
        backendLeftPosition = firstBackend.left - rect.left;
      }

      const startX = sentinelRightX;
      const startY = sentinelCenterY;

      backends.forEach((backend, index) => {
        const totalSlots = canAddBackend ? backends.length + 1 : backends.length;
        const targetY = getBackendY(index, totalSlots);
        const opacity = backend.weight / 100;
        const trafficIntensity = Math.min(1, totalRps / (MAX_RPS * 0.5));
        const strokeWidth = Math.max(2.5, 2 + (trafficIntensity * 1.5));
        const lineOpacity = Math.max(0.7, 0.5 + (opacity * 0.3) + (trafficIntensity * 0.15));

        const endX = backendLeftPosition; // Use actual backend position
        const endY = rect.height * (targetY / 100);

        const gradient = ctx.createLinearGradient(startX, startY, endX, endY);
        gradient.addColorStop(0, 'rgba(96, 165, 250, 0.8)'); // Blue
        gradient.addColorStop(1, 'rgba(148, 163, 184, 0.9)'); // Slate

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = strokeWidth;
        ctx.globalAlpha = lineOpacity;
        ctx.lineCap = 'round';
        ctx.stroke();

        ctx.globalAlpha = 1;
        ctx.fillStyle = '#64748b';
        ctx.font = '600 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(
          `${backend.weight}%`,
          (startX + endX) / 2,
          (startY + endY) / 2
        );
      });
    };

    drawCanvas();

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(drawCanvas);
    });

    resizeObserver.observe(canvas.parentElement!);

    return () => resizeObserver.disconnect();
  }, [backends, totalRps, canAddBackend, isPanelOpen]);

  useEffect(() => {
    if (totalRps < 10 || backends.length === 0) {
      setParticles([]); // Clear existing particles
      return;
    }

    const MAX_PARTICLES = 50;
    const PARTICLE_LIFETIME = 1200; // Fixed lifetime in ms

    const targetSpawnRate = MAX_PARTICLES / (PARTICLE_LIFETIME / 1000); // particles per second
    const TICK_INTERVAL = 1000 / targetSpawnRate; // ms between spawns

    const interval = setInterval(() => {
      setParticles(prev => {
        if (prev.length >= MAX_PARTICLES) {
          return prev;
        }

        const getEffectiveWeight = (backend: Backend) => {
          if (backend.circuitState === 'OPEN') return 0;
          if (backend.circuitState === 'HALF_OPEN') return backend.weight * 0.05;
          return backend.weight * (backend.rampUpPercentage / 100);
        };

        const totalWeight = backends.reduce((sum, b) => sum + getEffectiveWeight(b), 0);
        if (totalWeight === 0) return prev;

        const random = Math.random() * totalWeight;
        let cumulative = 0;
        let targetIndex = 0;

        for (let j = 0; j < backends.length; j++) {
          cumulative += getEffectiveWeight(backends[j]);
          if (random <= cumulative) {
            targetIndex = j;
            break;
          }
        }

        const newParticle: Particle = {
          id: `${Date.now()}-${Math.random()}`,
          targetIndex,
        };

        setTimeout(() => {
          setParticles(prev => prev.filter(p => p.id !== newParticle.id));
        }, PARTICLE_LIFETIME);

        return [...prev, newParticle];
      });
    }, TICK_INTERVAL);

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
        <canvas
          ref={canvasRef}
          className="absolute inset-0 pointer-events-none"
          style={{ width: '100%', height: '100%' }}
        />

        {particles.map((particle) => {
          const totalSlots = canAddBackend ? backends.length + 1 : backends.length;
          const targetY = getBackendY(particle.targetIndex, totalSlots);
          const animDuration = 1.2;
          return (
            <motion.div
              key={particle.id}
              className="absolute w-1.5 h-1.5 rounded-full bg-blue-400"
              style={{
                left: `${positions.sentinelX}%`,
                top: '50%',
                boxShadow: '0 0 4px rgba(59, 130, 246, 0.3)',
              }}
              initial={{
                opacity: 0.9,
                scale: 1,
                x: '0%',
                y: '-50%'
              }}
              animate={{
                left: `${positions.backendX}%`,
                top: `${targetY}%`,
                opacity: 0.2,
                scale: 0.9,
                x: '0%',
                y: '-50%'
              }}
              transition={{
                duration: animDuration,
                ease: [0.16, 1, 0.3, 1],
              }}
            />
          );
        })}

        <motion.div
          className="absolute left-[20%] top-1/2 -translate-x-1/2 -translate-y-1/2"
          data-sentinel-box
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
              {(() => {
                const totalBackendRps = backends.reduce((sum, b) => sum + b.rps, 0);
                const totalSuccessfulRps = backends.reduce((sum, b) =>
                  sum + (b.rps * (1 - b.errorRate / 100)), 0
                );
                const fulfillmentRate = totalBackendRps > 0 ? (totalSuccessfulRps / totalBackendRps) * 100 : 100;
                const rateColor = fulfillmentRate >= 95 ? 'text-green-600' :
                                 fulfillmentRate >= 90 ? 'text-amber-600' : 'text-red-600';
                return (
                  <div className={`text-xs font-medium mt-1 ${rateColor}`}>
                    ✓ {fulfillmentRate.toFixed(1)}%
                  </div>
                );
              })()}
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
              data-backend-card
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
                      backend.state === 'RECOVERING' ? 'bg-blue-400' :
                      backend.healthScore > 0 ? (
                        backend.healthScore >= 75 ? 'bg-green-400' :
                        backend.healthScore >= 40 ? 'bg-amber-400' :
                        'bg-red-400'
                      ) : (
                        backend.state === 'HEALTHY' ? 'bg-green-400' :
                        backend.state === 'DEGRADING' ? 'bg-amber-400' :
                        'bg-red-400'
                      )
                    }`} />
                    <div className="text-xs text-slate-500">{backend.latency}ms</div>
                  </div>
                </div>
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
              </div>

              {isHovered && (
                <div className="absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-slate-900 text-white rounded-lg px-4 py-3 shadow-lg min-w-50 z-10">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-300">Weight</span>
                      <span className="font-semibold">
                        {backend.circuitState === 'OPEN' ? (
                          <span className="text-red-400">{backend.weight}% → 0% (Circuit Open)</span>
                        ) : backend.circuitState === 'HALF_OPEN' ? (
                          <span className="text-amber-400">{backend.weight}% (Testing)</span>
                        ) : backend.rampUpPercentage < 100 ? (
                          <span className="text-blue-400">{backend.weight}% → {Math.ceil(backend.weight * backend.rampUpPercentage / 100)}% (Ramping {backend.rampUpPercentage}%)</span>
                        ) : (
                          `${backend.weight}%`
                        )}
                      </span>
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
                    min="5"
                    max="2000"
                    step="1"
                    value={latencyAmount}
                    onChange={(e) => setLatencyAmount(snapToNearestBucket(Number(e.target.value)))}
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                  <button
                    onClick={() => onInjectLatency(selectedBackend, latencyAmount)}
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
                    onClick={() => onInjectErrors(selectedBackend, errorRate)}
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
                    min="0"
                    max={MAX_RPS}
                    step={MAX_RPS >= 10000 ? 500 : 50}
                    value={totalRps}
                    onChange={(e) => onRpsChange(Number(e.target.value))}
                    disabled={backends.length === 0}
                    className={`w-full h-1.5 bg-slate-200 rounded-lg appearance-none ${
                      backends.length === 0 ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'
                    } accent-blue-500`}
                  />
                  {backends.length === 0 && (
                    <p className="text-xs text-slate-500 mt-1">Add backends to enable traffic</p>
                  )}
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
