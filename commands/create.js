const { 
  EmbedBuilder, 
  ActionRowBuilder, 
  StringSelectMenuBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const Fighter = require('../models/Fighter');
const { BASE_STYLES: STYLES } = require('../utils/classData');

module.exports = {
  name: 'create',
  aliases: ['start', 'register'],
  description: 'Manage, delete, or create a character across available slots.',
  async execute(message, args) {
    let existingFighters = await Fighter.find({ userId: message.author.id }).lean();

    function buildSlotComponents() {
      const slot1Char = existingFighters.find(f => f.slot === 1);
      const slot2Char = existingFighters.find(f => f.slot === 2);

      const slotEmbed = new EmbedBuilder()
        .setTitle('📁 Character Creation: Select Slot')
        .setDescription('Select an empty slot to create a character, or delete an existing one:')
        .addFields(
          { name: 'Slot 1', value: slot1Char ? `Occupied: **${slot1Char.name}** (${slot1Char.fightingStyle})` : '🟢 Empty Slot', inline: true },
          { name: 'Slot 2', value: slot2Char ? `Occupied: **${slot2Char.name}** (${slot2Char.fightingStyle})` : '🟢 Empty Slot', inline: true }
        )
        .setColor('#3498DB');

      const buttons = [
        new ButtonBuilder().setCustomId('slot_1').setLabel('Slot 1').setStyle(ButtonStyle.Primary),
      ];

      if (slot1Char) {
        buttons.push(new ButtonBuilder().setCustomId('delete_1').setLabel('🗑️ Delete Slot 1').setStyle(ButtonStyle.Danger));
      }

      buttons.push(new ButtonBuilder().setCustomId('slot_2').setLabel('Slot 2').setStyle(ButtonStyle.Primary));

      if (slot2Char) {
        buttons.push(new ButtonBuilder().setCustomId('delete_2').setLabel('🗑️ Delete Slot 2').setStyle(ButtonStyle.Danger));
      }

      const slotRow = new ActionRowBuilder().addComponents(buttons);
      return { embeds: [slotEmbed], components: [slotRow] };
    }

    const mainMsg = await message.channel.send(buildSlotComponents());

    let chosenSlot = null;

    while (!chosenSlot) {
      const slotInteraction = await mainMsg.awaitMessageComponent({
        filter: (i) => i.user.id === message.author.id,
        time: 120000
      }).catch(() => null);

      if (!slotInteraction) {
        return mainMsg.edit({
          embeds: [new EmbedBuilder().setTitle('⏱️ Creation Timed Out').setDescription('Slot selection session timed out. Type `.create` to try again.').setColor('#95A5A6')],
          components: []
        }).catch(() => {});
      }

      if (slotInteraction.customId.startsWith('delete_')) {
        const deleteSlotNum = parseInt(slotInteraction.customId.split('_')[1]);
        const targetChar = existingFighters.find(f => f.slot === deleteSlotNum);

        if (!targetChar) {
          await slotInteraction.reply({ content: `⚠️ No character found in **Slot ${deleteSlotNum}**!`, ephemeral: true });
          continue;
        }

        const confirmEmbed = new EmbedBuilder()
          .setTitle('⚠️ WARNING: Delete Character?')
          .setDescription(`Are you sure you want to permanently delete **${targetChar.name}** (${targetChar.fightingStyle}) from **Slot ${deleteSlotNum}**?\n\n**This action cannot be undone!**`)
          .setColor('#E74C3C');

        const confirmRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('confirm_delete').setLabel('Yes, Delete Permanently').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('cancel_delete').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
        );

        await slotInteraction.update({ embeds: [confirmEmbed], components: [confirmRow] });

        const confirmInteraction = await mainMsg.awaitMessageComponent({
          filter: (i) => i.user.id === message.author.id && ['confirm_delete', 'cancel_delete'].includes(i.customId),
          time: 30000
        }).catch(() => null);

        if (confirmInteraction && confirmInteraction.customId === 'confirm_delete') {
          await Fighter.deleteOne({ _id: targetChar._id });
          existingFighters = existingFighters.filter(f => f.slot !== deleteSlotNum);

          await confirmInteraction.update(buildSlotComponents());
        } else {
          if (confirmInteraction) {
            await confirmInteraction.update(buildSlotComponents());
          } else {
            await mainMsg.edit(buildSlotComponents()).catch(() => {});
          }
        }

        continue;
      }

      if (slotInteraction.customId.startsWith('slot_')) {
        const selectedNum = parseInt(slotInteraction.customId.split('_')[1]);
        const existingInSlot = existingFighters.find(f => f.slot === selectedNum);

        if (existingInSlot) {
          await slotInteraction.reply({ 
            content: `⚠️ **Slot ${selectedNum}** is currently occupied by **${existingInSlot.name}**. Use the **Delete** button if you want to replace them.`, 
            ephemeral: true 
          });
          continue;
        }

        chosenSlot = selectedNum;

        let currentPage = 1;
        let selectedStyleKey = null;
        let styleInteraction = null;

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
              .setCustomId(`select_style_p${page}`)
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

        while (!selectedStyleKey) {
          const interaction = await mainMsg.awaitMessageComponent({
            filter: (i) => i.user.id === message.author.id,
            time: 120000
          }).catch(() => null);

          if (!interaction) {
            return mainMsg.edit({
              embeds: [new EmbedBuilder().setTitle('⏱️ Creation Timed Out').setDescription('Class selection session timed out. Type `.create` to try again.').setColor('#95A5A6')],
              components: []
            }).catch(() => {});
          }

          if (interaction.isButton()) {
            if (interaction.customId === 'page_prev') currentPage = 1;
            if (interaction.customId === 'page_next') currentPage = 2;
            await interaction.update(buildStyleComponents(currentPage));
          } else if (interaction.isStringSelectMenu()) {
            selectedStyleKey = interaction.values[0];
            styleInteraction = interaction;
          }
        }

        const baseStyle = STYLES[selectedStyleKey];

        const modalCustomId = `char_modal_${message.author.id}_${Date.now()}`;
        const modal = new ModalBuilder()
          .setCustomId(modalCustomId)
          .setTitle('Name Your Character');

        const nameInput = new TextInputBuilder()
          .setCustomId('char_name')
          .setLabel('Enter character name:')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(message.author.username)
          .setMaxLength(25)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(nameInput));

        await styleInteraction.showModal(modal);

        const modalSubmit = await styleInteraction.awaitModalSubmit({
          filter: (m) => m.customId === modalCustomId && m.user.id === message.author.id,
          time: 60000
        }).catch(() => null);

        if (!modalSubmit) {
          return mainMsg.edit({
            embeds: [new EmbedBuilder().setTitle('⏱️ Creation Timed Out').setDescription('Name entry timed out. Type `.create` to try again.').setColor('#95A5A6')],
            components: []
          }).catch(() => {});
        }

        const customName = modalSubmit.fields.getTextInputValue('char_name').trim() || message.author.username;

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

        let finished = false;

        while (!finished) {
          const btn = await mainMsg.awaitMessageComponent({
            filter: (i) => i.user.id === message.author.id,
            time: 120000
          }).catch(() => null);

          if (!btn) {
            return mainMsg.edit({
              embeds: [new EmbedBuilder().setTitle('⏱️ Creation Timed Out').setDescription('Stat allocation timed out. Type `.create` to try again.').setColor('#95A5A6')],
              components: []
            }).catch(() => {});
          }

          if (btn.customId === 'add_hp' && unspentPoints > 0) { addedHp += 10; unspentPoints--; }
          else if (btn.customId === 'add_atk' && unspentPoints > 0) { addedAtk += 2; unspentPoints--; }
          else if (btn.customId === 'add_def' && unspentPoints > 0) { addedDef += 1; unspentPoints--; }
          else if (btn.customId === 'finish') {
            finished = true;

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
              losses: 0,
              unlockedMoves: [],
              loadout: [`${selectedStyleKey}_0`]
            });

            const finalEmbed = new EmbedBuilder()
              .setTitle(`🎉 Slot ${chosenSlot} Character Created!`)
              .setThumbnail(avatarUrl)
              .setDescription(`**${created.name}** the **${created.fightingStyle}** is ready for battle!`)
              .addFields(
                { name: '❤️ HP', value: `${created.hp}`, inline: true },
                { name: '⚔️ ATK / 🛡️ DEF', value: `${created.attack} / ${created.defense}`, inline: true },
                { name: '🎯 Starter Kit', value: 'You start with a basic Attack, Block, and one starter move. Unlock more by leveling up (`,moves`) or buying them (`,moveshop`).', inline: false }
              )
              .setColor('#2ECC71');

            return await btn.update({ embeds: [finalEmbed], components: [] });
          }

          await btn.update({ embeds: [renderAllocationEmbed()], components: [renderButtons()] });
        }
      }
    }
  }
};
