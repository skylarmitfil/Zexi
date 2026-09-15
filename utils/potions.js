// Potion tiers. Ordered largest-heal first so bestPotion() prefers the strongest.
const POTION_TYPES = [
  { field: 'superPotions', name: 'Super Potion', heal: 120 },
  { field: 'greaterPotions', name: 'Greater Potion', heal: 60 },
  { field: 'potions', name: 'Health Potion', heal: 30 }
];

function loadPotions(inv) {
  return {
    potions: inv ? (inv.potions || 0) : 0,
    greaterPotions: inv ? (inv.greaterPotions || 0) : 0,
    superPotions: inv ? (inv.superPotions || 0) : 0
  };
}

function totalPotions(bag) {
  if (!bag) return 0;
  return (bag.potions || 0) + (bag.greaterPotions || 0) + (bag.superPotions || 0);
}

// Returns the strongest available potion type { field, name, heal }, or null.
function bestPotion(bag) {
  for (const t of POTION_TYPES) if ((bag[t.field] || 0) > 0) return t;
  return null;
}

module.exports = { POTION_TYPES, loadPotions, totalPotions, bestPotion };
