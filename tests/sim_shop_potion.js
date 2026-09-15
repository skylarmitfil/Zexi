// Headless runtime test: load all command modules + simulate shop buy & potion drink logic.
const path = require('path');
const files = ['shop','pvp','story','raid','endless','inventory','moves','moveshop','create'];
let ok = true;
for (const f of files) {
  try { require(path.join('..','commands',f)); console.log('LOADED commands/'+f); }
  catch (e) { ok = false; console.log('FAIL LOAD commands/'+f+': '+e.stack); }
}

const combat = require('../utils/combat');
const { loadPotions, totalPotions, bestPotion } = require('../utils/potions');

// Simulate a fighter doc + inventory doc
const doc = { userId:'u1', name:'Hero', fightingStyle:'berserker', level:5, attack:30, defense:15, maxHp:150, hp:150 };
const inv = { potions:2, greaterPotions:1, superPotions:0 };

const bag = loadPotions(inv);
console.log('total potions =', totalPotions(bag));
const combatant = combat.createCombatant(doc, { potions: totalPotions(bag), potionBag: bag });
combatant.hp = 50;

// Drink best potion
const best = bestPotion(combatant.potionBag);
console.log('best potion =', best && best.name, best && best.heal);
combatant.potionBag[best.field] -= 1; combatant.potions -= 1;
const healed = combat.healRaw(combatant, best.heal);
console.log('healed', healed, 'hp now', combatant.hp, 'potions left', combatant.potions);

// Drain all potions to test null case
let guard = 0;
while (bestPotion(combatant.potionBag) && guard++ < 10) {
  const b = bestPotion(combatant.potionBag);
  combatant.potionBag[b.field] -= 1;
}
console.log('after draining, bestPotion =', bestPotion(combatant.potionBag));

console.log(ok ? 'ALL OK' : 'ERRORS PRESENT');
process.exit(ok ? 0 : 1);
