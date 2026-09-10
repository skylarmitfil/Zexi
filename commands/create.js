const { 
  EmbedBuilder, 
  ActionRowBuilder, 
  StringSelectMenuBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ComponentType 
} = require('discord.js');
const Fighter = require('../models/Fighter');

const STYLES = {
  berserker: { name: 'Berserker', hp: 110, attack: 22, defense: 3, desc: 'Heavy physical damage attacker.' },
  guardian: { name: 'Guardian', hp: 140, attack: 12, defense: 12, desc: 'Tanky build built to absorb hits.' },
  assassin: { name: 'Assassin', hp: 85, attack: 26, defense: 2, desc: 'High crit rate glass cannon.' },
  monk: { name: 'Monk', hp: 120, attack: 16, defense: 8, desc: 'Balanced stats with high sustain.' },
  mage: { name: 'Mage', hp: 95, attack: 24, defense: 4, desc: 'Burst caster that ignores defense.' },
  paladin: { name: 'Paladin', hp: 130, attack: 14, defense: 10, desc: 'Holy defender with strong shields.' },
  necromancer: { name: 'Necromancer', hp: 90, attack: 25, defense: 3, desc: 'Drains enemy vitality to heal.' },
  samurai: { name: 'Samurai', hp: 105, attack: 23, defense: 5, desc: 'Master of counter-attacks.' },
  druid: { name: 'Druid', hp: 125, attack: 15, defense: 9, desc: 'Nature warrior with regeneration.' },
  ninja: { name: 'Ninja', hp: 80, attack: 27, defense: 1, desc: 'Extreme speed and evasion.' },
  bard: { name: 'Bard', hp: 100, attack: 18, defense: 6, desc: 'Buffs stats and manipulates turns.' },
  valkyrie: { name: 'Valkyrie', hp: 115, attack: 20, defense: 7, desc: 'Balanced aerial warrior.' }
};

module.exports = {
  name: 'create',
  description: 'Select a slot and pick from 12 fighting styles to build a character',
  async execute(message, args) {
    const existingFighters = await Fighter.find({ userId: message.author.id });

    // STEP 1: Select Character Slot (Slot 1 or Slot 2)
    const slotEmbed = new EmbedBuilder()
      .setTitle('📁 Character Creation: Select Slot')
      .setDescription('Choose an available slot for your new character:')
      .addFields(
        { 
          name: 'Slot 1', 
          value: existingFighters.some(f => f.slot === 1) 
            ? `Occupied: **${existingFighters.find(f => f.slot === 1).name}**` 
            : '🟢 Empty Slot', 
          inline: true 
        },
        { 
          name: 'Slot 2', 
          value: existingFighters.some(f => f.slot === 2) 
            ? `Occupied: **${existingFighters.find(f => f.slot === 2).name}**` 
            : '🟢 Empty Slot', 
          inline: true 
        }
      )
      .setColor('#3498DB');

    const slotRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('slot_1').setLabel('Slot 1').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('slot_2').setLabel('Slot 2').setStyle(ButtonStyle.Primary)
    );

    const mainMsg = await message.channel.send({ embeds: [slotEmbed], components: [slotRow] });
    const slotCollector = mainMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

    slotCollector.on('collect', async (slotInteraction) => {
      if (slotInteraction.user.id !== message.author.id) {
        return slotInteraction.reply({ content: 'This menu is not for you!', ephemeral: true });
      }

      const chosenSlot = slotInteraction.customId === 'slot_1' ? 1 : 2;
      const existingInSlot = existingFighters.find(f => f.slot === chosenSlot);

      if (existingInSlot) {
        return slotInteraction.reply({ content: `⚠️ You already have a character in **Slot ${chosenSlot}** (${existingInSlot.name})! Use a different slot or delete it.`, ephemeral: true });
      }

      slotCollector.stop('slot_chosen');

      // STEP 2: Pick Fighting Style (12 Classes)
      const styleEmbed = new EmbedBuilder()
        .setTitle(`⚔️ Creating Character in Slot ${chosenSlot}`)
        .setDescription('Select a **Fighting Style** from the menu below:')
        .setColor('#9B59B6');

      const options = Object.keys(STYLES).map(key => ({
        label: STYLES[key].name,
        value: key,
        description: STYLES[key].desc
      }));

      const selectRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('select_style')
          .setPlaceholder('Choose a Fighting Style...')
          .addOptions(options)
      );

      await slotInteraction.update({ embeds: [styleEmbed], components: [selectRow] });

      const styleCollector = mainMsg.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 60000 });

      styleCollector.on('collect', async (i) => {
        if (i.user.id !== message.author.id) return;

        styleCollector.stop('selected');
        const baseStyle = STYLES[i.values[0]];

        // STEP 3: Stat Point Allocation
        let unspentPoints = 5;
        let addedHp = 0;
        let addedAtk = 0;
        let addedDef = 0;

        function renderAllocationEmbed() {
          return new EmbedBuilder()
            .setTitle(`📊 Character Creation: Slot ${chosenSlot} Stats`)
            .setDescription(`Selected Style: **${baseStyle.name}**\nYou have **${unspentPoints}** point(s) remaining.`)
            .addFields(
              { name: '❤️ HP', value: `**${baseStyle.hp + addedHp}** (+${addedHp})`, inline: true },
              { name: '⚔️ ATK', value: `**${baseStyle.attack + addedAtk}** (+${addedAtk})`, inline: true },
              { name: '🛡️ DEF', value: `**${baseStyle.defense + addedDef}** (+${addedDef})`, inline: true }
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

        const btnCollector = mainMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 90000 });

        btnCollector.on('collect', async (btn) => {
          if (btn.user.id !== message.author.id) return;

          if (btn.customId === 'add_hp' && unspentPoints > 0) { addedHp += 10; unspentPoints--; }
          else if (btn.customId === 'add_atk' && unspentPoints > 0) { addedAtk += 2; unspentPoints--; }
          else if (btn.customId === 'add_def' && unspentPoints > 0) { addedDef += 1; unspentPoints--; }
          else if (btn.customId === 'finish') {
            btnCollector.stop('completed');

            const avatarUrl = message.author.displayAvatarURL({ extension: 'png', size: 256 });
            const created = await Fighter.create({
              userId: message.author.id,
              slot: chosenSlot,
              name: message.author.username,
              fightingStyle: baseStyle.name,
              level: 1,
              xp: 0,
              statPoints: unspentPoints,
              hp: baseStyle.hp + addedHp,
              maxHp: baseStyle.hp + addedHp,
              attack: baseStyle.attack + addedAtk,
              defense: baseStyle.defense + addedDef,
              balance: 100,
              imageUrl: avatarUrl,
              wins: 0,
              losses: 0
            });

            const finalEmbed = new EmbedBuilder()
              .setTitle(`🎉 Slot ${chosenSlot} Character Created!`)
              .setThumbnail(avatarUrl)
              .setDescription(`**${created.name}** the **${created.fightingStyle}** is ready for battle!`)
              .addFields(
                { name: 'HP', value: `${created.hp}`, inline: true },
                { name: 'ATK / DEF', value: `${created.attack} / ${created.defense}`, inline: true }
              )
              .setColor('#2ECC71');

            return btn.update({ embeds: [finalEmbed], components: [] });
          }

          await btn.update({ embeds: [renderAllocationEmbed()], components: [renderButtons()] });
        });
      });
    });
  }
};