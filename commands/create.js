const { 
  EmbedBuilder, 
  ActionRowBuilder, 
  StringSelectMenuBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ComponentType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const Fighter = require('../models/Fighter');

const STYLES = {
  // Page 1 Styles
  berserker: { name: 'Berserker', hp: 110, attack: 22, defense: 3, desc: 'Heavy physical damage attacker.', page: 1 },
  guardian: { name: 'Guardian', hp: 140, attack: 12, defense: 12, desc: 'Tanky build built to absorb hits.', page: 1 },
  assassin: { name: 'Assassin', hp: 85, attack: 26, defense: 2, desc: 'High crit rate glass cannon.', page: 1 },
  monk: { name: 'Monk', hp: 120, attack: 16, defense: 8, desc: 'Balanced stats with high sustain.', page: 1 },
  mage: { name: 'Mage', hp: 95, attack: 24, defense: 4, desc: 'Burst caster that ignores defense.', page: 1 },
  paladin: { name: 'Paladin', hp: 130, attack: 14, defense: 10, desc: 'Holy defender with strong shields.', page: 1 },
  
  // Page 2 Styles
  necromancer: { name: 'Necromancer', hp: 90, attack: 25, defense: 3, desc: 'Drains enemy vitality to heal.', page: 2 },
  samurai: { name: 'Samurai', hp: 105, attack: 23, defense: 5, desc: 'Master of counter-attacks.', page: 2 },
  druid: { name: 'Druid', hp: 125, attack: 15, defense: 9, desc: 'Nature warrior with regeneration.', page: 2 },
  ninja: { name: 'Ninja', hp: 80, attack: 27, defense: 1, desc: 'Extreme speed and evasion.', page: 2 },
  bard: { name: 'Bard', hp: 100, attack: 18, defense: 6, desc: 'Buffs stats and manipulates turns.', page: 2 },
  valkyrie: { name: 'Valkyrie', hp: 115, attack: 20, defense: 7, desc: 'Balanced aerial warrior.', page: 2 }
};

module.exports = {
  name: 'create',
  aliases: ['start', 'register'],
  description: 'Select a slot, choose class across pages, enter custom name, and build stats.',
  async execute(message, args) {
    // Fetch existing fighters safely using lean()
    const existingFighters = await Fighter.find({ userId: message.author.id }).lean();

    // STEP 1: Select Character Slot
    const slot1Char = existingFighters.find(f => f.slot === 1);
    const slot2Char = existingFighters.find(f => f.slot === 2);

    const slotEmbed = new EmbedBuilder()
      .setTitle('📁 Character Creation: Select Slot')
      .setDescription('Choose an available slot for your new character (You have 2 minutes):')
      .addFields(
        { 
          name: 'Slot 1', 
          value: slot1Char ? `Occupied: **${slot1Char.name || 'Fighter'}**` : '🟢 Empty Slot', 
          inline: true 
        },
        { 
          name: 'Slot 2', 
          value: slot2Char ? `Occupied: **${slot2Char.name || 'Fighter'}**` : '🟢 Empty Slot', 
          inline: true 
        }
      )
      .setColor('#3498DB');

    const slotRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('slot_1').setLabel('Slot 1').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('slot_2').setLabel('Slot 2').setStyle(ButtonStyle.Primary)
    );

    const mainMsg = await message.channel.send({ embeds: [slotEmbed], components: [slotRow] });
    const slotCollector = mainMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120000 });

    slotCollector.on('collect', async (slotInteraction) => {
      if (slotInteraction.user.id !== message.author.id) {
        return slotInteraction.reply({ content: 'This character creation menu is not for you!', ephemeral: true });
      }

      const chosenSlot = slotInteraction.customId === 'slot_1' ? 1 : 2;
      const existingInSlot = existingFighters.find(f => f.slot === chosenSlot);

      if (existingInSlot) {
        return slotInteraction.reply({ content: `⚠️ You already have a character in **Slot ${chosenSlot}** (${existingInSlot.name})!`, ephemeral: true });
      }

      slotCollector.stop('slot_chosen');

      // STEP 2: Paginated Class Selection
      let currentPage = 1;

      function buildStyleComponents(page) {
        const pageKeys = Object.keys(STYLES).filter(k => STYLES[k].page === page);

        const embed = new EmbedBuilder()
          .setTitle(`⚔️ Choose Fighting Style (Page ${page}/2)`)
          .setDescription(`Select a class from Page ${page} using the dropdown menu below, or click arrows to flip pages.`)
          .setColor('#9B59B6');

        pageKeys.forEach(k => {
          embed.addFields({ 
            name: STYLES[k].name, 
            value: `HP: ${STYLES[k].hp} | ATK: ${STYLES[k].attack} | DEF: ${STYLES[k].defense}\n_${STYLES[k].desc}_`, 
            inline: true 
          });
        });

        const selectOptions = pageKeys.map(k => ({
          label: STYLES[k].name,
          value: k,
          description: STYLES[k].desc
        }));

        const selectRow = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('select_style')
            .setPlaceholder(`Select a Fighting Style (Page ${page})...`)
            .addOptions(selectOptions)
        );

        const navRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('page_prev').setLabel('⬅️ Page 1').setStyle(ButtonStyle.Secondary).setDisabled(page === 1),
          new ButtonBuilder().setCustomId('page_next').setLabel('Page 2 ➡️').setStyle(ButtonStyle.Secondary).setDisabled(page === 2)
        );

        return { embeds: [embed], components: [selectRow, navRow] };
      }

      await slotInteraction.update(buildStyleComponents(currentPage));

      const styleCollector = mainMsg.createMessageComponentCollector({ time: 120000 });

      styleCollector.on('collect', async (i) => {
        if (i.user.id !== message.author.id) return;

        // Handle Page Switching Buttons
        if (i.isButton()) {
          if (i.customId === 'page_prev') currentPage = 1;
          if (i.customId === 'page_next') currentPage = 2;
          return await i.update(buildStyleComponents(currentPage));
        }

        // Handle Style Selected via Dropdown
        if (i.isStringSelect() && i.customId === 'select_style') {
          styleCollector.stop('selected');
          const selectedKey = i.values[0];
          const baseStyle = STYLES[selectedKey];

          // STEP 3: Prompt for Custom Character Name via Modal
          const modal = new ModalBuilder()
            .setCustomId('character_name_modal')
            .setTitle('Name Your Character');

          const nameInput = new TextInputBuilder()
            .setCustomId('char_name')
            .setLabel('Enter character name:')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder(message.author.username)
            .setMaxLength(25)
            .setRequired(true);

          modal.addComponents(new ActionRowBuilder().addComponents(nameInput));

          await i.showModal(modal);

          // Await Modal Submission
          const modalSubmit = await i.awaitModalSubmit({
            filter: (m) => m.customId === 'character_name_modal' && m.user.id === message.author.id,
            time: 60000
          }).catch(() => null);

          if (!modalSubmit) {
            return mainMsg.edit({
              embeds: [new EmbedBuilder().setTitle('⏱️ Creation Timed Out').setDescription('Name entry timed out. Type `.create` to try again.').setColor('#95A5A6')],
              components: []
            }).catch(() => {});
          }

          const customName = modalSubmit.fields.getTextInputValue('char_name').trim() || message.author.username;

          // STEP 4: Stat Point Allocation
          let unspentPoints = 5;
          let addedHp = 0;
          let addedAtk = 0;
          let addedDef = 0;

          function renderAllocationEmbed() {
            return new EmbedBuilder()
              .setTitle(`📊 Stat Allocation: ${customName}`)
              .setDescription(`Style: **${baseStyle.name}** | Slot: **${chosenSlot}**\nYou have **${unspentPoints}** point(s) remaining to distribute.`)
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

          await modalSubmit.update({ embeds: [renderAllocationEmbed()], components: [renderButtons()] });

          const btnCollector = mainMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120000 });

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
                name: customName,
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
                  { name: '❤️ HP', value: `${created.hp}`, inline: true },
                  { name: '⚔️ ATK / 🛡️ DEF', value: `${created.attack} / ${created.defense}`, inline: true }
                )
                .setColor('#2ECC71');

              return btn.update({ embeds: [finalEmbed], components: [] });
            }

            await btn.update({ embeds: [renderAllocationEmbed()], components: [renderButtons()] });
          });

          btnCollector.on('end', (collected, reason) => {
            if (reason === 'time') {
              mainMsg.edit({
                embeds: [new EmbedBuilder().setTitle('⏱️ Creation Timed Out').setDescription('Stat distribution session timed out. Type `.create` to try again.').setColor('#95A5A6')],
                components: []
              }).catch(() => {});
            }
          });
        }
      });

      styleCollector.on('end', (collected, reason) => {
        if (reason === 'time') {
          mainMsg.edit({
            embeds: [new EmbedBuilder().setTitle('⏱️ Creation Timed Out').setDescription('Class selection session timed out. Type `.create` to try again.').setColor('#95A5A6')],
            components: []
          }).catch(() => {});
        }
      });
    });

    slotCollector.on('end', (collected, reason) => {
      if (reason === 'time') {
        mainMsg.edit({
          embeds: [new EmbedBuilder().setTitle('⏱️ Creation Timed Out').setDescription('Slot selection session timed out. Type `.create` to try again.').setColor('#95A5A6')],
          components: []
        }).catch(() => {});
      }
    });
  }
};
