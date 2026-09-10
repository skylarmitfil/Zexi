const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const Fighter = require('../models/Fighter');

module.exports = {
  name: 'pvp',
  aliases: ['battle'], // Enables .pvp and .battle
  description: 'Select a character slot and challenge another player',
  async execute(message, args) {
    const opponent = message.mentions.users.first();
    if (!opponent || opponent.bot || opponent.id === message.author.id) {
      return message.channel.send('Mention a valid user to challenge!');
    }

    const p1Fighters = await Fighter.find({ userId: message.author.id });
    const p2Fighters = await Fighter.find({ userId: opponent.id });

    if (p1Fighters.length === 0) {
      return message.channel.send('⚠️ You don\'t have any characters! Type `.create` to make one.');
    }
    if (p2Fighters.length === 0) {
      return message.channel.send(`⚠️ **${opponent.username}** doesn't have any characters yet!`);
    }

    // Step 1: Challenger selects their character slot
    let p1Selected = null;
    let p2Selected = null;

    const selectRow = new ActionRowBuilder();
    p1Fighters.forEach(f => {
      selectRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`select_slot_${f.slot}`)
          .setLabel(`Slot ${f.slot}: ${f.name} (${f.fightingStyle})`)
          .setStyle(ButtonStyle.Primary)
      );
    });

    const selectEmbed = new EmbedBuilder()
      .setTitle('⚔️ Choose Your Combatant')
      .setDescription('Select which character you want to bring into this match:')
      .setColor('#3498DB');

    const p1Msg = await message.channel.send({ embeds: [selectEmbed], components: [selectRow] });
    const p1Collector = p1Msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });

    p1Collector.on('collect', async (i) => {
      if (i.user.id !== message.author.id) return;

      const chosenSlot = parseInt(i.customId.replace('select_slot_', ''));
      p1Selected = p1Fighters.find(f => f.slot === chosenSlot);
      p1Collector.stop('selected');

      // Step 2: Challenge Opponent & let Opponent Pick Slot
      const p2Row = new ActionRowBuilder();
      p2Fighters.forEach(f => {
        p2Row.addComponents(
          new ButtonBuilder()
            .setCustomId(`p2_slot_${f.slot}`)
            .setLabel(`Slot ${f.slot}: ${f.name} (${f.fightingStyle})`)
            .setStyle(ButtonStyle.Success)
        );
      });
      p2Row.addComponents(new ButtonBuilder().setCustomId('decline').setLabel('Decline').setStyle(ButtonStyle.Danger));

      const inviteEmbed = new EmbedBuilder()
        .setTitle('⚔️ Challenge Issued!')
        .setDescription(`**<@${message.author.id}>** chooses **${p1Selected.name} (${p1Selected.fightingStyle})** and challenges **<@${opponent.id}>**!\n\n**<@${opponent.id}>**, select your character slot to accept or click Decline:`)
        .setColor('#E67E22');

      await i.update({ content: `<@${opponent.id}>`, embeds: [inviteEmbed], components: [p2Row] });

      const p2Collector = p1Msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

      p2Collector.on('collect', async (i2) => {
        if (i2.user.id !== opponent.id) {
          return i2.reply({ content: 'Only the challenged player can accept!', ephemeral: true });
        }

        if (i2.customId === 'decline') {
          p2Collector.stop('declined');
          return i2.update({ content: null, embeds: [new EmbedBuilder().setTitle('❌ Challenge Declined').setColor('#E74C3C')], components: [] });
        }

        const chosenSlotP2 = parseInt(i2.customId.replace('p2_slot_', ''));
        p2Selected = p2Fighters.find(f => f.slot === chosenSlotP2);
        p2Collector.stop('accepted');

        // Match Starts with p1Selected vs p2Selected
        const startEmbed = new EmbedBuilder()
          .setTitle('⚔️ Arena Match Commencing!')
          .setDescription(`**${p1Selected.name}** (${p1Selected.fightingStyle}) vs **${p2Selected.name}** (${p2Selected.fightingStyle})`)
          .setColor('#2ECC71');

        await i2.update({ content: null, embeds: [startEmbed], components: [] });
      });
    });
  }
};
