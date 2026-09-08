const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const Fighter = require('../models/Fighter');

module.exports = {
  name: 'pvp',
  description: 'Challenge another user to a PvP fight in Discord',
  async execute(message, args) {
    const opponent = message.mentions.users.first();

    if (!opponent || opponent.bot || opponent.id === message.author.id) {
      return message.channel.send('Please mention a valid user to challenge! Example: `.pvp @user`');
    }

    let p1 = await Fighter.findOne({ userId: message.author.id });
    if (!p1) p1 = await Fighter.create({ userId: message.author.id, name: message.author.username });

    let p2 = await Fighter.findOne({ userId: opponent.id });
    if (!p2) p2 = await Fighter.create({ userId: opponent.id, name: opponent.username });

    let state = {
      p1: { id: p1.userId, name: p1.name, hp: 100, guarding: false },
      p2: { id: p2.userId, name: p2.name, hp: 100, guarding: false },
      turn: p1.userId
    };

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('quick').setLabel('Quick Strike').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('heavy').setLabel('Heavy Attack').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('guard').setLabel('Guard').setStyle(ButtonStyle.Primary)
    );

    const matchMessage = await message.channel.send({
      content: `⚔️ **PvP MATCH STARTED!**\n**${state.p1.name}** (100 HP) vs **${state.p2.name}** (100 HP)\n\nIt is <@${state.turn}>'s turn!`,
      components: [buttons]
    });

    const collector = matchMessage.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120000 
    });

    collector.on('collect', async (interaction) => {
      if (interaction.user.id !== state.turn) {
        return interaction.reply({ content: 'It is not your turn!', ephemeral: true });
      }

      let attacker = state.turn === state.p1.id ? state.p1 : state.p2;
      let defender = state.turn === state.p1.id ? state.p2 : state.p1;
      let actionLog = '';

      attacker.guarding = false;

      if (interaction.customId === 'quick') {
        let dmg = Math.floor(Math.random() * 6) + 12;
        if (defender.guarding) dmg = Math.floor(dmg / 2);
        defender.hp -= dmg;
        actionLog = `💥 **${attacker.name}** used Quick Strike for **${dmg} DMG**!`;
      } 
      else if (interaction.customId === 'heavy') {
        let hit = Math.random() >= 0.4;
        if (hit) {
          let dmg = Math.floor(Math.random() * 11) + 22;
          if (defender.guarding) dmg = Math.floor(dmg / 2);
          defender.hp -= dmg;
          actionLog = `🔥 **${attacker.name}** landed a HEAVY ATTACK for **${dmg} DMG**!`;
        } else {
          actionLog = `💨 **${attacker.name}** swung heavy and **MISSED**!`;
        }
      } 
      else if (interaction.customId === 'guard') {
        attacker.guarding = true;
        actionLog = `🛡️ **${attacker.name}** is guarding against the next hit!`;
      }

      if (defender.hp <= 0) {
        await Fighter.updateOne({ userId: attacker.id }, { $inc: { wins: 1 } });
        await Fighter.updateOne({ userId: defender.id }, { $inc: { losses: 1 } });

        collector.stop();
        return interaction.update({
          content: `🏆 **${attacker.name}** DEFEATED **${defender.name}**!\n${actionLog}`,
          components: []
        });
      }

      state.turn = defender.id;

      await interaction.update({
        content: `${actionLog}\n\n**${state.p1.name}**: ${Math.max(0, state.p1.hp)} HP | **${state.p2.name}**: ${Math.max(0, state.p2.hp)} HP\nIt is <@${state.turn}>'s turn!`,
        components: [buttons]
      });
    });

    collector.on('end', (_, reason) => {
      if (reason === 'time') {
        matchMessage.edit({ content: 'Match ended due to inactivity.', components: [] });
      }
    });
  }
};
