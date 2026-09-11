/**
 * Calculates a dynamic heal amount (15–40 HP).
 * Standard classes only heal themselves.
 * Necromancer deals drain damage to opponent and heals themselves.
 */
function processHealAction(attacker, defender) {
  // Dynamic heal ranging from 15 to 40
  const healAmount = Math.floor(Math.random() * (40 - 15 + 1)) + 15;
  const isNecromancer = attacker.fightingStyle.toLowerCase() === 'necromancer';

  let combatLog = '';

  if (isNecromancer) {
    // Necromancer: Life Drain deals damage to defender AND heals attacker
    defender.hp = Math.max(0, defender.hp - healAmount);

    const initialHp = attacker.hp;
    attacker.hp = Math.min(attacker.maxHp, attacker.hp + healAmount);
    const actualGained = attacker.hp - initialHp;

    combatLog = `💀 **${attacker.name}** cast **Life Drain**! Drained **${healAmount} HP** from **${defender.name}** and recovered **+${actualGained} HP**!`;
  } else {
    // Standard Classes: Self-heal only (0 damage to defender)
    const initialHp = attacker.hp;
    attacker.hp = Math.min(attacker.maxHp, attacker.hp + healAmount);
    const actualHealed = attacker.hp - initialHp;

    combatLog = `✨ **${attacker.name}** healed for **${actualHealed} HP**!`;
  }

  return {
    attackerHp: attacker.hp,
    defenderHp: defender.hp,
    healAmount,
    log: combatLog
  };
}

/**
 * Calculates attack damage factoring in defense and critical chance.
 */
function processAttackAction(attacker, defender) {
  const isCrit = Math.random() < 0.15; // 15% Crit chance
  const rawDamage = attacker.attack * (isCrit ? 1.5 : 1.0);
  const damageDealt = Math.max(1, Math.round(rawDamage - defender.defense * 0.5));

  defender.hp = Math.max(0, defender.hp - damageDealt);

  const combatLog = isCrit
    ? `💥 **CRITICAL HIT!** **${attacker.name}** dealt **${damageDealt} DMG** to **${defender.name}**!`
    : `⚔️ **${attacker.name}** attacked **${defender.name}** for **${damageDealt} DMG**!`;

  return {
    damageDealt,
    isCrit,
    defenderHp: defender.hp,
    log: combatLog
  };
}

/**
 * Generates a simple text health bar.
 */
function renderHealthBar(currentHp, maxHp, length = 10) {
  const ratio = Math.max(0, Math.min(1, currentHp / maxHp));
  const filled = Math.round(ratio * length);
  const empty = length - filled;
  return `\`[${'█'.repeat(filled)}${'░'.repeat(empty)}]\` ${currentHp}/${maxHp} HP`;
}

module.exports = {
  processHealAction,
  processAttackAction,
  renderHealthBar
};
