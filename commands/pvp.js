const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const Fighter = require('../models/Fighter');

const BASE_REWARD = 100;
const DEFAULT_AVATAR = 'https://i.imgur.com/8Q9Z5b3.png';

module.exports = {
  name: ['battle','pvp']
  description: 'Level-based PvP with style stats, unlockable moves, and coin rewards',
  async execute(message, args) {
    const opponent = message.mentions.users.first();
    if (!opponent || opponent.bot || opponent.id === message.author.id) {
      return message.channel.send('Mention a valid user to challenge!');
    }

    // Check if player 1 has created a character
    let f1 = await Fighter.findOne({ userId: message.author.id });
    if (!f1) {
      return message.channel.send('⚠️ You must create a character first! Type `,create` to pick your fighting style.');
    }

    // Check if player 2 has created a character
    let f2 = await Fighter.findOne({ userId: opponent.id });
    if (!f2) {
      return message.channel.send(`⚠️ **${opponent.username}** has not created a character yet! They need to type \`,create\` first.`);
    }

    const p1MaxHp = f1.maxHp || f1.hp || 100;
    const p2MaxHp = f2.maxHp || f2.hp || 100;

    let state = {
      p1: { 
        id: f1.userId, 
        name: f1.name, 
        style: f1.fightingStyle || 'Fighter',
        hp: f1.hp || p1MaxHp, 
        maxHp: p1MaxHp, 
        atk: f1.attack || 15, 
        def: f1.defense || 5, 
        level: f1.level || 1, 
        img: f1.imageUrl || message.author.displayAvatarURL({ extension: 'png' }) || DEFAULT_AVATAR, 
        guarding: false 
      },
      p2: { 
        id: f2.userId, 
        name: f2.name, 
        style: f2.fightingStyle || 'Fighter',
        hp: f2.hp || p2MaxHp, 
        maxHp: p2MaxHp, 
        atk: f2.attack || 15, 
        def: f2.defense || 5, 
        level: f2.level || 1, 
        img: f2.imageUrl || opponent.displayAvatarURL({ extension: 'png' }) || DEFAULT_AVATAR, 
        guarding: false 
      },
      turn: f1.userId
    };

    function buildRow(player) {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('quick').setLabel('Quick Strike (Lvl 1)').setStyle(ButtonStyle.Primary)
      );

      if (player.level >= 3) {
        row.addComponents(new ButtonBuilder().setCustomId('heavy').setLabel('Heavy Slam (Lvl 3)').setStyle(ButtonStyle.Danger));
      }
      if (player.level >= 5) {
        row.addComponents(new ButtonBuilder().setCustomId('ultimate').setLabel('Ultimate Burst (Lvl 5)').setStyle(ButtonStyle.Success));
      }

      row.addComponents(new ButtonBuilder().setCustomId('guard').setLabel('Guard').setStyle(ButtonStyle.Secondary));
      return row;
    }

    const embed = new EmbedBuilder()
      .setTitle('⚔️ Battle has began')
      .setDescription(`It is <@${state.turn}>'s turn!`)
      .setThumbnail(state.p1.img)
      .addFields(
        { name: `${state.p1.name} (${state.p1.style} - Lvl ${state.p1.level})`, value: `HP: **${state.p1.hp}/${state.p1.maxHp}**`, inline: true },
        { name: `${state.p2.name} (${state.p2.style} - Lvl ${state.p2.level})`, value: `HP: **${state.p2.hp}/${state.p2.maxHp}**`, inline: true }
      )
      .setColor('#E74C3C');

    let activePlayer = state.p1;
    const msg = await message.channel.send({ embeds: [embed], components: [buildRow(activePlayer)] });

    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120000 });

    collector.on('collect', async (i) => {
      if (i.user.id !== state.turn) {
        return i.reply({ content: 'It is not your turn!', ephemeral: true });
      }

      let attacker = state.turn === state.p1.id ? state.p1 : state.p2;
      let defender = state.turn === state.p1.id ? state.p2 : state.p1;
      let actionLog = '';

      attacker.guarding = false;

      if (i.customId === 'quick') {
        let dmg = Math.max(5, attacker.atk - defender.def + Math.floor(Math.random() * 5));
        if (defender.guarding) dmg = Math.floor(dmg / 2);
        defender.hp -= dmg;
        actionLog = `💥 **${attacker.name}** hit **${defender.name}** for **${dmg} DMG**!`;
      } else if (i.customId === 'heavy') {
        if (Math.random() >= 0.35) {
          let dmg = Math.max(10, Math.floor(attacker.atk * 1.6) - defender.def);
          if (defender.guarding) dmg = Math.floor(dmg / 2);
          defender.hp -= dmg;
          actionLog = `**${attacker.name}** landed a Heavy Slam for **${dmg} DMG**!`;
        } else {
          actionLog = `**${attacker.name}** has **MISSED**!`;
        }
      } else if (i.customId === 'ultimate') {
        let dmg = Math.max(20, Math.floor(attacker.atk * 2.2));
        defender.hp -= dmg;
        actionLog = `**${attacker.name}** unleashed ULTIMATE BURST for **${dmg} UNBLOCKABLE DMG**!`;
      } else if (i.customId === 'guard') {
        attacker.guarding = true;
        actionLog = `**${attacker.name}** is guarding!`;
      }

      // Victory Condition
      if (defender.hp <= 0) {
        collector.stop();

        let winnerDoc = await Fighter.findOne({ userId: attacker.id });
        let loserDoc = await Fighter.findOne({ userId: defender.id });

        const coinsEarned = BASE_REWARD + (loserDoc.level * 15);

        winnerDoc.wins += 1;
        winnerDoc.xp += 35;
        winnerDoc.balance += coinsEarned;

        let neededXp = winnerDoc.level * 50;
        let leveledUp = false;
        if (winnerDoc.xp >= neededXp) {
          winnerDoc.level += 1;
          winnerDoc.statPoints += 2;
          winnerDoc.xp -= neededXp;
          leveledUp = true;
        }

        await winnerDoc.save();
        await Fighter.updateOne({ userId: defender.id }, { $inc: { losses: 1 } });

        const winEmbed = new EmbedBuilder()
          .setTitle('🏆 Battle Over!')
          .setThumbnail(attacker.img)
          .setDescription(
            `**${attacker.name}** defeated **${defender.name}**!\n\n` +
            `${actionLog}\n\n` +
            `💰 **Prize:** +${coinsEarned} coins (Balance: ${winnerDoc.balance})\n` +
            `🌟 **XP:** +35 XP` +
            `${leveledUp ? `\n🎉 **LEVEL UP!** Now Level **${winnerDoc.level}** (+2 Stat Points!).` : ''}`
          )
          .setColor('#2ECC71');

        return i.update({ embeds: [winEmbed], components: [] });
      }

      // Switch turn
      state.turn = defender.id;
      let nextPlayer = state.turn === state.p1.id ? state.p1 : state.p2;

      const updateEmbed = new EmbedBuilder()
        .setTitle('⚔️ Battle in progress')
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
        msg.edit({ content: '⏱️ The match timed out due to inactivity.', components: [] }).catch(() => {});
      }
    });
  }
};
