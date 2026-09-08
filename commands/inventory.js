const { EmbedBuilder } = require('discord.js');
const Inventory = require('../models/Inventory');

module.exports = {
  name: 'inventory',
  aliases: ['inv', 'items'],
  description: 'View your owned equipment and potion count',
  async execute(message) {
    let inventory = await Inventory.findOne({ userId: message.author.id });
    if (!inventory) {
      inventory = await Inventory.create({ userId: message.author.id });
    }

    const embed = new EmbedBuilder()
      .setTitle(`🎒 ${message.author.username}'s Inventory`)
      .setColor('#3498DB')
      .addFields(
        { name: '🧪 Potions', value: `Health Potions: **${inventory.potions}**`, inline: false },
        { name: '⚔️ Equipped Weapon', value: `**${inventory.equippedWeapon}**`, inline: true },
        { name: '🛡️ Equipped Armor', value: `**${inventory.equippedArmor}**`, inline: true }
      );

    return message.channel.send({ embeds: [embed] });
  }
};
