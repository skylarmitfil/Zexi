const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType } = require('discord.js');
const Fighter = require('../models/Fighter');
const Inventory = require('../models/Inventory');

const SHOP_ITEMS = {
  // Potions (heal amount used in battle)
  health_potion: { name: 'Health Potion', cost: 50, type: 'potion', field: 'potions', heal: 30 },
  greater_potion: { name: 'Greater Potion', cost: 110, type: 'potion', field: 'greaterPotions', heal: 60 },
  super_potion: { name: 'Super Potion', cost: 240, type: 'potion', field: 'superPotions', heal: 120 },
  // Weapons (+ATK)
  iron_sword: { name: 'Iron Sword', cost: 200, type: 'weapon', atk: 5 },
  steel_blade: { name: 'Steel Blade', cost: 400, type: 'weapon', atk: 8 },
  flame_blade: { name: 'Flame Blade', cost: 700, type: 'weapon', atk: 12 },
  dragon_fang: { name: 'Dragon Fang', cost: 1100, type: 'weapon', atk: 16 },
  shadow_dagger: { name: 'Shadow Dagger', cost: 1600, type: 'weapon', atk: 20 },
  excalibur: { name: 'Excalibur', cost: 2600, type: 'weapon', atk: 28 },
  // Armor (+DEF)
  leather_armor: { name: 'Leather Armor', cost: 150, type: 'armor', def: 4 },
  steel_armor: { name: 'Steel Armor', cost: 350, type: 'armor', def: 8 },
  knight_plate: { name: 'Knight Plate', cost: 650, type: 'armor', def: 12 },
  dragonscale_mail: { name: 'Dragonscale Mail', cost: 1050, type: 'armor', def: 16 },
  aegis_plate: { name: 'Aegis Plate', cost: 1700, type: 'armor', def: 22 },
  titan_bulwark: { name: 'Titan Bulwark', cost: 2800, type: 'armor', def: 30 }
};

const WEAPON_BY_NAME = Object.fromEntries(Object.values(SHOP_ITEMS).filter(i => i.type === 'weapon').map(i => [i.name, i]));
const ARMOR_BY_NAME = Object.fromEntries(Object.values(SHOP_ITEMS).filter(i => i.type === 'armor').map(i => [i.name, i]));

module.exports = {
  name: 'shop',
  aliases: ['buy', 'store'],
  description: 'Buy potions, weapons and armor using your balance.',
  async execute(message) {
    let fighter = await Fighter.findOne({ userId: message.author.id });
    if (!fighter) return message.channel.send('⚠️ You need a character first! Type `,create`.');

    let inventory = await Inventory.findOne({ userId: message.author.id });
    if (!inventory) inventory = await Inventory.create({ userId: message.author.id });

    const list = (type) => Object.values(SHOP_ITEMS).filter(i => i.type === type)
      .map(i => `**${i.name}** — ${i.cost}g · ${i.type === 'potion' ? `heals ${i.heal} HP` : i.type === 'weapon' ? `+${i.atk} ATK` : `+${i.def} DEF`}`)
      .join('\n');

    function buildEmbed() {
      return new EmbedBuilder()
        .setTitle('🛒 Items & Equipment Shop')
        .setColor('#F1C40F')
        .setDescription(`Your Balance: **${fighter.balance}** coins\nEquipping a new weapon/armor replaces the old one (stats swap, no stacking).`)
        .addFields(
          { name: '🧪 Potions', value: list('potion'), inline: false },
          { name: '⚔️ Weapons', value: list('weapon'), inline: false },
          { name: '🛡️ Armor', value: list('armor'), inline: false }
        );
    }

    const menu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('shop_buy')
        .setPlaceholder('Choose an item to buy...')
        .addOptions(Object.entries(SHOP_ITEMS).map(([key, i]) => ({
          label: `${i.name} (${i.cost}g)`.slice(0, 100),
          value: key,
          description: (i.type === 'potion' ? `Heals ${i.heal} HP` : i.type === 'weapon' ? `+${i.atk} ATK weapon` : `+${i.def} DEF armor`).slice(0, 100)
        })))
    );

    const shopMessage = await message.channel.send({ embeds: [buildEmbed()], components: [menu] });
    const collector = shopMessage.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 90000 });

    collector.on('collect', async (interaction) => {
      if (interaction.user.id !== message.author.id) {
        return interaction.reply({ content: 'Use the shop command yourself to buy items.', ephemeral: true });
      }

      const item = SHOP_ITEMS[interaction.values[0]];
      if (!item) return interaction.reply({ content: 'Item not found.', ephemeral: true });
      if (fighter.balance < item.cost) {
        return interaction.reply({ content: `You need **${item.cost}** coins to buy ${item.name}! You only have **${fighter.balance}**.`, ephemeral: true });
      }
      if (item.type === 'weapon' && inventory.weaponsOwned.includes(item.name) && inventory.equippedWeapon === item.name) {
        return interaction.reply({ content: `You already own and have **${item.name}** equipped!`, ephemeral: true });
      }
      if (item.type === 'armor' && inventory.armorOwned.includes(item.name) && inventory.equippedArmor === item.name) {
        return interaction.reply({ content: `You already own and have **${item.name}** equipped!`, ephemeral: true });
      }

      fighter.balance -= item.cost;

      if (item.type === 'potion') {
        inventory[item.field] = (inventory[item.field] || 0) + 1;
      } else if (item.type === 'weapon') {
        const prev = WEAPON_BY_NAME[inventory.equippedWeapon];
        if (prev) fighter.attack -= prev.atk;      // remove old weapon bonus (swap, no stacking)
        fighter.attack += item.atk;
        inventory.equippedWeapon = item.name;
        if (!inventory.weaponsOwned.includes(item.name)) inventory.weaponsOwned.push(item.name);
      } else if (item.type === 'armor') {
        const prev = ARMOR_BY_NAME[inventory.equippedArmor];
        if (prev) fighter.defense -= prev.def;
        fighter.defense += item.def;
        inventory.equippedArmor = item.name;
        if (!inventory.armorOwned.includes(item.name)) inventory.armorOwned.push(item.name);
      }

      await fighter.save();
      await inventory.save();

      return interaction.update({
        content: `✅ Purchased **${item.name}** for **${item.cost}** coins!` + (item.type !== 'potion' ? ' Equipped!' : ''),
        embeds: [buildEmbed()],
        components: [menu]
      });
    });

    collector.on('end', () => { shopMessage.edit({ components: [] }).catch(() => {}); });
  }
};
