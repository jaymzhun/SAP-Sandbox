/*
 * Board model, ported from the game's Spacewood.Core.Models (BoardModel, MinionModel, IntegerStat, Grid<T>) and the
 * BoardExtensions / MinionExtensions helpers the resolver uses. Field names follow the game so event logs line up.
 * Source: decompiled GameAssembly.dll (build 26131463); see docs/game-internals.
 */
(function (root) {
  'use strict';

  /** Spacewood.Core.Models.IntegerStat: Permanent + Temporary, each capped at MaxOverride ?? 50. */
  class IntegerStat {
    constructor(permanent, temporary = 0, maxOverride = null) { this.Permanent = permanent; this.Temporary = temporary; this.MaxOverride = maxOverride; }
    get Max() { return this.MaxOverride ?? 50; }
    get Total() { return this.Temporary + this.Permanent; }
    get IsMax() { return this.MaxOverride != null ? this.MaxOverride <= this.Total : this.Total > 49; }
    /** IntegerStat.Set(value, temporary): clamp to max, then trim Temporary so the total never exceeds max. */
    Set(value, temporary = false) {
      const v = Math.min(this.Max, value);
      if (temporary) this.Temporary = v; else this.Permanent = v;
      const over = (this.Temporary - this.Max) + this.Permanent;
      if (over > 0) this.Temporary -= over;
    }
    /** IntegerStat.Add(value, temporary): Set(min(max, current) + value). */
    Add(value, temporary = false) { this.Set(Math.min(this.Max, temporary ? this.Temporary : this.Permanent) + value, temporary); }
    Get(temporary = false) { return Math.min(this.Max, temporary ? this.Temporary : this.Permanent); }
    ShallowCopy() { return new IntegerStat(this.Permanent, this.Temporary, this.MaxOverride); }
    toJSON() { return { Permanent: this.Permanent, Temporary: this.Temporary, MaxOverride: this.MaxOverride }; }
  }

  /** Spacewood.Core.Models.Item.ItemId = (BoardId Guid, Unique int). BoardId is 'P' (player board) or 'M' (merged/opponent). */
  const itemId = (board, unique) => ({ BoardId: board, Unique: unique });
  const idEq = (a, b) => !!a && !!b && a.Unique === b.Unique && a.BoardId === b.BoardId;
  const idKey = (a) => (a ? `${a.BoardId}${a.Unique}` : '-');

  class MinionAbilityModel {
    constructor(e, level, native = true) {
      this.Enum = e; this.Level = level; this.Native = native; this.Duration = 0; this.TriggerCount = 0; this.ActivatedCount = 0;
      this.Charges = null; this.Disabled = false; this.DisabledTemp = false; this.AlwaysIgnoreMinionLevel = false; this.IgnoreRepeats = false; this.Group = 0;
    }
  }

  /** Spacewood.Core.Models.MinionModel (battle-relevant fields). */
  class MinionModel {
    constructor(o) {
      this.Id = o.Id; this.Owner = o.Owner; this.Enum = o.Enum; this.Point = { x: o.x, y: o.y ?? 0 };
      this.Exp = o.Exp ?? 0; this.Level = o.Level ?? 1;
      this.Health = new IntegerStat(o.Health, o.HealthTemp ?? 0, o.HealthMax ?? null);
      this.Attack = new IntegerStat(o.Attack, o.AttackTemp ?? 0, o.AttackMax ?? null);
      this.Mana = o.Mana ?? 0; this.Countdown = null;
      this.LastPositivePerk = null; this.Perk = o.Perk ?? null; this.PerkBought = false;
      this.PerkDurability = o.PerkDurability ?? null; this.PerkDurabilityMax = o.PerkDurabilityMax ?? null; this.PerkMultiplier = o.PerkMultiplier ?? null; this.PerkDuration = 0;
      this.Abilities = o.Abilities || []; this.AbilitiesDisabled = false;
      this.Dead = false; this.Destroyed = false; this.DestroyedBy = null;
      this.Power = {}; this.Tribe = o.Tribe ?? null;
      this.AttackCountsThisTurn = 0; this.HurtCountsThisTurn = 0; this.SpellCountsThisTurn = 0;
      this.AttackCountsThisBattle = 0; this.JumpsThisBattle = 0; this.DamageDealtThisBattle = 0; this.HurtCountsThisBattle = 0; this.HurtTotalThisBattle = null;
      this.LastSummoned = []; this.DamageTaken = false; this.AbilityActivations = 0;
    }
    get IsAlive() { return !this.Dead && !this.Destroyed; }
  }

  /**
   * BoardModel + Grid<MinionModel>. The battle grid is 10x1: your pets x=0..4 (front x=4), enemies x=5..9 (front x=5).
   * Grid.Items is a flat list of cells (index = x for the single battle lane), so iteration order is x ascending.
   */
  class BoardModel {
    constructor(width = 10, height = 1) {
      this.Width = width; this.Height = height; this.cells = new Array(width * height).fill(null);
      this.MinionGraveyard = []; this.MinionSold = []; this.Relics = [];
      this.ReverseMinionAccess = false; this.IsBattle = true; this.UniqueNumberCounter = 0; this.BoardCapacity = 10;
      this.Trumpets = 0; this.TrumpetsDone = false; this.OpponentTrumpets = 0; this.OpponentTrumpetsDone = false;
      this.PlayerFaintsThisBattle = 0; this.OpponentFaintsThisBattle = 0; this.MinionsSummonedThisTurn = 0; this.OpponentSummons = 0; this.Turn = 1;
      this.RollsThisTurn = 0; this.OpponentRolls = 0; this.TransformationsThisTurn = 0; this.OpponentTransformations = 0; this.GoldSpent = 0; this.OpponentGoldSpent = 0;
      this.State = 0;
    }
    index(p) { return p.y * this.Width + p.x; }
    get(p) { return p.x < 0 || p.x >= this.Width || p.y < 0 || p.y >= this.Height ? null : this.cells[this.index(p)]; }
    /** BoardExtensions.SetMinion */
    setMinion(p, m) { this.cells[this.index(p)] = m; if (m) m.Point = { x: p.x, y: p.y }; }
    get Items() { return this.cells; }
    /** BoardExtensions.FindMinion(id, excludeDestroyed, excludeDead): grid cells, then graveyard, sold, relics (shop is empty in battle). */
    findMinion(id, excludeDestroyed = false, excludeDead = false) {
      if (!id) return null;
      for (const m of this.cells) if (m && idEq(m.Id, id) && (!excludeDestroyed || !m.Destroyed) && (!excludeDead || !m.Dead)) return m;
      for (const m of this.MinionGraveyard) if (m && idEq(m.Id, id) && (!excludeDestroyed || !m.Destroyed)) return m;
      for (const m of this.MinionSold) if (m && idEq(m.Id, id) && (!excludeDestroyed || !m.Destroyed)) return m;
      for (const m of this.Relics) if (m && idEq(m.Id, id) && (!excludeDestroyed || !m.Destroyed)) return m;
      return null;
    }
    findLiveMinion(idOrPoint) {
      if (idOrPoint && idOrPoint.Unique !== undefined) return this.findMinion(idOrPoint, true, true);
      const m = this.get(idOrPoint); return m ? this.findMinion(m.Id, true, true) : null;
    }
    /** BoardExtensions.FindLiveMinions(): alive pets in grid order, reversed when ReverseMinionAccess. */
    /** BoardExtensions.FindRelics(): relics in grid order, reversed when ReverseMinionAccess. */
    findRelics() { const r = this.Relics.filter(Boolean); return this.ReverseMinionAccess ? r.reverse() : r; }
    findLiveMinions() { const r = this.cells.filter((m) => m && m.IsAlive); return this.ReverseMinionAccess ? r.reverse() : r; }
    /** BoardExtensions.FindMinions(excludeDestroyed, excludeDead): grid (reversed if ReverseMinionAccess) then graveyard. */
    findMinions(excludeDestroyed, excludeDead) {
      const ok = (m) => m && (!excludeDestroyed || !m.Destroyed) && (!excludeDead || !m.Dead);
      const r = this.cells.filter(ok); if (this.ReverseMinionAccess) r.reverse();
      return r.concat(this.MinionGraveyard.filter(ok));
    }
    /** BoardExtensions.IsOccupied: a non-destroyed pet (dead or alive) holds the cell. */
    isOccupied(p) { const m = this.get(p); return !!(m && this.findMinion(m.Id, true, false)); }
    /** Resolver.BoardExtensions.Move(from, to) */
    move(from, to, force = false) {
      const m = this.get(from);
      if (!m) throw new Error(`Trying to move from a location where nothing exists (${from.x})`);
      if (this.findLiveMinion(to) && !force) throw new Error(`Trying to move to an occupied location (${to.x})`);
      this.setMinion(to, m); this.cells[this.index(from)] = null;
    }
    nextUnique() { return ++this.UniqueNumberCounter; }
  }

  /** MinionExtensions.GetFrontDistance(board, m, considerEmpty=false): live cells strictly between m and its front. */
  function getFrontDistance(board, m, absolute = false) {
    if (!m) return 0;
    const front = m.Owner !== 1 ? 5 : 4; let x = m.Point.x;
    if (absolute) return Math.abs(front - x);
    let n = 0; const step = front < x ? -1 : 1; let more = x !== front;
    while (more) { do { x += step; } while (!board.cells[x] && x !== front); n++; more = x !== front; }
    return n;
  }

  /** MinionExtensions.Damage: temporary health first, then permanent (DamageRemovableBuffs is shop-only). */
  function damageMinion(m, amount) {
    const h = m.Health;
    if (h.Temporary > 0) { const t = Math.min(h.Temporary, amount); h.Set(h.Temporary - t, true); amount -= t; }
    h.Set(h.Permanent - amount, false);
  }
  /** MinionExtensions.AddHealth: a pet with positive permanent health never drops below 1 from this. */
  function addHealth(m, amount, temporary = false) {
    const before = m.Health.Permanent; m.Health.Add(amount, temporary);
    if (m.Health.Permanent < 1 && before > 0) m.Health.Set(1, false);
    return true;
  }

  const api = { IntegerStat, MinionAbilityModel, MinionModel, BoardModel, itemId, idEq, idKey, getFrontDistance, damageMinion, addHealth };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.SAPGame = root.SAPGame || {}; root.SAPGame.model = api; }
})(typeof window !== 'undefined' ? window : globalThis);
