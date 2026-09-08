const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const Fighter = require('../models/Fighter');

module.exports = {
  name: 'pvp',
  description: 'Level-based PvP with custom avatars and unlockable moves',
  async execute(message, args) {
    const opponent = message.mentions.users.first();
    if (!opponent || opponent.bot || opponent.id === message.author.id) {
      return message.channel.send('Mention a valid user to challenge!');
    }

    let f1 = await Fighter.findOne({ userId: message.author.id }) || await Fighter.create({ userId: message.author.id, name: message.author.username });
    let f2 = await Fighter.findOne({ userId: opponent.id }) || await Fighter.create({ userId: opponent.id, name: opponent.username });

    let state = {
      p1: { id: f1.userId, name: f1.name, hp: f1.maxHp, maxHp: f1.maxHp, atk: f1.attack, def: f1.defense, level: f1.level, img: f1.imageUrl, guarding: false },
      p2: { id: f2.userId, name: f2.name, hp: f2.maxHp, maxHp: f2.maxHp, atk: f2.attack, def: f2.defense, level: f2.level, img: f2.imageUrl, guarding: false },
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
      .setTitle('⚔️ Arena Match Started')
      .setDescription(`It is <@${state.turn}>'s turn!`)
      .setThumbnail(state.p1.img)
      .addFields(
        { name: `${state.p1.name} (Lvl ${state.p1.level})`, value: `HP: **${state.p1.hp}/${state.p1.maxHp}**`, inline: true },
        { name: `${state.p2.name} (Lvl ${state.p2.level})`, value: `HP: **${state.p2.hp}/${state.p2.maxHp}**`, inline: true }
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
          actionLog = `🔥 **${attacker.name}** landed a Heavy Slam for **${dmg} DMG**!`;
        } else {
          actionLog = `💨 **${attacker.name}** tried Heavy Slam and **MISSED**!`;
        }
      } else if (i.customId === 'ultimate') {
        let dmg = Math.max(20, Math.floor(attacker.atk * 2.2));
        defender.hp -= dmg;
        actionLog = `⚡ **${attacker.name}** unleashed ULTIMATE BURST for **${dmg} UNBLOCKABLE DMG**!`;
      } else if (i.customId === 'guard') {
        attacker.guarding = true;
        actionLog = `🛡️ **${attacker.name}** is guarding!`;
      }

      if (defender.hp <= 0) {
        collector.stop();

        // Level up & XP system
        let winnerDoc = await Fighter.findOne({ userId: attacker.id });
        winnerDoc.wins += 1;
        winnerDoc.xp += 35;

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
          .setTitle('🏆 Match Finished!')
          .setThumbnail(attacker.img)
          .setDescription(`**${attacker.name}** defeated **${defender.name}**!\n\n${actionLog}\n\n🎉 **${attacker.name}** earned **35 XP**!${leveledUp ? `\n🌟 **LEVEL UP!** Now Level **${winnerDoc.level}** (+2 Stat Points earned!).` : ''}`)
          .setColor('#2ECC71');

        return i.update({ embeds: [winEmbed], components: [] });
      }

      state.turn = defender.id;
      let nextPlayer = state.turn === state.p1.id ? state.p1 : state.p2;

      const updateEmbed = new EmbedBuilder()
        .setTitle('⚔️ Arena Match in Progress')
        .setDescription(`${actionLog}\n\nIt is <@${state.turn}>'s turn!`)
        .setThumbnail(nextPlayer.img)
        .addFields(
          { name: `${state.p1.name} (Lvl ${state.p1.level})`, value: `HP: **${Math.max(0, state.p1.hp)}/${state.p1.maxHp}**`, inline: true },
          { name: `${state.p2.name} (Lvl ${state.p2.level})`, value: `HP: **${Math.max(0, state.p2.hp)}/${state.p2.maxHp}**`, inline: true }
        )
        .setColor('#3498DB');

      await i.update({ embeds: [updateEmbed], components: [buildRow(nextPlayer)] });
    });
  }
};
