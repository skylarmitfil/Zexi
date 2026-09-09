const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const Fighter = require('../models/Fighter');

const BASE_REWARD = 100;
const DEFAULT_AVATAR = 'https://cdn.discordapp.com/embed/avatars/0.png';

const STYLE_MOVES = {
  Berserker: { name: 'Rage Strike', id: 'style_berserker', style: ButtonStyle.Danger },
  Guardian: { name: 'Iron Fortress', id: 'style_guardian', style: ButtonStyle.Secondary },
  Assassin: { name: 'Shadow Step', id: 'style_assassin', style: ButtonStyle.Primary },
  Monk: { name: 'Chakra Heal', id: 'style_monk', style: ButtonStyle.Success },
  Mage: { name: 'Arcane Burst', id: 'style_mage', style: ButtonStyle.Primary },
  Paladin: { name: 'Holy Shield', id: 'style_paladin', style: ButtonStyle.Success }
};

function getValidAvatar(fighter, user) {
  if (fighter.imageUrl && !fighter.imageUrl.includes('8Q9Z5b3') && fighter.imageUrl.startsWith('http')) {
    return fighter.imageUrl;
  }
  return user ? user.displayAvatarURL({ extension: 'png', size: 256 }) : DEFAULT_AVATAR;
}

module.exports = {
  name: 'pvp',
  description: 'Challenge another player to a PvP arena match',
  async execute(message, args) {
    const opponent = message.mentions.users.first();
    if (!opponent || opponent.bot || opponent.id === message.author.id) {
      return message.channel.send('Mention a valid user to challenge!');
    }

    // Verify Player 1 character
    const f1 = await Fighter.findOne({ userId: message.author.id });
    if (!f1) {
      return message.channel.send('⚠️ You must create a character first! Type `.create` to start.');
    }

    // Verify Player 2 character
    const f2 = await Fighter.findOne({ userId: opponent.id });
    if (!f2) {
      return message.channel.send(`⚠️ **${opponent.username}** has not created a character yet! They need to type \`.create\` first.`);
    }

    // Step 1: Send Challenge Invite
    const challengeEmbed = new EmbedBuilder()
      .setTitle('⚔️ PvP Challenge Issued!')
      .setDescription(`**<@${message.author.id}>** has challenged **<@${opponent.id}>** to an arena match!\n\nDo you accept the challenge?`)
      .setColor('#E67E22');

    const challengeRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('accept_pvp').setLabel('Accept Challenge').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('decline_pvp').setLabel('Decline').setStyle(ButtonStyle.Danger)
    );

    const challengeMsg = await message.channel.send({
      content: `<@${opponent.id}>`,
      embeds: [challengeEmbed],
      components: [challengeRow]
    });

    const inviteCollector = challengeMsg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60000
    });

    inviteCollector.on('collect', async (i) => {
      // Only the challenged player can respond
      if (i.user.id !== opponent.id) {
        return i.reply({ content: `Only <@${opponent.id}> can accept or decline this challenge!`, ephemeral: true });
      }

      if (i.customId === 'decline_pvp') {
        inviteCollector.stop('declined');
        const declineEmbed = new EmbedBuilder()
          .setTitle('❌ Challenge Declined')
          .setDescription(`**${opponent.username}** declined the challenge from **${message.author.username}**.`)
          .setColor('#E74C3C');
        return i.update({ embeds: [declineEmbed], components: [] });
      }

      if (i.customId === 'accept_pvp') {
        inviteCollector.stop('accepted');
        await i.deferUpdate();
        
        // Step 2: Start the match engine
        startMatch(message, opponent, f1, f2, challengeMsg);
      }
    });

    inviteCollector.on('end', (collected, reason) => {
      if (reason === 'time') {
        challengeMsg.edit({
          content: '⏱️ The challenge timed out without a response.',
          components: []
        }).catch(() => {});
      }
    });
  }
};

// Step 2: Match Engine Function
async function startMatch(message, opponent, f1, f2, matchMsg) {
  const p1MaxHp = f1.maxHp || f1.hp || 100;
  const p2MaxHp = f2.maxHp || f2.hp || 100;

  let state = {
    p1: { 
      id: f1.userId, 
      name: f1.name, 
      style: f1.fightingStyle || 'Berserker',
      hp: f1.hp || p1MaxHp, 
      maxHp: p1MaxHp, 
      atk: f1.attack || 15, 
      def: f1.defense || 5, 
      level: f1.level || 1, 
      img: getValidAvatar(f1, message.author), 
      guarding: false,
      ironFortress: false,
      cooldown: 0
    },
    p2: { 
      id: f2.userId, 
      name: f2.name, 
      style: f2.fightingStyle || 'Berserker',
      hp: f2.hp || p2MaxHp, 
      maxHp: p2MaxHp, 
      atk: f2.attack || 15, 
      def: f2.defense || 5, 
      level: f2.level || 1, 
      img: getValidAvatar(f2, opponent), 
      guarding: false,
      ironFortress: false,
      cooldown: 0
    },
    turn: f1.userId
  };

  function buildRow(player) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('quick').setLabel('Quick Strike').setStyle(ButtonStyle.Primary)
    );

    const special = STYLE_MOVES[player.style] || STYLE_MOVES.Berserker;
    const specialBtn = new ButtonBuilder()
      .setCustomId(special.id)
      .setLabel(player.cooldown > 0 ? `${special.name} (${player.cooldown}T CD)` : special.name)
      .setStyle(special.style)
      .setDisabled(player.cooldown > 0);
    row.addComponents(specialBtn);

    if (player.level >= 3) {
      row.addComponents(new ButtonBuilder().setCustomId('heavy').setLabel('Heavy Slam (Lvl 3)').setStyle(ButtonStyle.Danger));
    }

    row.addComponents(new ButtonBuilder().setCustomId('guard').setLabel('Guard').setStyle(ButtonStyle.Secondary));
    return row;
  }

  const embed = new EmbedBuilder()
    .setTitle('⚔️ Arena Match Started')
    .setDescription(`It is <@${state.turn}>'s turn!`)
    .setThumbnail(state.p1.img)
    .addFields(
      { name: `${state.p1.name} (${state.p1.style})`, value: `HP: **${state.p1.hp}/${state.p1.maxHp}**`, inline: true },
      { name: `${state.p2.name} (${state.p2.style})`, value: `HP: **${state.p2.hp}/${state.p2.maxHp}**`, inline: true }
    )
    .setColor('#E74C3C');

  await matchMsg.edit({ content: null, embeds: [embed], components: [buildRow(state.p1)] });
  const collector = matchMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120000 });

  collector.on('collect', async (i) => {
    if (i.user.id !== state.turn) {
      return i.reply({ content: 'It is not your turn!', ephemeral: true });
    }

    let attacker = state.turn === state.p1.id ? state.p1 : state.p2;
    let defender = state.turn === state.p1.id ? state.p2 : state.p1;
    let actionLog = '';

    if (attacker.cooldown > 0) attacker.cooldown--;
    attacker.guarding = false;

    // Execute Action
    if (i.customId === 'quick') {
      let dmg = Math.max(5, attacker.atk - defender.def + Math.floor(Math.random() * 4));
      if (defender.ironFortress) dmg = Math.floor(dmg * 0.2);
      else if (defender.guarding) dmg = Math.floor(dmg / 2);
      defender.hp -= dmg;
      actionLog = `💥 **${attacker.name}** hit **${defender.name}** for **${dmg} DMG**!`;
    } 
    else if (i.customId === 'style_berserker') {
      let selfDmg = 15;
      let dmg = Math.max(15, Math.floor(attacker.atk * 2.2) - defender.def);
      attacker.hp -= selfDmg;
      defender.hp -= dmg;
      attacker.cooldown = 2;
      actionLog = `🩸 **${attacker.name}** sacrificed **${selfDmg} HP** to deal **${dmg} DMG**!`;
    }
    else if (i.customId === 'style_guardian') {
      attacker.ironFortress = true;
      attacker.cooldown = 3;
      actionLog = `🛡️ **${attacker.name}** activated **Iron Fortress**! Incoming DMG reduced by 80%.`;
    }
    else if (i.customId === 'style_assassin') {
      attacker.cooldown = 2;
      if (Math.random() <= 0.6) {
        let dmg = Math.floor(attacker.atk * 2.5);
        defender.hp -= dmg;
        actionLog = `🗡️ **CRITICAL!** **${attacker.name}** struck from shadows for **${dmg} DMG**!`;
      } else {
        actionLog = `💨 **${attacker.name}** tried Shadow Step and **MISSED**!`;
      }
    }
    else if (i.customId === 'style_monk') {
      let heal = 25;
      let dmg = Math.max(5, Math.floor(attacker.atk * 0.9));
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
      defender.hp -= dmg;
      attacker.cooldown = 3;
      actionLog = `🧘 **${attacker.name}** used **Chakra Heal**! (+${heal} HP, dealt ${dmg} DMG)`;
    }
    else if (i.customId === 'style_mage') {
      let dmg = Math.floor(attacker.atk * 1.8);
      defender.hp -= dmg;
      attacker.cooldown = 2;
      actionLog = `🔮 **${attacker.name}** cast **Arcane Burst** for **${dmg} PURE DMG**!`;
    }
    else if (i.customId === 'style_paladin') {
      let heal = 15;
      let dmg = Math.max(8, attacker.atk - defender.def);
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
      defender.hp -= dmg;
      attacker.cooldown = 2;
      actionLog = `✝️ **${attacker.name}** used **Holy Shield**! (+${heal} HP, dealt ${dmg} DMG)`;
    }
    else if (i.customId === 'heavy') {
      if (Math.random() >= 0.35) {
        let dmg = Math.max(10, Math.floor(attacker.atk * 1.6) - defender.def);
        defender.hp -= dmg;
        actionLog = `🔥 **${attacker.name}** landed Heavy Slam for **${dmg} DMG**!`;
      } else {
        actionLog = `💨 **${attacker.name}** tried Heavy Slam and **MISSED**!`;
      }
    } 
    else if (i.customId === 'guard') {
      attacker.guarding = true;
      actionLog = `🛡️ **${attacker.name}** is guarding!`;
    }

    defender.ironFortress = false;

    // Check Victory
    if (defender.hp <= 0 || attacker.hp <= 0) {
      collector.stop();

      let winner = defender.hp <= 0 ? attacker : defender;
      let loser = defender.hp <= 0 ? defender : attacker;

      let winnerDoc = await Fighter.findOne({ userId: winner.id });
      const coinsEarned = BASE_REWARD + (winnerDoc.level * 15);

      winnerDoc.wins += 1;
      winnerDoc.xp += 35;
      winnerDoc.balance += coinsEarned;

      await winnerDoc.save();
      await Fighter.updateOne({ userId: loser.id }, { $inc: { losses: 1 } });

      const winEmbed = new EmbedBuilder()
        .setTitle('🏆 Match Finished!')
        .setThumbnail(winner.img)
        .setDescription(
          `**${winner.name}** won the match!\n\n` +
          `${actionLog}\n\n` +
          `💰 **Prize:** +${coinsEarned} coins (Balance: ${winnerDoc.balance})\n` +
          `🌟 **XP:** +35 XP`
        )
        .setColor('#2ECC71');

      return i.update({ embeds: [winEmbed], components: [] });
    }

    // Turn transition
    state.turn = defender.id;
    let nextPlayer = state.turn === state.p1.id ? state.p1 : state.p2;

    const updateEmbed = new EmbedBuilder()
      .setTitle('⚔️ Arena Match in Progress')
      .setDescription(`${actionLog}\n\nIt is <@${state.turn}>'s turn!`)
      .setThumbnail(nextPlayer.img)
      .addFields(
        { name: `${state.p1.name} (${state.p1.style})`, value: `HP: **${Math.max(0, state.p1.hp)}/${state.p1.maxHp}**`, inline: true },
        { name: `${state.p2.name} (${state.p2.style})`, value: `HP: **${Math.max(0, state.p2.hp)}/${state.p2.maxHp}**`, inline: true }
      )
      .setColor('#3498DB');

    await i.update({ embeds: [updateEmbed], components: [buildRow(nextPlayer)] });
  });

  collector.on('end', (collected, reason) => {
    if (reason === 'time') {
      matchMsg.edit({ content: '⏱️ The match timed out due to inactivity.', components: [] }).catch(() => {});
    }
  });
}
