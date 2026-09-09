const { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ComponentType 
} = require('discord.js');
const Fighter = require('../models/Fighter');

const DEFAULT_AVATAR = 'https://cdn.discordapp.com/embed/avatars/0.png';

module.exports = {
  name: 'raid',
  aliases: ['boss', 'coop'],
  description: 'Team up with other players to fight a raid boss!',
  async execute(message, args) {
    const leaderFighter = await Fighter.findOne({ userId: message.author.id });
    if (!leaderFighter) {
      return message.channel.send('⚠️ You must create a character first! Type `.create` to start.');
    }

    // 1. Boss Configuration (Scales based on party size later)
    let boss = {
      name: '🐉 Ancient Infernal Dragon',
      hp: 600,
      maxHp: 600,
      attack: 35,
      defense: 8,
      img: 'https://i.imgur.com/8Q9Z5b3.png' // Replace with your valid boss image URL
    };

    // 2. Lobby Tracking
    const party = new Map();
    party.set(message.author.id, {
      id: message.author.id,
      name: leaderFighter.name,
      style: leaderFighter.fightingStyle,
      hp: leaderFighter.maxHp || 100,
      maxHp: leaderFighter.maxHp || 100,
      atk: leaderFighter.attack,
      def: leaderFighter.defense,
      isAlive: true
    });

    function renderLobbyEmbed() {
      const partyList = Array.from(party.values())
        .map(p => `• **${p.name}** (${p.style}) - HP: ${p.hp}/${p.maxHp}`)
        .join('\n');

      return new EmbedBuilder()
        .setTitle(`🏰 Co-Op Raid Lobby: ${boss.name}`)
        .setDescription(`**Host:** <@${message.author.id}>\n\n**Party Members (${party.size}/4):**\n${partyList}`)
        .setColor('#E67E22')
        .setFooter({ text: 'Click "Join Raid" to enter the party. Host clicks "Start Raid" when ready!' });
    }

    const lobbyRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('join_raid').setLabel('Join Raid').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('start_raid').setLabel('Start Raid').setStyle(ButtonStyle.Danger)
    );

    const lobbyMsg = await message.channel.send({ embeds: [renderLobbyEmbed()], components: [lobbyRow] });
    const lobbyCollector = lobbyMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

    lobbyCollector.on('collect', async (i) => {
      // JOIN LOBBY
      if (i.customId === 'join_raid') {
        if (party.has(i.user.id)) {
          return i.reply({ content: 'You are already in the party!', ephemeral: true });
        }
        if (party.size >= 4) {
          return i.reply({ content: 'The raid party is full (Max 4 players)!', ephemeral: true });
        }

        const memberDoc = await Fighter.findOne({ userId: i.user.id });
        if (!memberDoc) {
          return i.reply({ content: 'You need a character to join! Type `.create` first.', ephemeral: true });
        }

        party.set(i.user.id, {
          id: i.user.id,
          name: memberDoc.name,
          style: memberDoc.fightingStyle,
          hp: memberDoc.maxHp || 100,
          maxHp: memberDoc.maxHp || 100,
          atk: memberDoc.attack,
          def: memberDoc.defense,
          isAlive: true
        });

        await i.update({ embeds: [renderLobbyEmbed()], components: [lobbyRow] });
      }

      // START RAID
      if (i.customId === 'start_raid') {
        if (i.user.id !== message.author.id) {
          return i.reply({ content: 'Only the raid host can start the match!', ephemeral: true });
        }

        lobbyCollector.stop('started');
        await i.deferUpdate();
        startCoopBattle(message, Array.from(party.values()), boss, lobbyMsg);
      }
    });

    lobbyCollector.on('end', (collected, reason) => {
      if (reason === 'time') {
        lobbyMsg.edit({ content: '⏱️ Raid lobby timed out.', components: [] }).catch(() => {});
      }
    });
  }
};

// 3. Battle Loop Engine
async function startCoopBattle(message, party, boss, mainMsg) {
  // Scale Boss HP dynamically based on party size
  boss.maxHp = boss.maxHp * party.length;
  boss.hp = boss.maxHp;

  let turnIndex = 0;
  let combatLog = `⚔️ **The raid against ${boss.name} has begun!**`;

  function getActivePlayer() {
    return party[turnIndex];
  }

  function renderBattleEmbed() {
    const partyStatus = party
      .map(p => `${p.isAlive ? '🟢' : '💀'} **${p.name}**: ${Math.max(0, p.hp)}/${p.maxHp} HP`)
      .join('\n');

    return new EmbedBuilder()
      .setTitle(`🐉 Raid Arena: ${boss.name}`)
      .setDescription(`${combatLog}\n\n👉 Current Turn: **<@${getActivePlayer().id}>**`)
      .addFields(
        { name: `👹 ${boss.name}`, value: `HP: **${Math.max(0, boss.hp)}/${boss.maxHp}**`, inline: false },
        { name: '🛡️ Party Status', value: partyStatus, inline: false }
      )
      .setColor('#9B59B6');
  }

  const battleRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('raid_attack').setLabel('Strike Boss').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('raid_heal').setLabel('Heal Party (+20 HP)').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('raid_guard').setLabel('Guard').setStyle(ButtonStyle.Secondary)
  );

  await mainMsg.edit({ embeds: [renderBattleEmbed()], components: [battleRow] });

  const battleCollector = mainMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 300000 });

  battleCollector.on('collect', async (i) => {
    const currentPlayer = getActivePlayer();

    if (i.user.id !== currentPlayer.id) {
      return i.reply({ content: `It's not your turn! Waiting for <@${currentPlayer.id}>.`, ephemeral: true });
    }

    let actionText = '';

    // Player Actions
    if (i.customId === 'raid_attack') {
      let dmg = Math.max(10, currentPlayer.atk - boss.defense + Math.floor(Math.random() * 8));
      boss.hp -= dmg;
      actionText = `💥 **${currentPlayer.name}** dealt **${dmg} DMG** to **${boss.name}**!`;
    } 
    else if (i.customId === 'raid_heal') {
      party.forEach(p => {
        if (p.isAlive) p.hp = Math.min(p.maxHp, p.hp + 20);
      });
      actionText = `✨ **${currentPlayer.name}** healed all living party members for **20 HP**!`;
    } 
    else if (i.customId === 'raid_guard') {
      currentPlayer.guarding = true;
      actionText = `🛡️ **${currentPlayer.name}** is guarding against the next attack!`;
    }

    // Check Boss Defeat
    if (boss.hp <= 0) {
      battleCollector.stop('boss_defeated');
      
      // Reward all party members
      for (const p of party) {
        await Fighter.updateOne({ userId: p.id }, { $inc: { balance: 250, xp: 100 } });
      }

      const winEmbed = new EmbedBuilder()
        .setTitle('🏆 VICTORY! Raid Boss Defeated!')
        .setDescription(`The party successfully slayed **${boss.name}**!\n\n🎁 **Rewards:** +250 Coins & +100 XP awarded to all surviving party members!`)
        .setColor('#2ECC71');

      return i.update({ embeds: [winEmbed], components: [] });
    }

    // Advance Turn to Next Living Player
    do {
      turnIndex = (turnIndex + 1) % party.length;
    } while (!party[turnIndex].isAlive && party.some(p => p.isAlive));

    // Boss Retaliates when full round finishes
    if (turnIndex === 0) {
      const livingParty = party.filter(p => p.isAlive);
      if (livingParty.length > 0) {
        // Target random party member
        const target = livingParty[Math.floor(Math.random() * livingParty.length)];
        let bossDmg = Math.max(15, boss.attack - target.def);
        if (target.guarding) bossDmg = Math.floor(bossDmg / 2);
        
        target.hp -= bossDmg;
        target.guarding = false;

        actionText += `\n🔥 **${boss.name}** counter-attacked **${target.name}** for **${bossDmg} DMG**!`;

        if (target.hp <= 0) {
          target.isAlive = false;
          actionText += ` 💀 **${target.name} has fallen!**`;
        }
      }
    }

    // Check Party Wipeout
    if (!party.some(p => p.isAlive)) {
      battleCollector.stop('party_wiped');

      const loseEmbed = new EmbedBuilder()
        .setTitle('💀 DEFEAT! The Party Has Fallen!')
        .setDescription(`**${boss.name}** wiped out your team! Train up and try again.`)
        .setColor('#E74C3C');

      return i.update({ embeds: [loseEmbed], components: [] });
    }

    combatLog = actionText;
    await i.update({ embeds: [renderBattleEmbed()], components: [battleRow] });
  });
}
