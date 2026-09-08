const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType } = require('discord.js');
const Fighter = require('../models/Fighter');
const Inventory = require('../models/Inventory');

const SHOP_ITEMS = {
  health_potion: { name: 'Health Potion', cost: 50, type: 'potion' },
  iron_sword: { name: 'Iron Sword', cost: 200, type: 'weapon', stat: '+5 ATK' },
  steel_armor: { name: 'Steel Armor', cost: 350, type: 'armor', stat: '+8 DEF' }
};

module.exports = {
  name: 'shop',
  aliases: ['buy', 'store'],
  description: 'Buy equipment and potions using your balance',
  async execute(message) {
    let fighter = await Fighter.findOne({ userId: message.author.id });
    if (!fighter) {
      fighter = await Fighter.create({ userId: message.author.id, name: message.author.username });
    }

    let inventory = await Inventory.findOne({ userId: message.author.id });
    if (!inventory) {
      inventory = await Inventory.create({ userId: message.author.id });
    }

    const shopEmbed = new EmbedBuilder()
      .setTitle('🛒 Items & Equipment Shop')
      .setColor('#F1C40F')
      .setDescription(`Your Balance: **${fighter.balance}** coins\nSelect an item from the menu below to purchase.`)
      .addFields(
        { name: '🧪 Health Potion — 50 coins', value: 'Restores 30 HP in battle', inline: false },
        { name: '⚔️ Iron Sword — 200 coins', value: 'Gives +5 ATK', inline: false },
        { name: '🛡️ Steel Armor — 350 coins', value: 'Gives +8 DEF', inline: false }
      );

    const selectMenu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('shop_buy')
        .setPlaceholder('Choose an item to buy...')
        .addOptions([
          { label: 'Health Potion (50 coins)', value: 'health_potion', description: 'Restores 30 HP' },
          { label: 'Iron Sword (200 coins)', value: 'iron_sword', description: '+5 ATK Weapon' },
          { label: 'Steel Armor (350 coins)', value: 'steel_armor', description: '+8 DEF Armor' }
        ])
    );

    const shopMessage = await message.channel.send({
      embeds: [shopEmbed],
      components: [selectMenu]
    });

    const collector = shopMessage.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 60000
    });

    collector.on('collect', async (interaction) => {
      if (interaction.user.id !== message.author.id) {
        return interaction.reply({ content: 'Use the shop command yourself to buy items.', ephemeral: true });
      }

      const selectedKey = interaction.values[0];
      const item = SHOP_ITEMS[selectedKey];

      if (fighter.balance < item.cost) {
        return interaction.reply({ content: `You need **${item.cost}** coins to buy ${item.name}! You only have **${fighter.balance}** coins.`, ephemeral: true });
      }

      if (item.type === 'weapon' && inventory.weaponsOwned.includes(item.name)) {
        return interaction.reply({ content: `You already own **${item.name}**!`, ephemeral: true });
      }

      if (item.type === 'armor' && inventory.armorOwned.includes(item.name)) {
        return interaction.reply({ content: `You already own **${item.name}**!`, ephemeral: true });
      }

      fighter.balance -= item.cost;
      await fighter.save();

      if (item.type === 'potion') {
        inventory.potions += 1;
      } else if (item.type === 'weapon') {
        inventory.weaponsOwned.push(item.name);
        inventory.equippedWeapon = item.name;
        fighter.attack += 5;
        await fighter.save();
      } else if (item.type === 'armor') {
        inventory.armorOwned.push(item.name);
        inventory.equippedArmor = item.name;
        fighter.defense += 8;
        await fighter.save();
      }

      await inventory.save();

      const updatedEmbed = EmbedBuilder.from(shopEmbed)
        .setDescription(`Your Balance: **${fighter.balance}** coins\nSelect an item from the menu below to purchase.`);

      return interaction.update({
        content: `✅ Successfully purchased **${item.name}** for **${item.cost}** coins!`,
        embeds: [updatedEmbed],
        components: [selectMenu]
      });
    });

    collector.on('end', () => {
      shopMessage.edit({ components: [] }).catch(() => {});
    });
  }
};
