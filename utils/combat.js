/**
 * Shared turn-based combat engine for PvP duels and Co-Op raids.
 * Handles class passives, energy, a generic move executor, and status effects
 * (poison, bleed, stun, shield, regen, attack_up, attack_down/weaken, evasion).
 */

// ---- Class definitions: passive + signature special (rebalanced) ----
const CLASSES = {
  berserker: {
    name: 'Berserker',
    passive: 'Bloodlust — deals +35% damage while below 50% HP.',
    special: { name: 'Rampage', cost: 100, desc: 'Three furious strikes that make the enemy Bleed.' }
  },
  guardian: {
    name: 'Guardian',
    passive: 'Stonewall — takes 12% less damage from every attack.',
    special: { name: 'Fortress', cost: 80, desc: 'Raise a shield (45% less damage, 2 turns) and restore HP.' }
  },
  assassin: {
    name: 'Assassin',
    passive: 'Deadly Precision — +30% critical hit chance.',
    special: { name: 'Shadow Strike', cost: 90, desc: 'A guaranteed critical that ignores defense, dodge and block.' }
  },
  monk: {
    name: 'Monk',
    passive: 'Inner Peace — restores 5% max HP at the start of each turn.',
    special: { name: 'Chakra Burst', cost: 85, desc: 'Strike, cleanse all your debuffs and heal yourself.' }
  },
  mage: {
    name: 'Mage',
    passive: 'Arcane Mastery — basic attacks ignore 50% of enemy defense.',
    special: { name: 'Meteor', cost: 100, desc: 'Massive burst damage that ignores all defense.' }
  },
  paladin: {
    name: 'Paladin',
    passive: 'Divine Grace — 28% chance to fully block an attack.',
    special: { name: 'Holy Nova', cost: 90, desc: 'Smite the enemy and gain a protective shield.' }
  },
  necromancer: {
    name: 'Necromancer',
    passive: 'Life Leech — heals for 12% of damage dealt on basic attacks.',
    special: { name: 'Soul Harvest', cost: 95, desc: 'Drain HP and inflict Poison on the enemy.' }
  },
  samurai: {
    name: 'Samurai',
    passive: 'Counter Stance — 30% chance to counter an incoming attack.',
    special: { name: 'Iaido Slash', cost: 90, desc: 'A precise slash dealing bonus damage and inflicting Bleed.' }
  },
  druid: {
    name: 'Druid',
    passive: 'Regrowth — regenerates 3.5% max HP each turn.',
    special: { name: "Nature's Wrath", cost: 85, desc: 'Entangle (Stun) the enemy and deal nature damage.' }
  },
  ninja: {
    name: 'Ninja',
    passive: 'Evasion — 18% chance to fully dodge an attack.',
    special: { name: 'Shuriken Storm', cost: 80, desc: 'Two rapid strikes that may Stun the enemy.' }
  },
  bard: {
    name: 'Bard',
    passive: 'Battle Anthem — +8% damage, regenerates 4% max HP each turn, and gains +50% energy.',
    special: { name: 'Crescendo', cost: 100, desc: 'Buff your attack for 3 turns and deal sonic damage.' }
  },
  valkyrie: {
    name: 'Valkyrie',
    passive: 'Battle Fervor — +8% damage and heals when landing a critical hit.',
    special: { name: 'Valhalla Dive', cost: 95, desc: 'A divine dive dealing heavy damage and healing you.' }
  }
};

function getClass(style) {
  const key = String(style || '').toLowerCase();
  return CLASSES[key] || CLASSES.berserker;
}

// ---- Combatant factory ----
function createCombatant(doc, extra = {}) {
  const maxHp = doc.maxHp || doc.hp || 100;
  return {
    userId: doc.userId,
    _id: doc._id,
    name: doc.name,
    style: doc.fightingStyle,
    classKey: String(doc.fightingStyle || 'berserker').toLowerCase(),
    level: doc.level || 1,
    maxHp,
    hp: maxHp,
    attack: doc.attack,
    defense: doc.defense,
    energy: 0,
    maxEnergy: 100,
    statuses: [],
    guarding: false,
    isAlive: true,
    potions: 0,
    ...extra
  };
}

// ---- Helpers ----
function gainEnergy(c, amount) {
  const mult = c.classKey === 'bard' ? 1.5 : 1;
  c.energy = Math.min(c.maxEnergy, c.energy + Math.round(amount * mult));
}

function addStatus(c, type, duration, value = 0) {
  c.statuses.push({ type, duration, value });
}

function healRaw(c, amount) {
  const before = c.hp;
  c.hp = Math.min(c.maxHp, c.hp + Math.max(0, Math.round(amount)));
  return c.hp - before;
}

/**
 * Applies mitigated damage to a defender, factoring passives, guard and shields.
 * opts: ignoreEvasion, ignoreBlock, ignoreGuardian
 */
function applyDamage(defender, rawDamage, opts = {}) {
  const notes = [];
  let dmg = rawDamage;

  if (!opts.ignoreEvasion) {
    let evade = defender.classKey === 'ninja' ? 0.18 : 0;
    const ev = defender.statuses.find(s => s.type === 'evasion');
    if (ev) evade += ev.value;
    if (Math.random() < evade) {
      return { damage: 0, evaded: true, notes: [`💨 **${defender.name}** dodged the attack!`] };
    }
  }

  if (!opts.ignoreBlock && defender.classKey === 'paladin' && Math.random() < 0.27) {
    return { damage: 0, blocked: true, notes: [`🛡️ **${defender.name}**'s Divine Grace blocked the attack!`] };
  }

  if (!opts.ignoreGuardian && defender.classKey === 'guardian') dmg *= 0.83;
  if (defender.guarding) dmg *= 0.5;
  const shield = defender.statuses.find(s => s.type === 'shield');
  if (shield) dmg *= (1 - shield.value);

  dmg = Math.max(1, Math.round(dmg));
  defender.hp = Math.max(0, defender.hp - dmg);
  if (defender.hp <= 0) defender.isAlive = false;
  return { damage: dmg, notes };
}

/**
 * Ticks start-of-turn effects: class regen, poison/bleed/regen, stun.
 * Also clears the previous guard stance. Returns { logs, stunned }.
 */
function tickStatuses(c) {
  const logs = [];
  let stunned = false;
  c.guarding = false;

  if (c.classKey === 'monk') {
    const h = healRaw(c, c.maxHp * 0.05);
    if (h > 0) logs.push(`🧘 **${c.name}**'s Inner Peace restored ${h} HP.`);
  }
  if (c.classKey === 'druid') {
    const h = healRaw(c, c.maxHp * 0.04);
    if (h > 0) logs.push(`🌿 **${c.name}**'s Regrowth restored ${h} HP.`);
  }
  if (c.classKey === 'bard') {
    const h = healRaw(c, c.maxHp * 0.04);
    if (h > 0) logs.push(`🎶 **${c.name}**'s Battle Anthem restored ${h} HP.`);
  }

  for (const s of c.statuses) {
    if (s.type === 'poison') { c.hp = Math.max(0, c.hp - s.value); logs.push(`☠️ **${c.name}** takes ${s.value} poison damage.`); }
    else if (s.type === 'bleed') { c.hp = Math.max(0, c.hp - s.value); logs.push(`🩸 **${c.name}** bleeds for ${s.value} damage.`); }
    else if (s.type === 'regen') { const h = healRaw(c, s.value); if (h > 0) logs.push(`💚 **${c.name}** regenerates ${h} HP.`); }
    else if (s.type === 'stun') { stunned = true; }
    s.duration -= 1;
  }
  c.statuses = c.statuses.filter(s => s.duration > 0);
  if (c.hp <= 0) c.isAlive = false;
  if (stunned) logs.push(`💫 **${c.name}** is stunned and loses their turn!`);
  return { logs, stunned };
}

function effectiveAttack(attacker) {
  let atk = attacker.attack;
  const up = attacker.statuses.find(s => s.type === 'attack_up');
  if (up) atk *= (1 + up.value);
  const down = attacker.statuses.find(s => s.type === 'attack_down');
  if (down) atk *= (1 - down.value);
  if (attacker.classKey === 'berserker' && attacker.hp < attacker.maxHp * 0.45) atk *= 1.28;
  if (attacker.classKey === 'valkyrie') atk *= 1.10;
  if (attacker.classKey === 'bard') atk *= 1.08;
  return atk;
}

// ---- Basic actions ----
function performAttack(attacker, defender) {
  const logs = [];
  let critChance = 0.15;
  if (attacker.classKey === 'assassin') critChance += 0.30;
  const isCrit = Math.random() < critChance;

  let effDef = defender.defense * 0.5;
  if (attacker.classKey === 'mage') effDef *= 0.5;
  let raw = effectiveAttack(attacker) * (isCrit ? 1.6 : 1.0) - effDef;

  const res = applyDamage(defender, raw);
  gainEnergy(attacker, 25);
  gainEnergy(defender, 15);

  if (res.evaded || res.blocked) { logs.push(...res.notes); return { logs, damage: 0 }; }

  logs.push(isCrit
    ? `💥 **CRITICAL!** **${attacker.name}** hit **${defender.name}** for **${res.damage}** damage!`
    : `⚔️ **${attacker.name}** struck **${defender.name}** for **${res.damage}** damage.`);

  if (attacker.classKey === 'necromancer') { const h = healRaw(attacker, res.damage * 0.20); if (h > 0) logs.push(`🩸 **${attacker.name}** leeched **${h}** HP.`); }
  if (attacker.classKey === 'valkyrie' && isCrit) { const h = healRaw(attacker, res.damage * 0.2); if (h > 0) logs.push(`🕊️ **${attacker.name}** recovered **${h}** HP.`); }

  if (defender.isAlive && defender.classKey === 'samurai' && Math.random() < 0.30) {
    const cRes = applyDamage(attacker, defender.attack * 0.55 - attacker.defense * 0.5, { ignoreEvasion: true, ignoreBlock: true });
    logs.push(`🗡️ **${defender.name}** countered for **${cRes.damage}** damage!`);
  }
  return { logs, damage: res.damage, isCrit };
}

function performGuard(c) {
  c.guarding = true;
  gainEnergy(c, 30);
  return { logs: [`🛡️ **${c.name}** blocks — the next hit is halved (no damage dealt).`] };
}

function bleedValue(a) { return Math.max(2, Math.round(effectiveAttack(a) * 0.2)); }
function poisonValue(a) { return Math.max(2, Math.round(effectiveAttack(a) * 0.25)); }

// ---- Signature specials (rebalanced) ----
function performSpecial(attacker, defender) {
  const cls = getClass(attacker.style);
  if (attacker.energy < cls.special.cost) {
    return { logs: [`⚡ **${attacker.name}** needs ${cls.special.cost} energy for **${cls.special.name}** (has ${attacker.energy}).`], failed: true };
  }
  attacker.energy -= cls.special.cost;
  const logs = [`🌟 **${attacker.name}** unleashes **${cls.special.name}**!`];
  const atk = effectiveAttack(attacker);
  const hit = (raw, opts) => applyDamage(defender, raw, opts);

  switch (attacker.classKey) {
    case 'berserker': { let t = 0; for (let i = 0; i < 3; i++) t += hit(atk * 0.7 - defender.defense * 0.3).damage; addStatus(defender, 'bleed', 3, bleedValue(attacker)); logs.push(`🔥 Three strikes hit for **${t}** and cause **Bleed**!`); break; }
    case 'guardian': { addStatus(attacker, 'shield', 2, 0.5); const h = healRaw(attacker, attacker.maxHp * 0.18); logs.push(`🏰 Fortress shield raised, healed **${h}** HP!`); break; }
    case 'assassin': { const r = hit(atk * 2.0, { ignoreEvasion: true, ignoreBlock: true, ignoreGuardian: true }); logs.push(`🗡️ Guaranteed critical for **${r.damage}** damage!`); break; }
    case 'monk': { const r = hit(atk * 1.2 - defender.defense * 0.4); const c = attacker.statuses.filter(s => ['poison', 'bleed', 'stun', 'attack_down'].includes(s.type)).length; attacker.statuses = attacker.statuses.filter(s => !['poison', 'bleed', 'stun', 'attack_down'].includes(s.type)); const h = healRaw(attacker, attacker.maxHp * 0.15); logs.push(`🧘 Chakra Burst hits for **${r.damage}**, cleanses ${c} debuff(s), heals **${h}** HP!`); break; }
    case 'mage': { const r = hit(atk * 2.5); logs.push(`☄️ Meteor smashes for **${r.damage}** unavoidable damage!`); break; }
    case 'paladin': { const r = hit(atk * 1.6 - defender.defense * 0.3); addStatus(attacker, 'shield', 2, 0.4); logs.push(`✨ Holy Nova smites for **${r.damage}** and shields you!`); break; }
    case 'necromancer': { const r = hit(atk * 1.6 - defender.defense * 0.3, { ignoreEvasion: true }); const h = healRaw(attacker, r.damage * 0.6); addStatus(defender, 'poison', 3, poisonValue(attacker)); logs.push(`💀 Soul Harvest drains **${r.damage}** (healed **${h}**) and **Poisons**!`); break; }
    case 'samurai': { const r = hit(atk * 1.8 - defender.defense * 0.3); addStatus(defender, 'bleed', 3, bleedValue(attacker)); logs.push(`🗡️ Iaido Slash cuts for **${r.damage}** and causes **Bleed**!`); break; }
    case 'druid': { const r = hit(atk * 1.2 - defender.defense * 0.3); addStatus(defender, 'stun', 1); logs.push(`🌿 Nature's Wrath deals **${r.damage}** and **Stuns**!`); break; }
    case 'ninja': { let t = 0; for (let i = 0; i < 2; i++) t += hit(atk * 0.9 - defender.defense * 0.3).damage; if (Math.random() < 0.5) { addStatus(defender, 'stun', 1); logs.push(`⭐ Shuriken Storm hits for **${t}** and **Stuns**!`); } else logs.push(`⭐ Shuriken Storm hits twice for **${t}**!`); break; }
    case 'bard': { addStatus(attacker, 'attack_up', 3, 0.5); const r = hit(atk * 1.0 - defender.defense * 0.3); logs.push(`🎵 Crescendo deals **${r.damage}** and boosts your attack 3 turns!`); break; }
    case 'valkyrie': { const r = hit(atk * 2.0 - defender.defense * 0.3); const h = healRaw(attacker, r.damage * 0.25); logs.push(`🕊️ Valhalla Dive deals **${r.damage}** and heals **${h}** HP!`); break; }
    default: { const r = hit(atk * 1.5 - defender.defense * 0.3); logs.push(`🌟 A powerful blow deals **${r.damage}** damage!`); }
  }
  return { logs };
}

const STATUS_LABEL = { bleed: 'Bleed', poison: 'Poison', stun: 'Stun', attack_down: 'Weaken', attack_up: 'Empower', shield: 'Shield', regen: 'Regen', evasion: 'Evasion' };

/**
 * Executes a data-driven move (from utils/moves.js). Returns { logs, failed }.
 */
function performMove(attacker, defender, move) {
  if (move.kind === 'signature') return performSpecial(attacker, defender);
  if ((move.energyCost || 0) > attacker.energy) {
    return { logs: [`⚡ **${attacker.name}** needs ${move.energyCost} energy for **${move.name}** (has ${attacker.energy}).`], failed: true };
  }
  attacker.energy -= (move.energyCost || 0);
  const logs = [`🌟 **${attacker.name}** uses **${move.name}**!`];
  const atk = effectiveAttack(attacker);
  const hits = move.hits || 1;
  const opts = { ignoreEvasion: !!move.trueHit, ignoreBlock: !!move.trueHit, ignoreGuardian: !!move.trueHit };

  let totalDmg = 0;
  let dodgedAll = true;
  if (move.power && move.power > 0) {
    for (let i = 0; i < hits; i++) {
      if (defender.hp <= 0) break;
      let effDef = defender.defense * 0.5 * (1 - (move.defIgnorePct || 0));
      const crit = move.guaranteedCrit || Math.random() < (0.15 + (attacker.classKey === 'assassin' ? 0.30 : 0));
      const raw = atk * move.power * (crit ? 1.6 : 1) - effDef;
      const res = applyDamage(defender, raw, opts);
      if (res.evaded || res.blocked) { logs.push(...res.notes); continue; }
      dodgedAll = false;
      totalDmg += res.damage;
      if (crit && !move.guaranteedCrit) logs[logs.length ? logs.length - 1 : 0];
    }
    if (totalDmg > 0) logs.push(`💢 Dealt **${totalDmg}** damage${hits > 1 ? ` over ${hits} hits` : ''} to **${defender.name}**.`);
    else if (dodgedAll) logs.push(`…but it was fully avoided!`);
  }

  if (move.lifestealPct && totalDmg > 0) { const h = healRaw(attacker, totalDmg * move.lifestealPct); if (h > 0) logs.push(`🩸 Leeched **${h}** HP.`); }
  if (move.healPct) { const h = healRaw(attacker, attacker.maxHp * move.healPct); if (h > 0) logs.push(`✨ Restored **${h}** HP.`); }
  if (move.cleanse) { const n = attacker.statuses.filter(s => ['poison', 'bleed', 'stun', 'attack_down'].includes(s.type)).length; attacker.statuses = attacker.statuses.filter(s => !['poison', 'bleed', 'stun', 'attack_down'].includes(s.type)); if (n) logs.push(`🧼 Cleansed ${n} debuff(s).`); }

  if (move.status && defender.hp > 0) {
    let val = 0;
    if (move.status.type === 'bleed') val = bleedValue(attacker);
    else if (move.status.type === 'poison') val = poisonValue(attacker);
    else if (move.status.type === 'attack_down') val = move.status.value || 0.25;
    addStatus(defender, move.status.type, move.status.duration, val);
    logs.push(`✨ **${defender.name}** is afflicted with **${STATUS_LABEL[move.status.type] || move.status.type}**!`);
  }
  if (move.selfStatus) {
    addStatus(attacker, move.selfStatus.type, move.selfStatus.duration, move.selfStatus.value || 0);
    logs.push(`🔆 **${attacker.name}** gains **${STATUS_LABEL[move.selfStatus.type] || move.selfStatus.type}**!`);
  }
  return { logs };
}

// ---- Rendering ----
function renderHealthBar(currentHp, maxHp, length = 10) {
  const ratio = Math.max(0, Math.min(1, currentHp / maxHp));
  const filled = Math.round(ratio * length);
  return `\`[${'█'.repeat(filled)}${'░'.repeat(length - filled)}]\` ${Math.max(0, currentHp)}/${maxHp} HP`;
}

function renderEnergyBar(energy, maxEnergy = 100, length = 10) {
  const ratio = Math.max(0, Math.min(1, energy / maxEnergy));
  const filled = Math.round(ratio * length);
  return `\`[${'⚡'.repeat(filled)}${'·'.repeat(length - filled)}]\` ${energy}/${maxEnergy}`;
}

function statusSummary(c) {
  if (!c.statuses.length) return '';
  const icon = { poison: '☠️', bleed: '🩸', stun: '💫', shield: '🛡️', regen: '💚', attack_up: '⬆️', attack_down: '⬇️', evasion: '💨' };
  return c.statuses.map(s => `${icon[s.type] || '•'}${s.duration}`).join(' ');
}

// ---- Progression ----
function applyXpAndLevel(f, xpGain) {
  f.xp = (f.xp || 0) + xpGain;
  let leveled = 0;
  while (f.xp >= f.level * 50) {
    f.xp -= f.level * 50;
    f.level += 1;
    f.statPoints = (f.statPoints || 0) + 2;
    f.maxHp += 10;
    f.attack += 2;
    f.defense += 1;
    leveled++;
  }
  if (leveled) f.hp = f.maxHp;
  return leveled;
}

module.exports = {
  CLASSES, getClass, createCombatant, gainEnergy, addStatus, healRaw, applyDamage,
  tickStatuses, performAttack, performGuard, performSpecial, performMove,
  renderHealthBar, renderEnergyBar, statusSummary, applyXpAndLevel, effectiveAttack
};
