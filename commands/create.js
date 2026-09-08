const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType } = require('discord.js');
const Fighter = require('../models/Fighter');

const STYLES = {
  berserker: { 
    name: 'Berserker', 
    hp: 110, 
    attack: 22, 
    defense: 3, 
    desc: 'High raw physical damage with standard durability.' 
  },
  guardian: { 
    name: 'Guardian', 
    hp: 140, 
    attack: 12, 
    defense: 12, 
    desc: 'Tanky build built to withstand heavy hits.' 
  },
  assassin: { 
    name: 'Assassin', 
    hp: 85, 
    attack: 26, 
    defense: 2, 
    desc: 'Extreme glass cannon with high critical power.' 
  },
  monk: { 
    name: 'Monk', 
    hp: 120, 
    attack: 16, 
    defense: 8, 
    desc: 'Balanced offense and defense with high sustainability.' 
  },
  mage: { 
    name: 'Mage', 
    hp: 95, 
    attack: 24, 
    defense: 4, 
    desc: 'High burst magic attacker with squishy defense.' 
  },
  paladin: { 
    name: 'Paladin', 
    hp: 130, 
    attack: 14, 
    defense: 10, 
    desc: 'High health bruiser with solid block capabilities.' 
  }
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
        { name: '⚔️ Berserker', value: '`HP: 110 | ATK: 22 | DEF: 3`\nHeavy physical attacker.', inline: true },
        { name: '🛡️ Guardian', value: '`HP: 140 | ATK: 12 | DEF: 12`\nDefensive wall.', inline: true },
        { name: '🗡️ Assassin', value: '`HP: 85 | ATK: 26 | DEF: 2`\nHigh damage glass cannon.', inline: true },
        { name: '🥋 Monk', value: '`HP: 120 | ATK: 16 | DEF: 8`\nBalanced fighter.', inline: true },
        { name: '🔮 Mage', value: '`HP: 95 | ATK: 24 | DEF: 4`\nBurst damage caster.', inline: true },
        { name: '✝️ Paladin', value: '`HP: 130 | ATK: 14 | DEF: 10`\nSturdy holy warrior.', inline: true }
      )
      .setColor('#9B59B6');

    const menu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('select_style')
        .setPlaceholder('Choose a Fighting Style...')
        .addOptions([
          { label: 'Berserker', value: 'berserker', description: STYLES.berserker.desc, emoji: '⚔️' },
          { label: 'Guardian', value: 'guardian', description: STYLES.guardian.desc, emoji: '🛡️' },
          { label: 'Assassin', value: 'assassin', description: STYLES.assassin.desc, emoji: '🗡️' },
          { label: 'Monk', value: 'monk', description: STYLES.monk.desc, emoji: '🥋' },
          { label: 'Mage', value: 'mage', description: STYLES.mage.desc, emoji: '🔮' },
          { label: 'Paladin', value: 'paladin', description: STYLES.paladin.desc, emoji: '✝️' }
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
        imageUrl: message.author.displayAvatarURL({ extension: 'png' }) || 'https://i.imgur.com/8Q9Z5b3.png'
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
