const { EmbedBuilder } = require('discord.js');
const Fighter = require('../models/Fighter');
const { getClass } = require('../utils/combat');

module.exports = {
  name: 'customize',
  aliases: ['custom', 'profile'],
  description: 'Customize your fighter image and stats',
  async execute(message, args) {
    let fighter = await Fighter.findOne({ userId: message.author.id });
    if (!fighter) {
      fighter = await Fighter.create({ userId: message.author.id, name: message.author.username });
    }

    const sub = args[0]?.toLowerCase();

    if (sub === 'image' || sub === 'avatar') {
      const url = args[1];
      if (!url || !url.startsWith('http')) {
        return message.channel.send('Please provide a valid image URL (e.g., `.customize image https://example.com/avatar.png`)');
      }
      fighter.imageUrl = url;
      await fighter.save();
      return message.channel.send('Successfully updated your fighter avatar!');
    }

    if (sub === 'stat' || sub === 'upgrade') {
      const stat = args[1]?.toLowerCase();
      if (fighter.statPoints <= 0) {
        return message.channel.send('You have no stat points available! Level up in PvP to earn more.');
      }

      if (stat === 'hp') {
        fighter.maxHp += 20;
        fighter.hp += 20;
        fighter.statPoints -= 1;
      } else if (stat === 'attack' || stat === 'atk') {
        fighter.attack += 5;
        fighter.statPoints -= 1;
      } else if (stat === 'defense' || stat === 'def') {
        fighter.defense += 3;
        fighter.statPoints -= 1;
      } else {
        return message.channel.send('Choose a valid stat to upgrade: `hp`, `attack`, or `defense`.');
      }

      await fighter.save();
      return message.channel.send(`Upgraded **${stat.toUpperCase()}**! Points remaining: **${fighter.statPoints}**`);
    }

    const cls = getClass(fighter.fightingStyle);
    const embed = new EmbedBuilder()
      .setTitle(`⚔️ ${fighter.name}'s Fighter Profile`)
      .setThumbnail(fighter.imageUrl)
      .setColor('#5865F2')
      .addFields(
        { name: 'Class', value: `${cls.name}`, inline: true },
        { name: 'Level', value: `${fighter.level} (${fighter.xp}/${fighter.level * 50} XP)`, inline: true },
        { name: 'Stat Points', value: `${fighter.statPoints}`, inline: true },
        { name: 'Stats', value: `❤️ HP: **${fighter.maxHp}**\n⚔️ ATK: **${fighter.attack}**\n🛡️ DEF: **${fighter.defense}**`, inline: false },
        { name: 'Record', value: `🏆 ${fighter.wins}W / ${fighter.losses}L · 🔥 Streak ${fighter.winStreak || 0} (Best ${fighter.bestStreak || 0})`, inline: false },
        { name: '🧬 Passive', value: cls.passive, inline: false },
        { name: `🌟 Special: ${cls.special.name} (${cls.special.cost}⚡)`, value: cls.special.desc, inline: false }
      );

    return message.channel.send({ embeds: [embed] });
  }
};
