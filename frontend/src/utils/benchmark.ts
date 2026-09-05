export interface ClientBenchmarkReport {
  timestamp: number;
  results: Array<{
    tier: string;
    resolution: string;
    latencyMs: number;
    approxFps: number;
    confidence: number;
  }>;
  suggestedTier: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNSUPPORTED';
}

/**
 * Benchmarks Canvas2D pixel analysis latency across standard proctoring resolutions
 * entirely on the candidate CPU.
 */
export async function runClientCvBenchmark(iterations: number = 8): Promise<ClientBenchmarkReport> {
  const configs = [
    { tier: 'HIGH', w: 320, h: 240 },
    { tier: 'MEDIUM', w: 240, h: 180 },
    { tier: 'LOW', w: 160, h: 120 },
  ];

  const results = [];
  let mediumLatency = 50;

  for (const cfg of configs) {
    const canvas = document.createElement('canvas');
    canvas.width = cfg.w;
    canvas.height = cfg.h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) continue;

    // Fill simulated candidate framing
    ctx.fillStyle = '#dfd3c3';
    ctx.fillRect(0, 0, cfg.w, cfg.h);
    ctx.fillStyle = '#4a2e12';
    ctx.fillRect(cfg.w * 0.35, cfg.h * 0.25, cfg.w * 0.3, cfg.h * 0.4);

    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      const imgData = ctx.getImageData(0, 0, cfg.w, cfg.h);
      const data = imgData.data;
      let leftEnergy = 0;
      let rightEnergy = 0;
      const mid = cfg.w / 2;

      for (let y = 0; y < cfg.h; y += 2) {
        for (let x = 0; x < cfg.w; x += 2) {
          const idx = (y * cfg.w + x) * 4;
          const lum = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
          if (x < mid) leftEnergy += lum;
          else rightEnergy += lum;
        }
      }
      if (leftEnergy === 0 && rightEnergy === 0) console.log('.');
    }
    const avgLatency = (performance.now() - start) / iterations;
    const approxFps = 1000 / Math.max(1, avgLatency);

    if (cfg.tier === 'MEDIUM') {
      mediumLatency = avgLatency;
    }

    results.push({
      tier: cfg.tier,
      resolution: `${cfg.w}x${cfg.h}`,
      latencyMs: Math.round(avgLatency * 10) / 10,
      approxFps: Math.round(approxFps * 10) / 10,
      confidence: 0.95,
    });
  }

  let suggestedTier: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNSUPPORTED' = 'MEDIUM';
  if (mediumLatency < 25) suggestedTier = 'HIGH';
  else if (mediumLatency < 60) suggestedTier = 'MEDIUM';
  else if (mediumLatency < 120) suggestedTier = 'LOW';
  else suggestedTier = 'UNSUPPORTED';

  return {
    timestamp: Date.now(),
    results,
    suggestedTier,
  };
}
