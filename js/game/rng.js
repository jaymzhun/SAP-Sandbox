/*
 * Port of the game's RNG (GameAssembly.dll System.Random, the .NET/Mono subtractive generator) and the
 * Spacewood helpers built on it. Bit-exact: verified against the running game (see docs/game-internals).
 * Works in the browser (window.SAPGame.rng) and in Node (module.exports).
 */
(function (root) {
  'use strict';
  const MBIG = 2147483647;
  const MSEED = 161803398;

  class DotNetRandom {
    constructor(seed) {
      seed |= 0;
      const subtraction = seed === -2147483648 ? MBIG : Math.abs(seed);
      let mj = (MSEED - subtraction) | 0;
      const a = new Int32Array(56);
      a[55] = mj;
      let mk = 1;
      for (let i = 1; i < 55; i++) {
        const ii = (21 * i) % 55;
        a[ii] = mk;
        mk = (mj - mk) | 0;
        if (mk < 0) mk = (mk + MBIG) | 0;
        mj = a[ii];
      }
      for (let k = 1; k < 5; k++) {
        for (let i = 1; i < 56; i++) {
          a[i] = (a[i] - a[1 + ((i + 30) % 55)]) | 0;
          if (a[i] < 0) a[i] = (a[i] + MBIG) | 0;
        }
      }
      this.seedArray = a;
      this.inext = 0;
      this.inextp = 21;
    }
    internalSample() {
      let inext = this.inext + 1; if (inext >= 56) inext = 1;
      let inextp = this.inextp + 1; if (inextp >= 56) inextp = 1;
      const a = this.seedArray;
      let ret = (a[inext] - a[inextp]) | 0;
      if (ret === MBIG) ret--;
      if (ret < 0) ret = (ret + MBIG) | 0;
      a[inext] = ret;
      this.inext = inext; this.inextp = inextp;
      return ret;
    }
    sample() { return this.internalSample() * (1.0 / MBIG); }
    /** Next() / Next(max) / Next(min, max), exactly as System.Random */
    next(a, b) {
      if (a === undefined) return this.internalSample();
      if (b === undefined) { if (a < 0) throw new RangeError('maxValue < 0'); return Math.trunc(this.sample() * a); }
      if (a > b) throw new RangeError('min > max');
      const range = b - a;
      if (range <= MBIG) return Math.trunc(this.sample() * range) + a;
      return Math.trunc(this.largeRangeSample() * range) + a;
    }
    largeRangeSample() {
      let result = this.internalSample();
      if (this.internalSample() % 2 === 0) result = -result;
      return (result + 2147483646.0) / 4294967293.0;
    }
    nextDouble() { return this.sample(); }
    nextBytes(n) { const out = new Uint8Array(n); for (let i = 0; i < n; i++) out[i] = this.internalSample() & 0xff; return out; }
    /** CoreRandom.NextUlong: 8 bytes from NextBytes, little-endian Int64 (as BigInt, unsigned for ordering) */
    nextUlong() { const b = this.nextBytes(8); let v = 0n; for (let i = 7; i >= 0; i--) v = (v << 8n) | BigInt(b[i]); return v; }
  }

  /** Spacewood.Core.Extensions.Randomizer */
  const Randomizer = {
    positiveInteger: (r) => r.next(1, 2147483647), // Next(1, int.MaxValue)
    fiftyFifty: (r) => r.next(2) === 1,
  };

  /** GuidExtensions.ToLossyInt: first 4 bytes of Guid.ToByteArray(), little-endian Int32 */
  function guidToLossyInt(bytes) { return (bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)) | 0; }

  const api = { DotNetRandom, Randomizer, guidToLossyInt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.SAPGame = root.SAPGame || {}; root.SAPGame.rng = api; }
})(typeof window !== 'undefined' ? window : globalThis);
