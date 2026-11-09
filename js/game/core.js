/*
 * Event scheduler, ported from the game's Spacewood.Core.Actions.Resolver.SystemManager / BoardSystemCoordinator.
 * Verified against the running game (docs/game-internals/SCHEDULER.md):
 *  - every system has its own pending queue of the events its predicate subscribes to;
 *  - each step runs the lowest-registered system that has pending events, then rescans;
 *  - a system consumes one event per execution ('one'), its whole batch ('all'), or a group ('group').
 * Executions never nest: events created while a system runs are only enqueued.
 */
(function (root) {
  'use strict';

  class GameEvent {
    /** @param {string} type  event class name as in the game (e.g. 'Try<DamageMinion>', 'Hurt', 'PhaseTrade') */
    constructor(type, fields) { this.type = type; Object.assign(this, fields); }
  }

  class Scheduler {
    /**
     * @param {Array<{name:string, accepts:(e:GameEvent)=>boolean, execute:(events:GameEvent[], s:Scheduler)=>void,
     *                mode?:'one'|'all'|'group', groupKey?:(e:GameEvent)=>any}>} systems in game registration order
     */
    constructor(systems, opts = {}) {
      this.systems = systems.map((s, i) => ({ mode: 'one', ...s, index: i, queue: [] }));
      this.counter = 0;          // BoardEvent.Number: creation order
      this.executing = null;     // events of the running execution (parents of anything created now)
      this.maxIterations = opts.maxIterations ?? 1000000;
      this.iterations = 0;
    }
    /** Create and enqueue an event (BoardSystem.Add). Depth = parent depth + 1, like the game. */
    add(e) {
      e.number = this.counter++;
      e.depth = this.executing && this.executing.length ? this.executing[0].depth + 1 : (e.depth ?? 0);
      for (const s of this.systems) if (s.accepts(e)) s.queue.push(e);
      return e;
    }
    /** Take the events one execution of system s consumes. */
    take(s) {
      if (s.mode === 'all') return s.queue.splice(0, s.queue.length);
      if (s.mode === 'group') {
        const key = s.groupKey(s.queue[0]);
        const batch = [], rest = [];
        for (const e of s.queue) (s.groupKey(e) === key ? batch : rest).push(e);
        s.queue = rest;
        return batch;
      }
      return [s.queue.shift()];
    }
    /** Run until every queue is empty (one SystemManager.Loop). Returns the number of executions. */
    run() {
      let n = 0;
      for (;;) {
        const s = this.systems.find((x) => x.queue.length > 0);
        if (!s) return n;
        if (++this.iterations > this.maxIterations) throw new Error('scheduler: iteration limit (endless loop)');
        const batch = this.take(s);
        const prev = this.executing;
        this.executing = batch;
        try { s.execute(batch, this); } finally { this.executing = prev; }
        n++;
      }
    }
  }

  const api = { GameEvent, Scheduler };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.SAPGame = root.SAPGame || {}; root.SAPGame.core = api; }
})(typeof window !== 'undefined' ? window : globalThis);
