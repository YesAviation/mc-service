const GRADIENT_PAIRS: Array<[string, string]> = [
  ["#f43f5e", "#8b5cf6"],
  ["#06b6d4", "#3b82f6"],
  ["#22c55e", "#0ea5e9"],
  ["#f59e0b", "#ef4444"],
  ["#84cc16", "#14b8a6"],
  ["#a855f7", "#ec4899"],
  ["#0ea5e9", "#6366f1"],
  ["#f97316", "#e11d48"],
];

function hashSeed(seed: string): number {
  let hash = 0;

  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }

  return Math.abs(hash);
}

export function gradientFromSeed(seed: string): string {
  const value = seed.trim() || "music";
  const [from, to] = GRADIENT_PAIRS[hashSeed(value) % GRADIENT_PAIRS.length];
  return `linear-gradient(135deg, ${from} 0%, ${to} 100%)`;
}
