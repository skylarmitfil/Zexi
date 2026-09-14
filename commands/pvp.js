const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const Fighter = require('../models/Fighter');
const Inventory = require('../models/Inventory');
const {
  getClass,
  createCombatant,
  tickStatuses,
  performAttack,
  performHeal,
  performGuard,
  performSpecial,
  renderHealthBar,
  renderEnergyBar,
  statusSummary,
  applyXpAndLevel,
  healRaw,
  gainEnergy
} = require('../utils/combat');

const POTION_HEAL = 30;

module.exports = {
  name: 'pvp',
  aliases: ['challenge', 'duel', 'fight'],
  description: 'Challenge another user to a turn-based PvP battle.',
  async execute(message, args) {
    const opponentUser = message.mentions.users.first();

    if (!opponentUser) return message.reply('⚠️ Please mention a user to challenge! Example: `,pvp @User`');
    if (opponentUser.id === message.author.id) return message.reply('⚠️ You cannot fight yourself!');
    if (opponentUser.bot) return message.reply('⚠️ You cannot fight Discord bots!');

    const challengerFighters = await Fighter.find({ userId: message.author.id });
    const opponentFighters = await Fighter.find({ userId: opponentUser.id });

    if (!challengerFighters.length) return message.reply('⚠️ You do not have any characters! Create one using `,create`.');
    if (!opponentFighters.length) return message.reply(`⚠️ **${opponentUser.username}** does not have any characters!`);

    async function selectFighter(user, fighters) {
      if (fighters.length === 1) return fighters[0];

      const slotEmbed = new EmbedBuilder()
        .setTitle(`🎮 ${user.username}, Select Your Fighter`)
        .setDescription('Choose which character slot you want to bring into battle:')
        .setColor('#3498DB');

      fighters.forEach(f => slotEmbed.addFields({
        name: `Slot ${f.slot}: ${f.name}`,
        value: `Class: ${f.fightingStyle} | HP: ${f.maxHp} | ATK: ${f.attack} | DEF: ${f.defense}`,
        inline: false
      }));

      const buttons = fighters.map(f =>
        new ButtonBuilder().setCustomId(`select_slot_${f.slot}`).setLabel(`Slot ${f.slot}: ${f.name}`).setStyle(ButtonStyle.Primary));

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

    const p1Doc = await selectFighter(message.author, challengerFighters);
    if (!p1Doc) return message.reply('⏱️ Character selection timed out.');
    const p2Doc = await selectFighter(opponentUser, opponentFighters);
    if (!p2Doc) return message.reply(`⏱️ **${opponentUser.username}** failed to select a character.`);

    // Combatants (true maxHp — fixes prior current-HP-as-maxHp bug)
    const fighter1 = createCombatant(p1Doc);
    const fighter2 = createCombatant(p2Doc);
    const inv1 = await Inventory.findOne({ userId: message.author.id });
    const inv2 = await Inventory.findOne({ userId: opponentUser.id });
    fighter1.potions = inv1 ? inv1.potions : 0;
    fighter2.potions = inv2 ? inv2.potions : 0;
    const class1 = getClass(fighter1.style);
    const class2 = getClass(fighter2.style);

    const challengeEmbed = new EmbedBuilder()
      .setTitle('⚔️ PvP Challenge Sent!')
      .setDescription(`<@${opponentUser.id}>, **${message.author.username}** has challenged you to a duel!\n\n**${fighter1.name}** (${fighter1.style}) 🆚 **${fighter2.name}** (${fighter2.style})`)
      .addFields(
        { name: `${class1.name} passive`, value: class1.passive, inline: false },
        { name: `${class2.name} passive`, value: class2.passive, inline: false }
      )
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

    let turn = 1;
    let activePlayer = message.author.id;
    let lastLog = 'The duel has begun! Attack, unleash your class Special, Heal or Guard.';

    function combatant(id) { return id === message.author.id ? fighter1 : fighter2; }

    function buildBattleUI() {
      const active = combatant(activePlayer);
      const activeClass = getClass(active.style);
      const s1 = statusSummary(fighter1);
      const s2 = statusSummary(fighter2);

      const battleEmbed = new EmbedBuilder()
        .setTitle(`⚔️ ${fighter1.name} VS ${fighter2.name}`)
        .setDescription(`**Turn ${turn}:** <@${activePlayer}> (**${active.name}**)\n\n📜 ${lastLog}`)
        .addFields(
          {
            name: `${fighter1.name} · ${message.author.username}`,
            value: `${renderHealthBar(fighter1.hp, fighter1.maxHp)}\n${renderEnergyBar(fighter1.energy)}\n${fighter1.style}${s1 ? ` · ${s1}` : ''}`,
            inline: true
          },
          {
            name: `${fighter2.name} · ${opponentUser.username}`,
            value: `${renderHealthBar(fighter2.hp, fighter2.maxHp)}\n${renderEnergyBar(fighter2.energy)}\n${fighter2.style}${s2 ? ` · ${s2}` : ''}`,
            inline: true
          }
        )
        .setFooter({ text: `${active.name}'s Special: ${activeClass.special.name} (${activeClass.special.cost}⚡) — ${activeClass.special.desc}` })
        .setColor('#9B59B6');

      const canSpecial = active.energy >= activeClass.special.cost;
      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_attack').setLabel('Attack').setEmoji('⚔️').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('btn_special').setLabel('Special').setEmoji('🌟').setStyle(ButtonStyle.Primary).setDisabled(!canSpecial),
        new ButtonBuilder().setCustomId('btn_heal').setLabel('Heal').setEmoji('✨').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('btn_guard').setLabel('Guard').setEmoji('🛡️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_potion').setLabel(`Potion (${active.potions})`).setEmoji('🧪').setStyle(ButtonStyle.Success).setDisabled(active.potions <= 0)
      );
      const utilityRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_forfeit').setLabel('Forfeit').setEmoji('🏳️').setStyle(ButtonStyle.Secondary)
      );

      return { content: `<@${activePlayer}>`, embeds: [battleEmbed], components: [actionRow, utilityRow] };
    }

    async function finishBattle(winnerDoc, loserDoc, winnerUser, loserUser, interaction, finalLog) {
      // Streaks, gold, XP, leveling
      const freshWinner = await Fighter.findById(winnerDoc._id);
      const freshLoser = await Fighter.findById(loserDoc._id);

      let rewardText = '';
      if (freshWinner) {
        freshWinner.wins += 1;
        freshWinner.winStreak = (freshWinner.winStreak || 0) + 1;
        if (freshWinner.winStreak > (freshWinner.bestStreak || 0)) freshWinner.bestStreak = freshWinner.winStreak;
        const streakBonus = Math.min(200, (freshWinner.winStreak - 1) * 10);
        const gold = 50 + streakBonus;
        freshWinner.balance += gold;
        const leveled = applyXpAndLevel(freshWinner, 40);
        await freshWinner.save();
        rewardText = `💰 **+${gold} gold** (streak x${freshWinner.winStreak}${streakBonus ? `, +${streakBonus} bonus` : ''}) & **+40 XP** to <@${winnerUser.id}>!`;
        if (leveled) rewardText += `\n⬆️ **${freshWinner.name}** reached **Level ${freshWinner.level}**! (+${leveled * 2} stat points)`;
      }
      if (freshLoser) {
        freshLoser.losses += 1;
        freshLoser.winStreak = 0;
        await freshLoser.save();
      }

      const victoryEmbed = new EmbedBuilder()
        .setTitle('🏆 VICTORY!')
        .setDescription(`**${winnerDoc.name}** (${winnerUser.username}) defeated **${loserDoc.name}** (${loserUser.username})!\n\n📜 ${finalLog}\n\n${rewardText}`)
        .addFields(
          { name: fighter1.name, value: renderHealthBar(fighter1.hp, fighter1.maxHp), inline: true },
          { name: fighter2.name, value: renderHealthBar(fighter2.hp, fighter2.maxHp), inline: true }
        )
        .setColor('#2ECC71');

      return interaction.update({ content: '', embeds: [victoryEmbed], components: [] });
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
          content: '',
          embeds: [new EmbedBuilder().setTitle('⏱️ Battle Timed Out').setDescription('The battle ended due to inactivity.').setColor('#95A5A6')],
          components: []
        }).catch(() => {});
      }

      if (interaction.user.id !== activePlayer) {
        await interaction.reply({ content: '⚠️ It is not your turn!', ephemeral: true });
        continue;
      }

      const isP1 = activePlayer === message.author.id;
      const attacker = isP1 ? fighter1 : fighter2;
      const defender = isP1 ? fighter2 : fighter1;
      const attackerUser = isP1 ? message.author : opponentUser;
      const defenderUser = isP1 ? opponentUser : message.author;
      const attackerDoc = isP1 ? p1Doc : p2Doc;
      const defenderDoc = isP1 ? p2Doc : p1Doc;

      if (interaction.customId === 'btn_forfeit') {
        const freshWinner = await Fighter.findById(defenderDoc._id);
        const freshLoser = await Fighter.findById(attackerDoc._id);
        if (freshWinner) { freshWinner.wins += 1; freshWinner.winStreak = (freshWinner.winStreak || 0) + 1; if (freshWinner.winStreak > (freshWinner.bestStreak || 0)) freshWinner.bestStreak = freshWinner.winStreak; freshWinner.balance += 30; await freshWinner.save(); }
        if (freshLoser) { freshLoser.losses += 1; freshLoser.winStreak = 0; await freshLoser.save(); }
        return interaction.update({
          content: '',
          embeds: [new EmbedBuilder().setTitle('🏳️ Battle Forfeited').setDescription(`**${attackerUser.username}** forfeited! **${defenderUser.username}** wins the duel! (+30 gold)`).setColor('#E74C3C')],
          components: []
        });
      }

      // Potion action needs at least one potion, but doesn't consume the turn if empty
      if (interaction.customId === 'btn_potion' && attacker.potions <= 0) {
        await interaction.reply({ content: '⚠️ You have no Health Potions! Buy some with `,shop`.', ephemeral: true });
        continue;
      }

      // Start-of-turn effects
      const tick = tickStatuses(attacker);
      const logParts = [...tick.logs];

      // Sudden death: escalating unavoidable arena damage prevents infinite stalemates
      if (turn > 20) {
        const arena = turn - 20;
        attacker.hp = Math.max(0, attacker.hp - arena);
        logParts.push(`☄️ The arena crumbles! **${attacker.name}** takes **${arena}** unavoidable damage.`);
      }

      if (attacker.hp <= 0) {
        battleActive = false;
        return finishBattle(defenderDoc, attackerDoc, defenderUser, attackerUser, interaction, [...logParts, `${attacker.name} succumbed to their wounds!`].join('\n'));
      }

      if (tick.stunned) {
        lastLog = logParts.join('\n');
      } else {
        let result;
        if (interaction.customId === 'btn_attack') result = performAttack(attacker, defender);
        else if (interaction.customId === 'btn_special') result = performSpecial(attacker, defender);
        else if (interaction.customId === 'btn_heal') result = performHeal(attacker, defender);
        else if (interaction.customId === 'btn_guard') result = performGuard(attacker);
        else if (interaction.customId === 'btn_potion') {
          attacker.potions -= 1;
          await Inventory.updateOne({ userId: attacker.userId }, { $inc: { potions: -1 } });
          const healed = healRaw(attacker, POTION_HEAL);
          gainEnergy(attacker, 10);
          result = { logs: [`🧪 **${attacker.name}** drank a Health Potion and restored **${healed}** HP! (${attacker.potions} left)`] };
        }

        if (result && result.failed) {
          await interaction.reply({ content: result.logs.join('\n'), ephemeral: true });
          continue;
        }
        lastLog = [...logParts, ...(result ? result.logs : [])].join('\n');
      }

      if (defender.hp <= 0) {
        battleActive = false;
        return finishBattle(attackerDoc, defenderDoc, attackerUser, defenderUser, interaction, lastLog);
      }

      activePlayer = isP1 ? opponentUser.id : message.author.id;
      turn++;
      await interaction.update(buildBattleUI());
    }
  }
};
