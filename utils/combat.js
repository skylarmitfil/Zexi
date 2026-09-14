/**
 * Shared turn-based combat engine for PvP duels and Co-Op raids.
 * Handles class passives, energy-fueled specials, and status effects
 * (poison, bleed, stun, shield, regen, attack buffs, evasion).
 */

// ---- Class definitions: passive + ultimate ----
const CLASSES = {
  berserker: {
    name: 'Berserker',
    passive: 'Bloodlust — deals +25% damage while below 40% HP.',
    special: { name: 'Rampage', cost: 100, desc: 'Three furious strikes that make the enemy Bleed.' }
  },
  guardian: {
    name: 'Guardian',
    passive: 'Stonewall — takes 20% less damage from every attack.',
    special: { name: 'Fortress', cost: 80, desc: 'Raise a shield (60% less damage, 2 turns) and restore HP.' }
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
    passive: 'Divine Grace — 20% chance to fully block an attack.',
    special: { name: 'Holy Nova', cost: 90, desc: 'Smite the enemy and gain a protective shield.' }
  },
  necromancer: {
    name: 'Necromancer',
    passive: 'Life Leech — heals for 25% of damage dealt on basic attacks.',
    special: { name: 'Soul Harvest', cost: 95, desc: 'Drain heavy HP and inflict Poison on the enemy.' }
  },
  samurai: {
    name: 'Samurai',
    passive: 'Counter Stance — 30% chance to counter an incoming attack.',
    special: { name: 'Iaido Slash', cost: 90, desc: 'A precise slash dealing bonus damage and inflicting Bleed.' }
  },
  druid: {
    name: 'Druid',
    passive: 'Regrowth — regenerates 6% max HP each turn.',
    special: { name: "Nature's Wrath", cost: 85, desc: 'Entangle (Stun) the enemy and deal nature damage.' }
  },
  ninja: {
    name: 'Ninja',
    passive: 'Evasion — 25% chance to fully dodge an attack.',
    special: { name: 'Shuriken Storm', cost: 80, desc: 'Two rapid strikes that may Stun the enemy.' }
  },
  bard: {
    name: 'Bard',
    passive: 'Inspiring Song — gains +50% energy from every action.',
    special: { name: 'Crescendo', cost: 100, desc: 'Buff your attack for 3 turns and deal sonic damage.' }
  },
  valkyrie: {
    name: 'Valkyrie',
    passive: 'Battle Fervor — +15% damage and heals when landing a critical hit.',
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
    maxHp,
    hp: maxHp,
    attack: doc.attack,
    defense: doc.defense,
    energy: 0,
    maxEnergy: 100,
    statuses: [],
    guarding: false,
    isAlive: true,
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
 * opts: ignoreDefense, ignoreEvasion, ignoreBlock, ignoreGuardian
 */
function applyDamage(defender, rawDamage, opts = {}) {
  const notes = [];
  let dmg = rawDamage;

  // Evasion (Ninja passive + evasion status)
  if (!opts.ignoreEvasion) {
    let evade = defender.classKey === 'ninja' ? 0.25 : 0;
    const ev = defender.statuses.find(s => s.type === 'evasion');
    if (ev) evade += ev.value;
    if (Math.random() < evade) {
      return { damage: 0, evaded: true, notes: [`💨 **${defender.name}** dodged the attack!`] };
    }
  }

  // Paladin block
  if (!opts.ignoreBlock && defender.classKey === 'paladin' && Math.random() < 0.20) {
    return { damage: 0, blocked: true, notes: [`🛡️ **${defender.name}**'s Divine Grace blocked the attack!`] };
  }

  // Guardian passive
  if (!opts.ignoreGuardian && defender.classKey === 'guardian') dmg *= 0.80;
  // Guard stance
  if (defender.guarding) dmg *= 0.5;
  // Shield status
  const shield = defender.statuses.find(s => s.type === 'shield');
  if (shield) dmg *= (1 - shield.value);

  dmg = Math.max(1, Math.round(dmg));
  defender.hp = Math.max(0, defender.hp - dmg);
  if (defender.hp <= 0) defender.isAlive = false;
  return { damage: dmg, notes };
}

/**
 * Ticks start-of-turn effects: class regen, poison/bleed/regen statuses, stun.
 * Also clears the previous guard stance. Returns { logs, stunned }.
 */
function tickStatuses(c) {
  const logs = [];
  let stunned = false;

  c.guarding = false; // guard only lasted through the opponent's turn

  if (c.classKey === 'monk') {
    const h = healRaw(c, c.maxHp * 0.05);
    if (h > 0) logs.push(`🧘 **${c.name}**'s Inner Peace restored ${h} HP.`);
  }
  if (c.classKey === 'druid') {
    const h = healRaw(c, c.maxHp * 0.06);
    if (h > 0) logs.push(`🌿 **${c.name}**'s Regrowth restored ${h} HP.`);
  }

  for (const s of c.statuses) {
    if (s.type === 'poison') {
      c.hp = Math.max(0, c.hp - s.value);
      logs.push(`☠️ **${c.name}** takes ${s.value} poison damage.`);
    } else if (s.type === 'bleed') {
      c.hp = Math.max(0, c.hp - s.value);
      logs.push(`🩸 **${c.name}** bleeds for ${s.value} damage.`);
    } else if (s.type === 'regen') {
      const h = healRaw(c, s.value);
      if (h > 0) logs.push(`💚 **${c.name}** regenerates ${h} HP.`);
    } else if (s.type === 'stun') {
      stunned = true;
    }
    s.duration -= 1;
  }
  c.statuses = c.statuses.filter(s => s.duration > 0);
  if (c.hp <= 0) c.isAlive = false;
  if (stunned) logs.push(`💫 **${c.name}** is stunned and loses their turn!`);
  return { logs, stunned };
}

function effectiveAttack(attacker) {
  let atk = attacker.attack;
  const buff = attacker.statuses.find(s => s.type === 'attack_up');
  if (buff) atk *= (1 + buff.value);
  if (attacker.classKey === 'berserker' && attacker.hp < attacker.maxHp * 0.4) atk *= 1.25;
  if (attacker.classKey === 'valkyrie') atk *= 1.15;
  return atk;
}

// ---- Actions ----
function performAttack(attacker, defender) {
  const logs = [];
  let critChance = 0.15;
  if (attacker.classKey === 'assassin') critChance += 0.30;
  const isCrit = Math.random() < critChance;

  let effDef = defender.defense * 0.5;
  if (attacker.classKey === 'mage') effDef *= 0.5; // ignore 50% defense
  let raw = effectiveAttack(attacker) * (isCrit ? 1.6 : 1.0) - effDef;

  const res = applyDamage(defender, raw);
  gainEnergy(attacker, 25);
  gainEnergy(defender, 15);

  if (res.evaded || res.blocked) {
    logs.push(...res.notes);
    return { logs, damage: 0 };
  }

  logs.push(isCrit
    ? `💥 **CRITICAL!** **${attacker.name}** hit **${defender.name}** for **${res.damage}** damage!`
    : `⚔️ **${attacker.name}** struck **${defender.name}** for **${res.damage}** damage.`);

  if (attacker.classKey === 'necromancer') {
    const h = healRaw(attacker, res.damage * 0.25);
    if (h > 0) logs.push(`🩸 **${attacker.name}** leeched **${h}** HP.`);
  }
  if (attacker.classKey === 'valkyrie' && isCrit) {
    const h = healRaw(attacker, res.damage * 0.3);
    if (h > 0) logs.push(`🕊️ **${attacker.name}** recovered **${h}** HP from the strike.`);
  }

  // Samurai counter
  if (defender.isAlive && defender.classKey === 'samurai' && Math.random() < 0.30) {
    const cRaw = defender.attack * 0.5 - attacker.defense * 0.5;
    const cRes = applyDamage(attacker, cRaw, { ignoreEvasion: true, ignoreBlock: true });
    logs.push(`🗡️ **${defender.name}** countered for **${cRes.damage}** damage!`);
  }

  return { logs, damage: res.damage, isCrit };
}

function performHeal(attacker, defender) {
  const logs = [];
  const amount = Math.floor(Math.random() * 26) + 15; // 15-40
  if (attacker.classKey === 'necromancer' && defender) {
    const res = applyDamage(defender, amount, { ignoreEvasion: true, ignoreBlock: true });
    const h = healRaw(attacker, amount);
    logs.push(`💀 **${attacker.name}** cast **Life Drain**, draining **${res.damage}** HP and recovering **${h}** HP!`);
  } else {
    const h = healRaw(attacker, amount);
    logs.push(`✨ **${attacker.name}** healed for **${h}** HP.`);
  }
  gainEnergy(attacker, 15);
  return { logs };
}

function performGuard(c) {
  c.guarding = true;
  gainEnergy(c, 30);
  return { logs: [`🛡️ **${c.name}** braces defensively (next hit halved).`] };
}

function bleedValue(a) { return Math.max(2, Math.round(a.attack * 0.2)); }
function poisonValue(a) { return Math.max(2, Math.round(a.attack * 0.25)); }

/**
 * Executes the attacker's class ultimate. Returns { logs, failed }.
 */
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
    case 'berserker': {
      let total = 0;
      for (let i = 0; i < 3; i++) total += hit(atk * 0.7 - defender.defense * 0.3).damage;
      addStatus(defender, 'bleed', 3, bleedValue(attacker));
      logs.push(`🔥 Three strikes hit **${defender.name}** for **${total}** total damage and cause **Bleed**!`);
      break;
    }
    case 'guardian': {
      addStatus(attacker, 'shield', 2, 0.6);
      const h = healRaw(attacker, attacker.maxHp * 0.2);
      logs.push(`🏰 **${attacker.name}** raises a fortress shield and heals **${h}** HP!`);
      break;
    }
    case 'assassin': {
      const res = hit(atk * 2.0, { ignoreEvasion: true, ignoreBlock: true, ignoreGuardian: true });
      logs.push(`🗡️ A guaranteed critical pierces **${defender.name}** for **${res.damage}** damage!`);
      break;
    }
    case 'monk': {
      const res = hit(atk * 1.2 - defender.defense * 0.4);
      const cleared = attacker.statuses.filter(s => ['poison', 'bleed', 'stun'].includes(s.type)).length;
      attacker.statuses = attacker.statuses.filter(s => !['poison', 'bleed', 'stun'].includes(s.type));
      const h = healRaw(attacker, attacker.maxHp * 0.15);
      logs.push(`🧘 Chakra Burst hits for **${res.damage}**, cleanses ${cleared} debuff(s) and heals **${h}** HP!`);
      break;
    }
    case 'mage': {
      const res = hit(atk * 2.5, { ignoreDefense: true });
      logs.push(`☄️ Meteor smashes **${defender.name}** for **${res.damage}** unavoidable damage!`);
      break;
    }
    case 'paladin': {
      const res = hit(atk * 1.5 - defender.defense * 0.3);
      addStatus(attacker, 'shield', 2, 0.4);
      logs.push(`✨ Holy Nova smites for **${res.damage}** and shields **${attacker.name}**!`);
      break;
    }
    case 'necromancer': {
      const res = hit(atk * 1.8 - defender.defense * 0.3, { ignoreEvasion: true });
      const h = healRaw(attacker, res.damage);
      addStatus(defender, 'poison', 3, poisonValue(attacker));
      logs.push(`💀 Soul Harvest drains **${res.damage}** HP (healed **${h}**) and **Poisons** the enemy!`);
      break;
    }
    case 'samurai': {
      const res = hit(atk * 1.8 - defender.defense * 0.3);
      addStatus(defender, 'bleed', 3, bleedValue(attacker));
      logs.push(`🗡️ Iaido Slash cuts for **${res.damage}** and causes **Bleed**!`);
      break;
    }
    case 'druid': {
      const res = hit(atk * 1.2 - defender.defense * 0.3);
      addStatus(defender, 'stun', 1);
      logs.push(`🌿 Nature's Wrath deals **${res.damage}** and **Stuns** the enemy!`);
      break;
    }
    case 'ninja': {
      let total = 0;
      for (let i = 0; i < 2; i++) total += hit(atk * 0.9 - defender.defense * 0.3).damage;
      if (Math.random() < 0.5) { addStatus(defender, 'stun', 1); logs.push(`⭐ Shuriken Storm hits for **${total}** and **Stuns** the enemy!`); }
      else logs.push(`⭐ Shuriken Storm hits twice for **${total}** total damage!`);
      break;
    }
    case 'bard': {
      addStatus(attacker, 'attack_up', 3, 0.5);
      const res = hit(atk * 1.0 - defender.defense * 0.3);
      logs.push(`🎵 Crescendo deals **${res.damage}** and boosts **${attacker.name}**'s attack for 3 turns!`);
      break;
    }
    case 'valkyrie': {
      const res = hit(atk * 2.0 - defender.defense * 0.3);
      const h = healRaw(attacker, res.damage * 0.25);
      logs.push(`🕊️ Valhalla Dive deals **${res.damage}** and heals **${h}** HP!`);
      break;
    }
    default: {
      const res = hit(atk * 1.5 - defender.defense * 0.3);
      logs.push(`🌟 A powerful blow deals **${res.damage}** damage!`);
    }
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
  const icon = { poison: '☠️', bleed: '🩸', stun: '💫', shield: '🛡️', regen: '💚', attack_up: '⬆️', evasion: '💨' };
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
  CLASSES,
  getClass,
  createCombatant,
  gainEnergy,
  addStatus,
  healRaw,
  applyDamage,
  tickStatuses,
  performAttack,
  performHeal,
  performGuard,
  performSpecial,
  renderHealthBar,
  renderEnergyBar,
  statusSummary,
  applyXpAndLevel,
  effectiveAttack
};
