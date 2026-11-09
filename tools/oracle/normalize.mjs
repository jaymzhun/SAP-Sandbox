// Normalises an EventLog from the game (Frida oracle JSON) or from js/game/sim.js into comparable one-line strings.
// Both sides use the game's class and field names; only identity (ItemId) needs mapping: the player's board Guid -> 'P', any other -> 'M'.

const SHORT = (t) => t.replace(/^.*Wrappers\./, "").replace(/`\d+$/, "").replace(/^BoardEvents\.(Interfaces\.)?/, "").replace(/^Spacewood\.Core\.Models\.Abilities\.TriggerEvent\+/, "");
const WRAPPERS = new Set(["Try", "Do", "Done", "Fail"]);

// Fields compared per event class (everything else is presentation or bookkeeping).
const FIELDS = {
  MoveMinion: ["MinionId", "From", "To"],
  MinionTrade: ["attackerId", "defenderId"],
  DamageMinion: ["Amount", "TargetId", "SourceId", "DamageType", "ResultHealth"],
  MarkMinionDead: ["TargetId", "SourceId", "DamageType"],
  DestroyMinion: ["TargetId", "SourceId", "DamageType"],
  AbilityTriggered: ["Ability", "Level", "MinionId", "TriggerEvent"],
  AbilityActivate: ["Ability", "Level", "MinionId", "TriggerEvent", "MinionActivationNumber"],
  TriggerMinions: ["MinionsToTrigger"],
  InitiatePhaseGroupEvent: ["Group"],
};
const TRIGGER_FIELDS = ["SourceId", "TargetId", "AttackerId", "DefenderId", "Amount", "IsFirstAttack", "Perk", "PetActivatedId", "AbilityEnum", "Value"];

// Player board -> P, the merged battle board (opponent pets, summons) -> M, any other board (e.g. an opponent relic) -> Q, R, ...
export function makeIdMapper(boardBefore) {
  const g = (b) => (b && typeof b === "object" ? `${b._a}:${b._b}:${b._c}:${b._d}:${b._k}` : b);
  const pg = g(boardBefore?.find((p) => p.Owner === 1 && !p.Relic)?.Id?.BoardId ?? boardBefore?.find((p) => p.Owner === 1)?.Id?.BoardId);
  const mg = g(boardBefore?.find((p) => p.Owner === 2 && !p.Relic)?.Id?.BoardId);
  const other = new Map();
  for (const p of boardBefore || []) { const k = g(p.Id.BoardId); if (k !== pg && k !== mg && !other.has(k)) other.set(k, String.fromCharCode(81 + other.size)); }
  return (id) => {
    if (!id || id.Unique === undefined) return null;
    const k = typeof id.BoardId === "string" ? null : g(id.BoardId);
    const b = typeof id.BoardId === "string" ? id.BoardId : k === pg ? "P" : other.has(k) ? other.get(k) : "M";
    return `${b}${id.Unique}`;
  };
}

function val(v, idOf) {
  if (v === null || v === undefined) return null;
  if (typeof v !== "object") return v;
  if (v.Unique !== undefined) return idOf(v);
  if (v.x !== undefined && v.y !== undefined) return v.x;
  if (v.Permanent !== undefined) return v.Temporary ? `${v.Permanent}+${v.Temporary}` : `${v.Permanent}`;
  if (v.$pet) return idOf(v.$pet.Id);
  return null;
}

/** e: one log entry (game JSON or JS event). numberOf maps a trigger event object to its Number for 'TriggerEvent' fields. */
export function line(e, idOf, opts = {}) {
  const cls = e.$type ? SHORT(e.$type) : e.cls;
  const inner = e.Event;
  const parts = [];
  let name = cls, body = e;
  if (WRAPPERS.has(cls) && inner) { body = inner; name = `${cls} ${inner.$type ? SHORT(inner.$type) : inner.cls}`; }
  const bcls = body.$type ? SHORT(body.$type) : body.cls;
  parts.push(name, `o${e.Owner}`);
  if (opts.depth) parts.push(`d${e.Depth}`);
  const keys = FIELDS[bcls] || TRIGGER_FIELDS;
  for (const k of keys) {
    const v = body[k];
    if (v === undefined) continue;
    if (k === "MinionsToTrigger") { parts.push(`[${(v || []).map((t) => idOf(t.Item1 ?? t.id)).join(",")}]`); continue; }
    if (k === "TriggerEvent") { parts.push(`on=${v ? (v.$type ? SHORT(v.$type) : v.cls) : "-"}`); continue; }
    const x = val(v, idOf);
    if (x === null || x === false) continue;
    parts.push(`${k}=${x}`);
  }
  return parts.join(" ");
}

export function lines(log, idOf, opts) { return log.map((e) => line(e, idOf, opts)); }
