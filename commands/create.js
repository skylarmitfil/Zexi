const { 
  EmbedBuilder, 
  ActionRowBuilder, 
  StringSelectMenuBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ComponentType 
} = require('discord.js');
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
  description: 'Pick a fighting style and distribute initial stat points to build your character',
  async execute(message, args) {
    let fighter = await Fighter.findOne({ userId: message.author.id });
    if (fighter) {
      return message.channel.send(`⚠️ You already have a character! **${fighter.name}** the **${fighter.fightingStyle}**.`);
    }

    // STEP 1: Select Fighting Style
    const selectStyleEmbed = new EmbedBuilder()
      .setTitle('⚔️ Character Creation: Step 1 (Fighting Style)')
      .setDescription('Select a **Fighting Style** to establish your base archetype stats.')
      .addFields(
        { name: '⚔️ Berserker', value: '`HP: 110 | ATK: 22 | DEF: 3`', inline: true },
        { name: '🛡️ Guardian', value: '`HP: 140 | ATK: 12 | DEF: 12`', inline: true },
        { name: '🗡️ Assassin', value: '`HP: 85 | ATK: 26 | DEF: 2`', inline: true },
        { name: '🥋 Monk', value: '`HP: 120 | ATK: 16 | DEF: 8`', inline: true },
        { name: '🔮 Mage', value: '`HP: 95 | ATK: 24 | DEF: 4`', inline: true },
        { name: '✝️ Paladin', value: '`HP: 130 | ATK: 14 | DEF: 10`', inline: true }
      )
      .setColor('#9B59B6');

    const selectMenuRow = new ActionRowBuilder().addComponents(
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

    const mainMsg = await message.channel.send({ embeds: [selectStyleEmbed], components: [selectMenuRow] });

    const styleCollector = mainMsg.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 60000
    });

    styleCollector.on('collect', async (i) => {
      if (i.user.id !== message.author.id) {
        return i.reply({ content: 'This menu is not for you!', ephemeral: true });
      }

      styleCollector.stop('selected');
      const baseStyle = STYLES[i.values[0]];

      // STEP 2: Stat Allocation State
      let unspentPoints = 5;
      let addedHp = 0;
      let addedAtk = 0;
      let addedDef = 0;

      function renderAllocationEmbed() {
        return new EmbedBuilder()
          .setTitle(`📊 Character Creation: Step 2 (Stat Points)`)
          .setDescription(`Selected Style: **${baseStyle.name}**\nYou have **${unspentPoints}** point(s) remaining to distribute.`)
          .addFields(
            { name: '❤️ Health (HP)', value: `**${baseStyle.hp + addedHp}** (+${addedHp})`, inline: true },
            { name: '⚔️ Attack (ATK)', value: `**${baseStyle.attack + addedAtk}** (+${addedAtk})`, inline: true },
            { name: '🛡️ Defense (DEF)', value: `**${baseStyle.defense + addedDef}** (+${addedDef})`, inline: true }
          )
          .setColor('#3498DB');
      }

      function renderButtons() {
        return new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('add_hp').setLabel('+10 HP').setStyle(ButtonStyle.Primary).setDisabled(unspentPoints <= 0),
          new ButtonBuilder().setCustomId('add_atk').setLabel('+2 ATK').setStyle(ButtonStyle.Danger).setDisabled(unspentPoints <= 0),
          new ButtonBuilder().setCustomId('add_def').setLabel('+1 DEF').setStyle(ButtonStyle.Secondary).setDisabled(unspentPoints <= 0),
          new ButtonBuilder().setCustomId('finish').setLabel('Confirm Character').setStyle(ButtonStyle.Success)
        );
      }

      await i.update({ embeds: [renderAllocationEmbed()], components: [renderButtons()] });

      const buttonCollector = mainMsg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 90000
      });

      buttonCollector.on('collect', async (btnInteraction) => {
        if (btnInteraction.user.id !== message.author.id) {
          return btnInteraction.reply({ content: 'This allocation panel is not for you!', ephemeral: true });
        }

        if (btnInteraction.customId === 'add_hp' && unspentPoints > 0) {
          addedHp += 10;
          unspentPoints--;
        } else if (btnInteraction.customId === 'add_atk' && unspentPoints > 0) {
          addedAtk += 2;
          unspentPoints--;
        } else if (btnInteraction.customId === 'add_def' && unspentPoints > 0) {
          addedDef += 1;
          unspentPoints--;
        } else if (btnInteraction.customId === 'finish') {
          buttonCollector.stop('completed');

          const finalHp = baseStyle.hp + addedHp;
          const finalAtk = baseStyle.attack + addedAtk;
          const finalDef = baseStyle.defense + addedDef;
          const avatarUrl = message.author.displayAvatarURL({ extension: 'png', size: 256 }) || DEFAULT_AVATAR;

          fighter = await Fighter.create({
            userId: message.author.id,
            name: message.author.username,
            fightingStyle: baseStyle.name,
            hp: finalHp,
            maxHp: finalHp,
            attack: finalAtk,
            defense: finalDef,
            statPoints: unspentPoints, // Saves remaining unallocated points if confirmed early
            imageUrl: avatarUrl
          });

          const finalEmbed = new EmbedBuilder()
            .setTitle('🎉 Character Fully Initialized!')
            .setThumbnail(avatarUrl)
            .setDescription(`**${fighter.name}** the **${fighter.fightingStyle}** has joined the arena!`)
            .addFields(
              { name: 'Style', value: fighter.fightingStyle, inline: true },
              { name: 'HP', value: `${fighter.hp}`, inline: true },
              { name: 'ATK / DEF', value: `${fighter.attack} / ${fighter.defense}`, inline: true },
              { name: 'Unspent Points', value: `${fighter.statPoints}`, inline: true }
            )
            .setColor('#2ECC71');

          return btnInteraction.update({ embeds: [finalEmbed], components: [] });
        }

        await btnInteraction.update({ embeds: [renderAllocationEmbed()], components: [renderButtons()] });
      });

      buttonCollector.on('end', (collected, reason) => {
        if (reason === 'time') {
          mainMsg.edit({ content: '⏱️ Stat distribution timed out. Run `.create` again!', embeds: [], components: [] }).catch(() => {});
        }
      });
    });

    styleCollector.on('end', (collected, reason) => {
      if (reason === 'time') {
        mainMsg.edit({ content: '⏱️ Character creation timed out without choosing a style.', embeds: [], components: [] }).catch(() => {});
      }
    });
  }
};
