const { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ComponentType 
} = require('discord.js');
const Fighter = require('../models/Fighter');
const { processHealAction, processAttackAction, renderHealthBar } = require('../utils/combat');

module.exports = {
  name: 'pvp',
  aliases: ['challenge', 'duel', 'fight'],
  description: 'Challenge another user to a turn-based PvP battle.',
  async execute(message, args) {
    const opponentUser = message.mentions.users.first();

    // 1. Validation Checks
    if (!opponentUser) {
      return message.reply('⚠️ Please mention a user to challenge! Example: `,pvp @User`');
    }

    if (opponentUser.id === message.author.id) {
      return message.reply('⚠️ You cannot fight yourself!');
    }

    if (opponentUser.bot) {
      return message.reply('⚠️ You cannot fight Discord bots!');
    }

    // 2. Load Fighters from Database
    const challengerFighters = await Fighter.find({ userId: message.author.id });
    const opponentFighters = await Fighter.find({ userId: opponentUser.id });

    if (!challengerFighters.length) {
      return message.reply('⚠️ You do not have any characters! Create one using `.create`.');
    }

    if (!opponentFighters.length) {
      return message.reply(`⚠️ **${opponentUser.username}** does not have any characters!`);
    }

    // Helper to select character slot if player has multiple
    async function selectFighter(user, fighters, isChallenger) {
      if (fighters.length === 1) return fighters[0];

      const slotEmbed = new EmbedBuilder()
        .setTitle(`🎮 ${user.username}, Select Your Fighter`)
        .setDescription('Choose which character slot you want to bring into battle:')
        .setColor('#3498DB');

      fighters.forEach(f => {
        slotEmbed.addFields({ 
          name: `Slot ${f.slot}: ${f.name}`, 
          value: `Class: ${f.fightingStyle} | HP: ${f.hp}/${f.maxHp} | ATK: ${f.attack} | DEF: ${f.defense}`, 
          inline: false 
        });
      });

      const buttons = fighters.map(f => 
        new ButtonBuilder()
          .setCustomId(`select_slot_${f.slot}`)
          .setLabel(`Slot ${f.slot}: ${f.name}`)
          .setStyle(ButtonStyle.Primary)
      );

      const slotMsg = await message.channel.send({ 
        content: `<@${user.id}>`, 
        embeds: [slotEmbed], 
        components: [new ActionRowBuilder().addComponents(buttons)] 
      });

      const choice = await slotMsg.awaitMessageComponent({
        filter: (i) => i.user.id === user.id,
        time: 30000
      }).catch(() => null);

      await slotMsg.delete().catch(() => {});

      if (!choice) return null;

      const chosenSlot = parseInt(choice.customId.replace('select_slot_', ''));
      return fighters.find(f => f.slot === chosenSlot);
    }

    // Prompt Challenger & Opponent to pick their character slot
    const p1 = await selectFighter(message.author, challengerFighters, true);
    if (!p1) return message.reply('⏱️ Character selection timed out.');

    const p2 = await selectFighter(opponentUser, opponentFighters, false);
    if (!p2) return message.reply(`⏱️ **${opponentUser.username}** failed to select a character.`);

    // Clone Fighter objects to prevent mutating base DB stats during battle
    const fighter1 = { ...p1.toObject(), maxHp: p1.hp };
    const fighter2 = { ...p2.toObject(), maxHp: p2.hp };

    // 3. Send Battle Challenge
    const challengeEmbed = new EmbedBuilder()
      .setTitle('⚔️ PvP Challenge Sent!')
      .setDescription(`<@${opponentUser.id}>, **${message.author.username}** has challenged you to a duel!\n\n**${fighter1.name}** (${fighter1.fightingStyle}) 🆚 **${fighter2.name}** (${fighter2.fightingStyle})`)
      .setColor('#F1C40F');

    const challengeRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('pvp_accept').setLabel('Accept Duel').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('pvp_decline').setLabel('Decline').setStyle(ButtonStyle.Danger)
    );

    const challengeMsg = await message.channel.send({
      content: `<@${opponentUser.id}>`,
      embeds: [challengeEmbed],
      components: [challengeRow]
    });

    const challengeInteraction = await challengeMsg.awaitMessageComponent({
      filter: (i) => i.user.id === opponentUser.id,
      time: 60000
    }).catch(() => null);

    if (!challengeInteraction || challengeInteraction.customId === 'pvp_decline') {
      return challengeMsg.edit({
        embeds: [new EmbedBuilder().setTitle('⚔️ Challenge Declined').setDescription(`**${opponentUser.username}** declined or ignored the duel.`).setColor('#E74C3C')],
        components: []
      });
    }

    // 4. Start Turn-Based Battle Loop
    let turn = 1;
    let activePlayer = message.author.id; // Challenger moves first
    let lastLog = 'The duel has officially begun! Select an action.';

    function buildBattleUI() {
      const isP1Turn = activePlayer === message.author.id;
      const currentTurnUser = isP1Turn ? message.author.username : opponentUser.username;
      const currentTurnFighter = isP1Turn ? fighter1.name : fighter2.name;

      const battleEmbed = new EmbedBuilder()
        .setTitle(`⚔️ PvP Battle: ${fighter1.name} VS ${fighter2.name}`)
        .setDescription(`**Turn ${turn}:** <@${activePlayer}>'s Turn (**${currentTurnFighter}**)\n\n📜 **Log:** ${lastLog}`)
        .addFields(
          { 
            name: `${fighter1.name} (${message.author.username})`, 
            value: `${renderHealthBar(fighter1.hp, fighter1.maxHp)}\nClass: ${fighter1.fightingStyle}`, 
            inline: true 
          },
          { 
            name: `${fighter2.name} (${opponentUser.username})`, 
            value: `${renderHealthBar(fighter2.hp, fighter2.maxHp)}\nClass: ${fighter2.fightingStyle}`, 
            inline: true 
          }
        )
        .setColor('#9B59B6');

      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_attack').setLabel('⚔️ Attack').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('btn_heal').setLabel('✨ Heal').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('btn_forfeit').setLabel('🏳️ Forfeit').setStyle(ButtonStyle.Secondary)
      );

      return { embeds: [battleEmbed], components: [actionRow] };
    }

    await challengeInteraction.update(buildBattleUI());

    let battleActive = true;

    while (battleActive) {
      const interaction = await challengeMsg.awaitMessageComponent({
        filter: (i) => [message.author.id, opponentUser.id].includes(i.user.id),
        time: 90000
      }).catch(() => null);

      if (!interaction) {
        return challengeMsg.edit({
          embeds: [new EmbedBuilder().setTitle('⏱️ Battle Timed Out').setDescription('The battle ended due to inactivity.').setColor('#95A5A6')],
          components: []
        }).catch(() => {});
      }

      // Ensure only the active player can press action buttons
      if (interaction.user.id !== activePlayer) {
        await interaction.reply({ content: '⚠️ It is not your turn!', ephemeral: true });
        continue;
      }

      const isP1 = activePlayer === message.author.id;
      const attacker = isP1 ? fighter1 : fighter2;
      const defender = isP1 ? fighter2 : fighter1;

      // FORFEIT
      if (interaction.customId === 'btn_forfeit') {
        battleActive = false;
        const winnerName = isP1 ? opponentUser.username : message.author.username;
        
        const winEmbed = new EmbedBuilder()
          .setTitle('🏳️ Battle Forfeited')
          .setDescription(`**${interaction.user.username}** forfeited! **${winnerName}** wins the duel!`)
          .setColor('#E74C3C');

        return await interaction.update({ embeds: [winEmbed], components: [] });
      }

      // ATTACK ACTION
      if (interaction.customId === 'btn_attack') {
        const result = processAttackAction(attacker, defender);
        lastLog = result.log;
      }

      // HEAL ACTION (Uses custom utils/combat logic)
      if (interaction.customId === 'btn_heal') {
        const result = processHealAction(attacker, defender);
        lastLog = result.log;
      }

      // CHECK FOR WINNER
      if (defender.hp <= 0) {
        battleActive = false;

        // Update DB Wins/Losses
        const winnerUser = isP1 ? message.author : opponentUser;
        const loserUser = isP1 ? opponentUser : message.author;
        const winnerFighter = isP1 ? p1 : p2;
        const loserFighter = isP1 ? p2 : p1;

        await Fighter.updateOne({ _id: winnerFighter._id }, { $inc: { wins: 1, balance: 50 } });
        await Fighter.updateOne({ _id: loserFighter._id }, { $inc: { losses: 1 } });

        const victoryEmbed = new EmbedBuilder()
          .setTitle('🏆 VICTORY!')
          .setDescription(`**${attacker.name}** (${winnerUser.username}) defeated **${defender.name}** (${loserUser.username})!\n\n📜 **Final Action:** ${lastLog}\n💰 **Reward:** +50 Gold awarded to <@${winnerUser.id}>!`)
          .addFields(
            { name: fighter1.name, value: renderHealthBar(fighter1.hp, fighter1.maxHp), inline: true },
            { name: fighter2.name, value: renderHealthBar(fighter2.hp, fighter2.maxHp), inline: true }
          )
          .setColor('#2ECC71');

        return await interaction.update({ embeds: [victoryEmbed], components: [] });
      }

      // SWITCH TURNS
      activePlayer = isP1 ? opponentUser.id : message.author.id;
      turn++;

      await interaction.update(buildBattleUI());
    }
  }
};
