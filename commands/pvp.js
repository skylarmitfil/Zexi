const { EmbedBuilder } = require('discord.js');
const Fighter = require('../models/Fighter');

// Base reward + scaling based on level difference
const BASE_REWARD = 100;

if (defender.hp <= 0) {
  collector.stop();

  let winnerDoc = await Fighter.findOne({ userId: attacker.id });
  let loserDoc = await Fighter.findOne({ userId: defender.id });

  // Calculate prize: base reward + level multiplier
  const coinsEarned = BASE_REWARD + (loserDoc.level * 15);

  // Update winner stats & economy balance using Mongoose
  winnerDoc.wins += 1;
  winnerDoc.xp += 35;
  winnerDoc.balance += coinsEarned;

  // Handle level-up logic
  let neededXp = winnerDoc.level * 50;
  let leveledUp = false;
  if (winnerDoc.xp >= neededXp) {
    winnerDoc.level += 1;
    winnerDoc.xp -= neededXp;
    leveledUp = true;
  }

  await winnerDoc.save();
  await Fighter.updateOne({ userId: defender.id }, { $inc: { losses: 1 } });

  const victoryEmbed = new EmbedBuilder()
    .setTitle('🏆 Victory!')
    .setColor('#2ECC71')
    .setDescription(
      `**${attacker.name}** defeated **${defender.name}**!\n\n` +
      `💰 **Prize:** +${coinsEarned} coins (Current Balance: ${winnerDoc.balance} coins)\n` +
      `🌟 **XP:** +35 XP` +
      `${leveledUp ? `\n🎉 **LEVEL UP!** Now Level **${winnerDoc.level}**!` : ''}`
    );

  return i.update({ embeds: [victoryEmbed], components: [] });
}
