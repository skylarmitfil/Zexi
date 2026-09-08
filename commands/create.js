const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType } = require('discord.js');
const Fighter = require('../models/Fighter');

const STYLES = {
  berserker: { name: 'Berserker', hp: 110, attack: 22, defense: 3, img: 'https://i.imgur.com/8Q9Z5b3.png' },
  guardian: { name: 'Guardian', hp: 140, attack: 12, defense: 12, img: 'https://i.imgur.com/8Q9Z5b3.png' },
  assassin: { name: 'Assassin', hp: 90, attack: 25, defense: 2, img: 'https://i.imgur.com/8Q9Z5b3.png' }
};

module.exports = {
  name: 'create',
  aliases: ['start', 'register'],
  description: 'Create your fighter character and choose a fighting style',
  async execute(message, args) {
    let fighter = await Fighter.findOne({ userId: message.author.id });
    if (fighter) {
      return message.channel.send(`⚠️ You already created a character! **${fighter.name}** the **${fighter.fightingStyle}**.`);
    }

    const embed = new EmbedBuilder()
      .setTitle('🛡️ Create Your Fighter')
      .setDescription('Select your fighting style below to initialize your character stats and join the arena.')
      .addFields(
        { name: '⚔️ Berserker', value: 'High Attack, Normal HP, Low Defense\n`HP: 110 | ATK: 22 | DEF: 3`', inline: false },
        { name: '🛡️ Guardian', value: 'High HP, High Defense, Lower Attack\n`HP: 140 | ATK: 12 | DEF: 12`', inline: false },
        { name: '🗡️ Assassin', value: 'Extreme Attack, Low HP, Fragile Defense\n`HP: 90 | ATK: 25 | DEF: 2`', inline: false }
      )
      .setColor('#9B59B6');

    const menu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('select_style')
        .setPlaceholder('Choose a Fighting Style...')
        .addOptions([
          { label: 'Berserker', value: 'berserker', description: 'High ATK focused build' },
          { label: 'Guardian', value: 'guardian', description: 'High HP & DEF defensive build' },
          { label: 'Assassin', value: 'assassin', description: 'Glass cannon high speed build' }
        ])
    );

    const menuMsg = await message.channel.send({ embeds: [embed], components: [menu] });

    const collector = menuMsg.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 60000
    });

    collector.on('collect', async (i) => {
      if (i.user.id !== message.author.id) {
        return i.reply({ content: 'This character creation menu is not for you!', ephemeral: true });
      }

      const selected = STYLES[i.values[0]];

      fighter = await Fighter.create({
        userId: message.author.id,
        name: message.author.username,
        fightingStyle: selected.name,
        hp: selected.hp,
        maxHp: selected.hp,
        attack: selected.attack,
        defense: selected.defense,
        imageUrl: message.author.displayAvatarURL({ extension: 'png' }) || selected.img
      });

      const confirmEmbed = new EmbedBuilder()
        .setTitle('🎉 Character Created!')
        .setThumbnail(fighter.imageUrl)
        .setDescription(`Welcome to the arena, **${fighter.name}**!`)
        .addFields(
          { name: 'Style', value: fighter.fightingStyle, inline: true },
          { name: 'HP', value: `${fighter.hp}`, inline: true },
          { name: 'ATK / DEF', value: `${fighter.attack} / ${fighter.defense}`, inline: true }
        )
        .setColor('#2ECC71');

      return i.update({ embeds: [confirmEmbed], components: [] });
    });

    collector.on('end', (collected, reason) => {
      if (reason === 'time' && collected.size === 0) {
        menuMsg.edit({ content: 'Character creation timed out. Run `.create` again when ready!', components: [] }).catch(() => {});
      }
    });
  }
};
