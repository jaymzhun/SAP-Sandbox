/*
 * Editor info from the game's own ability definitions (js/game/data.js): per site pet and level, whether its abilities act in
 * battle, only in the shop, or only on gold / the shop; the trigger limit (Ability.TriggerLimit, unless TriggerLimitType 2 = shop only);
 * and the charge counter of a charging ability (Ability.Charges, counted by its ChargeTrigger).
 */
(function (root) {
  'use strict';
  // triggers that only fire outside battle (the battle never raises these events)
  const SHOP_TRIGGERS = new Set(['TriggerStartTurn', 'TriggerEndTurn', 'TriggerSell', 'TriggerBeforeSell', 'TriggerPlayMinion', 'TriggerRoll',
    'TriggerUpgradeShopTier', 'TriggerGoldSpent']);
  // effects that only change gold, the shop or the shop's spells (nothing on the battle board)
  const SHOP_EFFECTS = new Set(['EffectGainGold', 'EffectGainRolls', 'EffectAddShopMinion', 'EffectAddShopSpell', 'EffectBuffShopMinions',
    'EffectBuffShopPermanent', 'EffectDiscountMinion', 'EffectDiscountSpell', 'EffectFreezeShop', 'EffectRollShop', 'EffectReplaceSpellShop',
    'EffectSwallowShop', 'EffectAddSellValue', 'EffectChooseMinion', 'EffectChooseSpell', 'EffectStealSpell', 'EffectChangeVictoryMax', 'EffectGainLives']);
  const short = (t) => (t || '').replace(/^.*\./, '');

  function triggerTypes(tr) {
    const out = [];
    const walk = (o) => { if (!o || typeof o !== 'object') return; if (typeof o.$type === 'string' && /^Triggers\.Trigger/.test(o.$type) && o.$type !== 'Triggers.TriggerComposite') out.push(short(o.$type));
      for (const [k, v] of Object.entries(o)) if (k !== 'MinionFinder' && k !== 'Conditions') walk(v); };
    walk(tr); return out;
  }
  function effectTypes(ab) {
    const out = [];
    const walk = (o) => { if (!o || typeof o !== 'object') return; if (typeof o.$type === 'string' && /^Effects\.Effect/.test(o.$type)) out.push(short(o.$type));
      for (const v of Object.values(o)) walk(v); };
    for (const p of ab.Pairs || []) walk(p.Effect);
    return out;
  }
  /** 'battle' | 'goldshop' (battle trigger, shop-only effects) | 'shop' | 'passive' (aura) | null (nothing) */
  function abilityKind(ab) {
    const trig = ab.Trigger ? triggerTypes(ab.Trigger) : [];
    if (!trig.length) return ab.AuraEnum != null ? 'passive' : null;
    let inBattle = trig.some((t) => !SHOP_TRIGGERS.has(t) && t !== 'TriggerCharged');
    if (trig.includes('TriggerCharged')) inBattle = true; // fires when its charging ability fills up (checked on that ability)
    if (!inBattle) return 'shop';
    const eff = effectTypes(ab);
    if (eff.length && eff.every((e) => SHOP_EFFECTS.has(e))) return 'goldshop';
    return 'battle';
  }

  function build(SD, G, A) {
    const status = {}, abilities = {};
    for (const id of Object.keys(SD.pets)) {
      const e = A.MINION[id]; const t = e != null ? G.minions[e] : null;
      const levels = [], limits = [], charges = [], kinds = [];
      let endTurn = false;
      for (let lv = 1; lv <= 3; lv++) {
        let k = null, lim = 0, ch = 0;
        for (const a of (t ? t.abilities : [])) {
          const ab = (G.abilities[a.e] || {})[lv]; if (!ab) continue;
          const kk = abilityKind(ab);
          if (ab.Trigger && triggerTypes(ab.Trigger).includes('TriggerEndTurn')) endTurn = true;
          // a charging ability (Charges + ChargeTrigger): the counter shown in the editor, when it charges in battle
          if (ab.Charges != null && ab.ChargeTrigger && !SHOP_TRIGGERS.has(short(ab.ChargeTrigger.$type))) ch = ab.Charges;
          if (ab.TriggerLimit != null && (ab.TriggerLimitType || 0) !== 2 && kk === 'battle') lim = lim || ab.TriggerLimit;
          const rank = { battle: 4, goldshop: 3, passive: 2, shop: 1 };
          if (kk && (!k || rank[kk] > rank[k])) k = kk;
        }
        kinds.push(k); levels.push(k === 'battle' || k === 'passive'); limits.push(lim); charges.push(ch);
      }
      const any = (x) => kinds.includes(x);
      const st = any('battle') ? 'ok' : any('passive') ? 'passive' : any('goldshop') ? 'goldshop' : any('shop') ? 'shop' : 'none';
      status[id] = { status: st, endTurn };
      abilities[id] = { levels, limit: limits, charges };
    }
    return { status, abilities };
  }

  const api = { build, abilityKind };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else { root.SAPGame = root.SAPGame || {}; root.SAPGame.info = api; }
})(typeof window !== 'undefined' ? window : globalThis);
