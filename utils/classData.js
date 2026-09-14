// Central class base stats (rebalanced) — shared by creation, respec, moves and combat.
const BASE_STYLES = {
  berserker:  { name: 'Berserker',   hp: 110, attack: 22, defense: 3,  desc: 'Heavy physical attacker; hits harder while wounded.', page: 1 },
  guardian:   { name: 'Guardian',    hp: 130, attack: 14, defense: 12, desc: 'Tanky bruiser that shrugs off damage.',           page: 1 },
  assassin:   { name: 'Assassin',    hp: 92,  attack: 26, defense: 2,  desc: 'High-crit glass cannon.',                          page: 1 },
  monk:       { name: 'Monk',        hp: 120, attack: 16, defense: 8,  desc: 'Balanced fighter with steady self-healing.',       page: 1 },
  mage:       { name: 'Mage',        hp: 95,  attack: 25, defense: 4,  desc: 'Burst caster that ignores armor.',                 page: 1 },
  paladin:    { name: 'Paladin',     hp: 130, attack: 16, defense: 10, desc: 'Holy defender that blocks blows.',                page: 1 },
  necromancer:{ name: 'Necromancer', hp: 92,  attack: 23, defense: 3,  desc: 'Drains enemy vitality to sustain.',               page: 2 },
  samurai:    { name: 'Samurai',     hp: 105, attack: 23, defense: 5,  desc: 'Master of counter-attacks.',                      page: 2 },
  druid:      { name: 'Druid',       hp: 112, attack: 18, defense: 9,  desc: 'Nature warrior with regeneration.',               page: 2 },
  ninja:      { name: 'Ninja',       hp: 82,  attack: 26, defense: 1,  desc: 'Extreme speed and evasion.',                      page: 2 },
  bard:       { name: 'Bard',        hp: 112, attack: 20, defense: 6,  desc: 'Battle singer who buffs and sustains.',           page: 2 },
  valkyrie:   { name: 'Valkyrie',    hp: 115, attack: 20, defense: 7,  desc: 'Balanced aerial warrior.',                        page: 2 }
};

function baseOf(style) {
  return BASE_STYLES[String(style || '').toLowerCase()] || BASE_STYLES.berserker;
}

module.exports = { BASE_STYLES, baseOf };
