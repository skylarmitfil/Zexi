const { EmbedBuilder } = require('discord.js');
const Fighter = require('../models/Fighter');

module.exports = {
  name: 'leaderboard',
  aliases: ['lb', 'top', 'rankings'],
  description: 'View the top fighters ranked by PvP wins.',
  async execute(message, args) {
    const mode = (args[0] || 'wins').toLowerCase();
    const sortField = ['wave', 'waves', 'endless'].includes(mode) ? 'bestWave'
      : mode === 'streak' ? 'bestStreak'
      : (mode === 'gold' || mode === 'balance') ? 'balance'
      : 'wins';

    const fighters = await Fighter.find({}).sort({ [sortField]: -1, wins: -1 }).limit(10);

    if (!fighters.length) {
      return message.channel.send('⚠️ No fighters found yet! Type `,create` to begin.');
    }

    const medals = ['🥇', '🥈', '🥉'];
    const lines = fighters.map((f, idx) => {
      const rank = medals[idx] || `**${idx + 1}.**`;
      const total = (f.wins || 0) + (f.losses || 0);
      const wr = total ? Math.round((f.wins / total) * 100) : 0;
      const stat = sortField === 'bestWave'
        ? `🌊 Best Wave ${f.bestWave || 0} · Lvl ${f.level} · 🏆 ${f.wins}W`
        : `🏆 ${f.wins}W/${f.losses}L (${wr}%) · 🔥 Best Streak ${f.bestStreak || 0} · 💰 ${f.balance}`;
      return `${rank} **${f.name}** (${f.fightingStyle})${sortField === 'bestWave' ? '' : ` — Lvl ${f.level}`}\n    ${stat}`;
    });

    const titleMap = { wins: 'Most Wins', bestStreak: 'Best Win Streaks', balance: 'Richest Fighters', bestWave: 'Endless — Highest Wave' };
    const embed = new EmbedBuilder()
      .setTitle(`🏅 Leaderboard — ${titleMap[sortField] || 'Most Wins'}`)
      .setDescription(lines.join('\n'))
      .setFooter({ text: 'Try: ,leaderboard wins | streak | gold | wave' })
      .setColor('#F1C40F');

    return message.channel.send({ embeds: [embed] });
  }
};
