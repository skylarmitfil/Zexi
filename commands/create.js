const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType } = require('discord.js');
const Fighter = require('../models/Fighter');

const DEFAULT_AVATAR = 'https://cdn.discordapp.com/embed/avatars/0.png';

const STYLES = {
  berserker: { name: 'Berserker', hp: 110, attack: 22, defense: 3, desc: 'Heavy physical damage attacker.' },
  guardian: { name: 'Guardian', hp: 140, attack: 12, defense: 12, desc: 'Tanky build built to absorb hits.' },
  assassin: { name: 'Assassin', hp: 85, attack: 26, defense: 2, desc: 'High crit rate glass cannon.' },
  monk: { name: 'Monk', hp: 120, attack: 16, defense: 8, desc: 'Balanced stats with high sustain.' },
  mage: { name: 'Mage', hp: 95, attack: 24, defense: 4, desc: 'Burst caster that ignores defense.' },
  paladin: { name: 'Paladin', hp: 130, attack: 14, defense: 10, desc: 'Holy defender with strong shields.' }
};

module.exports = {
  name: 'create',
  aliases: ['start', 'register'],
  description: 'Select a fighting style to finalize your character creation',
  async execute(message, args) {
    // Check if character already exists
    let fighter = await Fighter.findOne({ userId: message.author.id });
    if (fighter) {
      return message.channel.send(`⚠️ You already have a character! **${fighter.name}** the **${fighter.fightingStyle}**.`);
    }

    // Step 1: Force fighting style selection screen first
    const selectStyleEmbed = new EmbedBuilder()
      .setTitle('⚔️ Character Creation: Step 1')
      .setDescription('You must pick a **Fighting Style** to create your character! Choose an archetype from the menu below to initialize your stats.')
      .addFields(
        { name: '⚔️ Berserker', value: '`HP: 110 | ATK: 22 | DEF: 3`', inline: true },
        { name: '🛡️ Guardian', value: '`HP: 140 | ATK: 12 | DEF: 12`', inline: true },
        { name: '🗡️ Assassin', value: '`HP: 85 | ATK: 26 | DEF: 2`', inline: true },
        { name: '🥋 Monk', value: '`HP: 120 | ATK: 16 | DEF: 8`', inline: true },
        { name: '🔮 Mage', value: '`HP: 95 | ATK: 24 | DEF: 4`', inline: true },
        { name: '✝️ Paladin', value: '`HP: 130 | ATK: 14 | DEF: 10`', inline: true }
      )
      .setColor('#9B59B6');

    const selectMenu = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('select_fighting_style')
        .setPlaceholder('Select a Fighting Style to create character...')
        .addOptions([
          { label: 'Berserker', value: 'berserker', description: STYLES.berserker.desc, emoji: '⚔️' },
          { label: 'Guardian', value: 'guardian', description: STYLES.guardian.desc, emoji: '🛡️' },
          { label: 'Assassin', value: 'assassin', description: STYLES.assassin.desc, emoji: '🗡️' },
          { label: 'Monk', value: 'monk', description: STYLES.monk.desc, emoji: '🥋' },
          { label: 'Mage', value: 'mage', description: STYLES.mage.desc, emoji: '🔮' },
          { label: 'Paladin', value: 'paladin', description: STYLES.paladin.desc, emoji: '✝️' }
        ])
    );

    const menuMsg = await message.channel.send({ embeds: [selectStyleEmbed], components: [selectMenu] });

    const collector = menuMsg.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 60000
    });

    collector.on('collect', async (i) => {
      if (i.user.id !== message.author.id) {
        return i.reply({ content: 'This selection menu is not for you!', ephemeral: true });
      }

      const selected = STYLES[i.values[0]];
      const avatarUrl = message.author.displayAvatarURL({ extension: 'png', size: 256 }) || DEFAULT_AVATAR;

      // Step 2: Create and save character in DB ONLY after style selection
      fighter = await Fighter.create({
        userId: message.author.id,
        name: message.author.username,
        fightingStyle: selected.name,
        hp: selected.hp,
        maxHp: selected.hp,
        attack: selected.attack,
        defense: selected.defense,
        imageUrl: avatarUrl
      });

      const confirmEmbed = new EmbedBuilder()
        .setTitle('🎉 Character Successfully Created!')
        .setThumbnail(avatarUrl)
        .setDescription(`Style chosen: **${fighter.fightingStyle}**!\nYour character **${fighter.name}** has been generated and added to the arena database.`)
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
        menuMsg.edit({ 
          content: '⏱️ Character creation canceled (timed out without picking a fighting style). Run `.create` again when ready!', 
          embeds: [], 
          components: [] 
        }).catch(() => {});
      }
    });
  }
};
