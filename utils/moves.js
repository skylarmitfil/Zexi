// Per-class move pools. Each class gets 32 themed template moves + 1 signature = 33.
// Templates are shared for balance; class identity comes from names + passives.
const { BASE_STYLES } = require('./classData');

// 8 flavor "roots" (nouns) per class.
const ROOTS = {
  berserker:  ['Strike', 'Cleave', 'Slam', 'Smash', 'Rend', 'Bash', 'Crush', 'Maul'],
  guardian:   ['Bash', 'Bulwark', 'Slam', 'Guard', 'Wall', 'Ram', 'Barrier', 'Aegis'],
  assassin:   ['Slash', 'Stab', 'Gash', 'Slit', 'Puncture', 'Cut', 'Flurry', 'Execute'],
  monk:       ['Palm', 'Kick', 'Chop', 'Fist', 'Strike', 'Flow', 'Chi', 'Meditation'],
  mage:       ['Bolt', 'Blast', 'Nova', 'Ray', 'Orb', 'Surge', 'Storm', 'Rune'],
  paladin:    ['Smite', 'Judgment', 'Light', 'Rebuke', 'Blessing', 'Hammer', 'Shield', 'Verdict'],
  necromancer:['Drain', 'Curse', 'Hex', 'Grasp', 'Blight', 'Rot', 'Wither', 'Reap'],
  samurai:    ['Slash', 'Cut', 'Draw', 'Kata', 'Riposte', 'Parry', 'Slice', 'Strike'],
  druid:      ['Thorn', 'Root', 'Vine', 'Storm', 'Bloom', 'Maul', 'Growth', 'Wrath'],
  ninja:      ['Shuriken', 'Kunai', 'Strike', 'Dash', 'Smoke', 'Blade', 'Shadow', 'Assault'],
  bard:       ['Note', 'Chord', 'Verse', 'Anthem', 'Ballad', 'Riff', 'Hymn', 'Refrain'],
  valkyrie:   ['Spear', 'Dive', 'Lance', 'Wing', 'Smite', 'Charge', 'Judgment', 'Descent']
};

// 4 escalating tier adjectives per class (tier 0 weak -> tier 3 epic).
const ADJS = {
  berserker:  ['Savage', 'Brutal', 'Feral', 'Cataclysmic'],
  guardian:   ['Sturdy', 'Iron', 'Fortified', 'Unbreakable'],
  assassin:   ['Swift', 'Lethal', 'Silent', 'Phantom'],
  monk:       ['Focused', 'Flowing', 'Ascended', 'Transcendent'],
  mage:       ['Minor', 'Arcane', 'Greater', 'Cataclysmic'],
  paladin:    ['Faithful', 'Holy', 'Radiant', 'Divine'],
  necromancer:['Dark', 'Vile', 'Cursed', 'Abyssal'],
  samurai:    ['Steady', 'Honed', 'Masterful', 'Legendary'],
  druid:      ['Wild', 'Verdant', 'Primal', 'Ancient'],
  ninja:      ['Quick', 'Deadly', 'Hidden', 'Ghost'],
  bard:       ['Soft', 'Rousing', 'Grand', 'Legendary'],
  valkyrie:   ['Winged', 'Soaring', 'Heavenly', 'Valhallan']
};

const LEVEL_TIERS = [2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18, 21, 24, 27, 30, 34];
const SHOP_TIERS = [3, 5, 6, 8, 9, 11, 13, 15, 17, 19, 22, 25, 28, 31, 35];

// Build the stat template for move index i (0..31).
function makeTemplate(i) {
  const power = +(0.85 + i * 0.055).toFixed(2);
  const energyCost = i === 0 ? 0 : Math.min(95, Math.round(8 + i * 2.6));
  const t = { power, hits: 1, energyCost, defIgnorePct: 0 };
  const kind = i % 10;
  if (i === 0) { t.power = 0.85; t.energyCost = 0; return t; }
  switch (kind) {
    case 0: t.lifestealPct = 0.3; break;
    case 2: t.status = { type: 'bleed', duration: 3 }; break;
    case 3: t.defIgnorePct = 0.4; break;
    case 4: t.status = { type: 'poison', duration: 3 }; break;
    case 5: t.hits = 2; t.power = +(t.power * 0.6).toFixed(2); break;
    case 6: t.status = { type: 'attack_down', duration: 2, value: 0.25 }; break;
    case 7: t.power = 0; t.healPct = +(0.15 + (i / 31) * 0.2).toFixed(2); t.energyCost = Math.round(t.energyCost * 0.8); break;
    case 8: t.status = { type: 'stun', duration: 1 }; t.power = +(t.power * 0.8).toFixed(2); t.energyCost += 15; break;
    case 9: t.selfStatus = { type: 'shield', duration: 2, value: 0.4 }; t.power = +(t.power * 0.7).toFixed(2); break;
    default: break;
  }
  return t;
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function buildClassMoves(classKey) {
  const roots = ROOTS[classKey] || ROOTS.berserker;
  const adjs = ADJS[classKey] || ADJS.berserker;
  const moves = [];
  let levelRank = 0, shopRank = 0;

  for (let i = 0; i < 32; i++) {
    const tier = Math.min(3, Math.floor(i / 8));
    const name = `${adjs[tier]} ${roots[i % 8]}`;
    const tpl = makeTemplate(i);
    const move = { id: `${classKey}_${i}`, index: i, classKey, name, ...tpl };

    if (i === 0) {
      move.unlock = { method: 'start', level: 1, cost: 0 };
    } else if (i % 2 === 1) {
      move.unlock = { method: 'level', level: LEVEL_TIERS[levelRank] || 40, cost: 0 };
      levelRank++;
    } else {
      const lvl = SHOP_TIERS[shopRank] || 40;
      move.unlock = { method: 'shop', level: lvl, cost: 150 + shopRank * 130 };
      shopRank++;
    }
    moves.push(move);
  }

  // Signature special as a level-unlock flagship move.
  moves.push({
    id: `${classKey}_sig`, index: 99, classKey, name: `⭐ ${signatureName(classKey)}`,
    kind: 'signature', unlock: { method: 'level', level: 7, cost: 0 }
  });

  return moves;
}

const SIG_NAMES = {
  berserker: 'Rampage', guardian: 'Fortress', assassin: 'Shadow Strike', monk: 'Chakra Burst',
  mage: 'Meteor', paladin: 'Holy Nova', necromancer: 'Soul Harvest', samurai: 'Iaido Slash',
  druid: "Nature's Wrath", ninja: 'Shuriken Storm', bard: 'Crescendo', valkyrie: 'Valhalla Dive'
};
function signatureName(k) { return SIG_NAMES[k] || 'Special'; }

// Precompute all pools.
const POOLS = {};
Object.keys(BASE_STYLES).forEach(k => { POOLS[k] = buildClassMoves(k); });

function classKeyOf(style) { return String(style || 'berserker').toLowerCase(); }
function getClassMoves(style) { return POOLS[classKeyOf(style)] || POOLS.berserker; }
function getMoveById(id) {
  if (!id) return null;
  const key = String(id).split('_')[0];
  return (POOLS[key] || []).find(m => m.id === id) || null;
}

// A move is unlocked if: starter, level-req met, signature (lvl>=req), or purchased (shop).
function isUnlocked(fighter, move) {
  const u = move.unlock;
  if (u.method === 'start') return true;
  if (u.method === 'level') return (fighter.level || 1) >= u.level;
  if (u.method === 'shop') return Array.isArray(fighter.unlockedMoves) && fighter.unlockedMoves.includes(move.id);
  return false;
}

function unlockedMoves(fighter) { return getClassMoves(fighter.fightingStyle).filter(m => isUnlocked(fighter, m)); }
function lockedMoves(fighter) { return getClassMoves(fighter.fightingStyle).filter(m => !isUnlocked(fighter, m)); }
// Shop = shop-method moves not yet purchased.
function purchasableMoves(fighter) {
  return getClassMoves(fighter.fightingStyle).filter(m => m.unlock.method === 'shop' && !(fighter.unlockedMoves || []).includes(m.id));
}

// Human-friendly one-line description of a move's effect.
function describeMove(m) {
  if (m.kind === 'signature') return 'Signature ultimate — powerful class-defining move.';
  const parts = [];
  if (m.power > 0) parts.push(`${m.power.toFixed(2)}x ATK${m.hits > 1 ? ` ×${m.hits}` : ''}`);
  if (m.defIgnorePct) parts.push(`ignores ${Math.round(m.defIgnorePct * 100)}% DEF`);
  if (m.lifestealPct) parts.push(`lifesteal ${Math.round(m.lifestealPct * 100)}%`);
  if (m.healPct) parts.push(`heal ${Math.round(m.healPct * 100)}% HP`);
  if (m.status) parts.push(m.status.type);
  if (m.selfStatus) parts.push(`self ${m.selfStatus.type}`);
  if (m.cleanse) parts.push('cleanse');
  const cost = m.energyCost ? ` · ${m.energyCost}⚡` : ' · free';
  return `${parts.join(', ') || 'utility'}${cost}`;
}

const LOADOUT_SIZE = 5;

module.exports = {
  getClassMoves, getMoveById, isUnlocked, unlockedMoves, lockedMoves,
  purchasableMoves, describeMove, signatureName, LOADOUT_SIZE, POOLS
};
