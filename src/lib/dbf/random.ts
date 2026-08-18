// Small seedable PRNG (mulberry32) so "generate N rows" is reproducible
// with a given seed -- Math.random() has no seed support.
export type Rng = () => number;

export function makeRng(seed?: number): Rng {
  if (seed === undefined || seed === null || Number.isNaN(seed)) return Math.random;
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rngInt = (rng: Rng, min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min;
export const rngFloat = (rng: Rng, min: number, max: number) => rng() * (max - min) + min;
export function rngChoice<T>(rng: Rng, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}
export const round = (n: number, decimals: number) => {
  const p = 10 ** decimals;
  return Math.round(n * p) / p;
};
