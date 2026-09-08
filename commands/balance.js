const { EmbedBuilder } = require('discord.js');
const Fighter = require('../models/Fighter');

module.exports = {
  name: 'balance',
  aliases: ['bal', 'money'],
  description: 'Check your current in-game economy balance',
  async execute(message) {
    let fighter = await Fighter.findOne({ userId: message.author.id });
    if (!fighter) {
      fighter = await Fighter.create({ userId: message.author.id, name: message.author.username });
    }

    const embed = new EmbedBuilder()
      .setTitle(`💰 ${fighter.name}'s Wallet`)
      .setColor('#F1C40F')
      .addFields(
        { name: 'Balance', value: `**${fighter.balance}** coins`, inline: true },
        { name: 'Record', value: `${fighter.wins} W / ${fighter.losses} L`, inline: true }
      );

    return message.channel.send({ embeds: [embed] });
  }
};
