// Frida agent for the game bridge: builds two boards from the editor's teams and plays them in the game's own
// debug battle (Spacewood.Unity.Memory.DebugBoard → the battle scene's BattleController plays it offline).
// Uses only GameAssembly.dll's exported il2cpp_* API; every class and method is looked up by name, no fixed addresses.
'use strict';

const GA = Process.getModuleByName('GameAssembly.dll');
const api = {};
function fn(name, ret, args) { api[name] = new NativeFunction(GA.getExportByName(name), ret, args); }
fn('il2cpp_domain_get', 'pointer', []);
fn('il2cpp_thread_attach', 'pointer', ['pointer']);
fn('il2cpp_domain_get_assemblies', 'pointer', ['pointer', 'pointer']);
fn('il2cpp_assembly_get_image', 'pointer', ['pointer']);
fn('il2cpp_class_from_name', 'pointer', ['pointer', 'pointer', 'pointer']);
fn('il2cpp_class_get_method_from_name', 'pointer', ['pointer', 'pointer', 'int']);
fn('il2cpp_class_get_parent', 'pointer', ['pointer']);
fn('il2cpp_class_get_fields', 'pointer', ['pointer', 'pointer']);
fn('il2cpp_class_get_field_from_name', 'pointer', ['pointer', 'pointer']);
fn('il2cpp_field_get_name', 'pointer', ['pointer']);
fn('il2cpp_field_get_offset', 'size_t', ['pointer']);
fn('il2cpp_field_get_flags', 'int', ['pointer']);
fn('il2cpp_field_static_set_value', 'void', ['pointer', 'pointer']);
fn('il2cpp_runtime_class_init', 'void', ['pointer']);
fn('il2cpp_object_new', 'pointer', ['pointer']);
fn('il2cpp_object_get_class', 'pointer', ['pointer']);
fn('il2cpp_string_chars', 'pointer', ['pointer']);
fn('il2cpp_string_length', 'int', ['pointer']);
fn('il2cpp_gc_wbarrier_set_field', 'void', ['pointer', 'pointer', 'pointer']);
fn('il2cpp_gchandle_new', 'uint32', ['pointer', 'bool']);
fn('il2cpp_gchandle_free', 'void', ['uint32']);

// game methods: managed exceptions unwind through IL2CPP's own (C++) handlers
const NF_OPTS = { exceptions: 'propagate' };
const domain = api.il2cpp_domain_get();
api.il2cpp_thread_attach(domain);
const images = (() => {
  const n = Memory.alloc(8); const arr = api.il2cpp_domain_get_assemblies(domain, n); const out = [];
  for (let i = 0; i < n.readU64().toNumber(); i++) out.push(api.il2cpp_assembly_get_image(arr.add(i * 8).readPointer()));
  return out;
})();
const classCache = {};
function cls(fullName) {
  if (classCache[fullName]) return classCache[fullName];
  const i = fullName.lastIndexOf('.');
  const ns = Memory.allocUtf8String(i < 0 ? '' : fullName.slice(0, i)), nm = Memory.allocUtf8String(fullName.slice(i + 1));
  for (const img of images) { const k = api.il2cpp_class_from_name(img, ns, nm); if (!k.isNull()) return (classCache[fullName] = k); }
  throw new Error('class not found: ' + fullName);
}
function method(k, name, argc) {
  const m = api.il2cpp_class_get_method_from_name(k, Memory.allocUtf8String(name), argc);
  if (m.isNull()) throw new Error(`method not found: ${name}/${argc}`);
  return m;
}
const fnCache = {};
// call(class, name, argTypes, ret, args): argTypes[0] === 'this' for instance methods
function call(k, name, argTypes, ret, args) {
  const key = `${k}|${name}|${argTypes.length}`;
  if (!fnCache[key]) {
    const m = method(k, name, argTypes.length - (argTypes[0] === 'this' ? 1 : 0));
    fnCache[key] = { m, f: new NativeFunction(m.readPointer(), ret, argTypes.map(t => (t === 'this' ? 'pointer' : t)).concat(['pointer']), NF_OPTS) };
  }
  const { m, f } = fnCache[key];
  return f(...args, m);
}
const str = s => (s.isNull() ? null : api.il2cpp_string_chars(s).readUtf16String(api.il2cpp_string_length(s)));
const FIELD_STATIC = 0x10;
function fieldOffset(obj, name) {
  for (let k = api.il2cpp_object_get_class(obj); !k.isNull(); k = api.il2cpp_class_get_parent(k)) {
    const it = Memory.alloc(8); it.writePointer(NULL);
    for (;;) {
      const f = api.il2cpp_class_get_fields(k, it); if (f.isNull()) break;
      if (api.il2cpp_field_get_flags(f) & FIELD_STATIC) continue;
      const n = api.il2cpp_field_get_name(f).readUtf8String().replace(/^<(.*)>k__BackingField$/, '$1');
      if (n === name) return api.il2cpp_field_get_offset(f).toNumber();
    }
  }
  throw new Error('no field ' + name);
}
// pointer stores go through the GC write barrier (Unity's incremental GC needs it)
function setField(obj, name, val) { api.il2cpp_gc_wbarrier_set_field(obj, obj.add(fieldOffset(obj, name)), val); }
// a reference-type static field takes the object itself
function setStatic(k, name, val) {
  api.il2cpp_runtime_class_init(k);
  const f = api.il2cpp_class_get_field_from_name(k, Memory.allocUtf8String(name));
  if (f.isNull()) throw new Error('no static field ' + name);
  api.il2cpp_field_static_set_value(f, val);
}
// keep objects alive between our calls (freed when the next battle is sent)
let handles = [];
function pin(o) { handles.push(api.il2cpp_gchandle_new(o, 0)); return o; }
// Nullable<int> passed by value: HasValue in the low byte, the value in the high half
const nullableInt = v => (v === null || v === undefined ? uint64(0) : uint64(1).or(uint64(v >>> 0).shl(32)));

// ---- run work on the game's main thread: EventSystem.Update is called every frame ----
let pending = null;
Interceptor.attach(method(cls('UnityEngine.EventSystems.EventSystem'), 'Update', 0).readPointer(), {
  onEnter() {
    if (!pending) return;
    const t = pending; pending = null;
    try { t.resolve(t.fn()); } catch (e) { t.reject(e); }
  },
});
const onMainThread = f => new Promise((resolve, reject) => { pending = { fn: f, resolve, reject }; });

// ---- boards ----
const C = {};
function classes() {
  if (C.ok) return;
  for (const n of ['Spacewood.Core.Models.Builder.BattleBuilder', 'Spacewood.Core.Models.Builder.BoardBuilder', 'Spacewood.Core.Models.MinionParsingTemplate',
    'Spacewood.Core.Models.CoreRandom', 'Spacewood.Unity.Model.DebugBoardModel', 'Spacewood.Unity.Memory', 'Spacewood.Unity.Utilities.SceneU']) C[n.split('.').pop()] = cls(n);
  C.ok = true;
}
// a pet: { enum, level, attack, health, perk, exp, mana } (game enum values)
function template(p) {
  const T = C.MinionParsingTemplate, t = api.il2cpp_object_new(T);
  call(T, '.ctor', ['this'], 'void', [t]);
  call(T, 'set_MinionEnum', ['this', 'int'], 'void', [t, p.enum]);
  call(T, 'set_Level', ['this', 'int'], 'void', [t, p.level || 1]);
  const opt = (setter, v) => { if (v != null) call(T, setter, ['this', 'uint64'], 'void', [t, nullableInt(v)]); };
  opt('set_Attack', p.attack); opt('set_Health', p.health); opt('set_Perk', p.perk); opt('set_Exp', p.exp); opt('set_Mana', p.mana);
  return t;
}
function fill(list, pets) {
  const lk = api.il2cpp_object_get_class(list), add = method(lk, 'Add', 1);
  const f = new NativeFunction(add.readPointer(), 'void', ['pointer', 'pointer', 'pointer'], NF_OPTS);
  for (const p of pets) f(list, template(p), add);
}
const BOARD_INTS = ['RollsThisTurn', 'TransformationsThisTurn', 'GoldSpent', 'MaxLevelMinionsSold'];
function buildBoards(spec) {
  const bb = pin(call(C.BattleBuilder, 'Test', [], 'pointer', []));
  const pb = call(C.BattleBuilder, 'get_PlayerBoard', ['this'], 'pointer', [bb]);
  const ob = call(C.BattleBuilder, 'get_OpponentBoard', ['this'], 'pointer', [bb]);
  fill(call(C.BoardBuilder, 'get_Minions', ['this'], 'pointer', [pb]), spec.player);
  fill(call(C.BoardBuilder, 'get_Minions', ['this'], 'pointer', [ob]), spec.opponent);
  call(C.BattleBuilder, 'SetTurn', ['this', 'int'], 'pointer', [bb, spec.turn || 1]);
  const rnd = pin(api.il2cpp_object_new(C.CoreRandom)); call(C.CoreRandom, '.ctor', ['this', 'int'], 'void', [rnd, spec.seed | 0]);
  const p = pin(call(C.BoardBuilder, 'ToModel', ['this', 'pointer'], 'pointer', [pb, rnd]));
  const o = pin(call(C.BoardBuilder, 'ToModel', ['this', 'pointer'], 'pointer', [ob, rnd]));
  // integer BoardModel counters some abilities read (rolls, gold spent, ...), on both boards
  for (const [k, v] of Object.entries(spec.board || {})) if (BOARD_INTS.includes(k) && Number.isInteger(v)) for (const b of [p, o]) b.add(fieldOffset(b, k)).writeS32(v);
  return { p, o };
}

rpc.exports = {
  scene() { return onMainThread(() => { classes(); return str(call(C.SceneU, 'Current', [], 'pointer', [])); }); },
  // Memory.DebugBoard set and Memory.Battle cleared: BattleController.Setup then plays Board vs OpponentBoard locally
  playBattle(spec) {
    return onMainThread(() => {
      classes();
      for (const h of handles) api.il2cpp_gchandle_free(h);
      handles = [];
      const { p, o } = buildBoards(spec);
      const d = pin(api.il2cpp_object_new(C.DebugBoardModel)); call(C.DebugBoardModel, '.ctor', ['this'], 'void', [d]);
      setField(d, 'Board', p); setField(d, 'OpponentBoard', o);
      setStatic(C.Memory, 'Battle', NULL); setStatic(C.Memory, 'DebugBoard', d);
      call(C.SceneU, 'LoadBattleScene', [], 'void', []);
      return 'ok';
    });
  },
  menu() { return onMainThread(() => { classes(); call(C.SceneU, 'LoadMenuScene', [], 'void', []); return 'ok'; }); },
};
