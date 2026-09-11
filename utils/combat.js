/**
 * Executes a Heal Action during combat.
 * @param {Object} attacker - The fighter object performing the heal.
 * @param {Object} defender - The opposing fighter object.
 * @returns {Object} Result containing modified HP values and the action combat message.
 */
function processHealAction(attacker, defender) {
  // Generate a random heal value between 15 and 40 (inclusive)
  const healAmount = Math.floor(Math.random() * (40 - 15 + 1)) + 15;
  const isNecromancer = attacker.fightingStyle.toLowerCase() === 'necromancer';

  let combatLog = '';

  if (isNecromancer) {
    // NECROMANCER: Life Drain (Damages defender + Heals attacker)
    defender.hp = Math.max(0, defender.hp - healAmount);
    
    const initialHp = attacker.hp;
    attacker.hp = Math.min(attacker.maxHp, attacker.hp + healAmount);
    const actualGained = attacker.hp - initialHp;

    combatLog = `💀 **${attacker.name}** cast **Life Drain**! Drained **${healAmount} HP** from **${defender.name}** (gained **+${actualGained} HP**)!`;
  } else {
    // ALL OTHER CLASSES: Self-Heal Only (0 damage to defender)
    const initialHp = attacker.hp;
    attacker.hp = Math.min(attacker.maxHp, attacker.hp + healAmount);
    const actualHealed = attacker.hp - initialHp;

    combatLog = `✨ **${attacker.name}** restored **${actualHealed} HP**! (Opponent HP remained unchanged)`;
  }

  return {
    attackerHp: attacker.hp,
    defenderHp: defender.hp,
    healAmount,
    log: combatLog
  };
}
