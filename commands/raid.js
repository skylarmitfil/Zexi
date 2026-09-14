const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} = require('discord.js');
const Fighter = require('../models/Fighter');
const Inventory = require('../models/Inventory');
const {
  getClass,
  createCombatant,
  tickStatuses,
  performAttack,
  performSpecial,
  performGuard,
  healRaw,
  addStatus,
  applyDamage,
  renderHealthBar,
  renderEnergyBar,
  statusSummary,
  applyXpAndLevel
} = require('../utils/combat');

// Rotating boss roster — each has unique attacks and an enrage move.
const BOSSES = [
  {
    name: '🐉 Ancient Infernal Dragon', hp: 620, attack: 34, defense: 8, color: '#E67E22',
    attacks: [
      { name: 'Tail Swipe', aoe: false, mult: 1.0 },
      { name: 'Inferno Breath', aoe: true, mult: 0.7 },
      { name: 'Searing Bite', aoe: false, mult: 0.9, status: { type: 'bleed', duration: 3 } }
    ],
    enrage: { name: 'Cataclysm', aoe: true, mult: 1.1 }
  },
  {
    name: '💀 Lich King', hp: 560, attack: 32, defense: 6, color: '#8E44AD',
    attacks: [
      { name: 'Frost Bolt', aoe: false, mult: 1.0 },
      { name: 'Death Coil', aoe: false, mult: 1.1, status: { type: 'poison', duration: 3 } },
      { name: 'Necrotic Wave', aoe: true, mult: 0.65 }
    ],
    enrage: { name: 'Soul Rend', aoe: true, mult: 1.0, status: { type: 'poison', duration: 2 } }
  },
  {
    name: '🦂 Sandstorm Colossus', hp: 720, attack: 29, defense: 12, color: '#D4AC0D',
    attacks: [
      { name: 'Crushing Fist', aoe: false, mult: 1.1 },
      { name: 'Sand Blast', aoe: true, mult: 0.6, status: { type: 'stun', duration: 1 } },
      { name: 'Quake Stomp', aoe: true, mult: 0.7 }
    ],
    enrage: { name: 'Desert Fury', aoe: true, mult: 1.0 }
  },
  {
    name: '👹 Abyssal Warlord', hp: 600, attack: 36, defense: 7, color: '#C0392B',
    attacks: [
      { name: 'Void Slash', aoe: false, mult: 1.15 },
      { name: 'Hellfire', aoe: true, mult: 0.7, status: { type: 'bleed', duration: 2 } },
      { name: 'Dark Smite', aoe: false, mult: 1.0 }
    ],
    enrage: { name: 'Apocalypse', aoe: true, mult: 1.2 }
  }
];

// Loot pools for raid victory.
const WEAPON_LOOT = ['Iron Sword', 'Flame Blade', 'Dragon Fang', 'Shadow Dagger'];
const ARMOR_LOOT = ['Steel Armor', 'Dragonscale Mail', 'Aegis Plate'];

module.exports = {
  name: 'raid',
  aliases: ['boss', 'coop'],
  description: 'Team up with other players to fight a rotating raid boss!',
  async execute(message, args) {
    const leaderFighter = await Fighter.findOne({ userId: message.author.id });
    if (!leaderFighter) return message.channel.send('⚠️ You must create a character first! Type `,create` to start.');

    // Pick a random boss from the roster
    const template = BOSSES[Math.floor(Math.random() * BOSSES.length)];
    const boss = {
      ...template,
      classKey: 'boss',
      maxHp: template.hp,
      statuses: [],
      guarding: false,
      isAlive: true,
      enraged: false
    };

    const party = new Map();
    party.set(message.author.id, createCombatant(leaderFighter));

    function renderLobbyEmbed() {
      const partyList = Array.from(party.values())
        .map(p => `• **${p.name}** (${p.style}) — ${p.maxHp} HP / ${p.attack} ATK`)
        .join('\n');

      return new EmbedBuilder()
        .setTitle(`🏰 Co-Op Raid Lobby`)
        .setDescription(`**Boss:** ${boss.name}\n**Host:** <@${message.author.id}>\n\n**Party (${party.size}/4):**\n${partyList}`)
        .setColor(boss.color)
        .setFooter({ text: 'Click "Join Raid" to enter. Host clicks "Start Raid" when ready!' });
    }

    const lobbyRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('join_raid').setLabel('Join Raid').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('start_raid').setLabel('Start Raid').setStyle(ButtonStyle.Danger)
    );

    const lobbyMsg = await message.channel.send({ embeds: [renderLobbyEmbed()], components: [lobbyRow] });
    const lobbyCollector = lobbyMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

    lobbyCollector.on('collect', async (i) => {
      if (i.customId === 'join_raid') {
        if (party.has(i.user.id)) return i.reply({ content: 'You are already in the party!', ephemeral: true });
        if (party.size >= 4) return i.reply({ content: 'The raid party is full (Max 4 players)!', ephemeral: true });
        const memberDoc = await Fighter.findOne({ userId: i.user.id });
        if (!memberDoc) return i.reply({ content: 'You need a character to join! Type `,create` first.', ephemeral: true });
        party.set(i.user.id, createCombatant(memberDoc));
        await i.update({ embeds: [renderLobbyEmbed()], components: [lobbyRow] });
      }

      if (i.customId === 'start_raid') {
        if (i.user.id !== message.author.id) return i.reply({ content: 'Only the raid host can start the match!', ephemeral: true });
        lobbyCollector.stop('started');
        await i.deferUpdate();
        startCoopBattle(message, Array.from(party.values()), boss, lobbyMsg);
      }
    });

    lobbyCollector.on('end', (collected, reason) => {
      if (reason === 'time') lobbyMsg.edit({ content: '⏱️ Raid lobby timed out.', components: [] }).catch(() => {});
    });
  }
};

async function startCoopBattle(message, party, boss, mainMsg) {
  boss.maxHp = boss.maxHp * party.length;
  boss.hp = boss.maxHp;

  let turnIndex = 0;
  let combatLog = `⚔️ **The raid against ${boss.name} has begun!**`;

  const getActivePlayer = () => party[turnIndex];

  function renderBattleEmbed() {
    const partyStatus = party.map(p => {
      const s = statusSummary(p);
      return `${p.isAlive ? '🟢' : '💀'} **${p.name}** (${p.style})\n${renderHealthBar(p.hp, p.maxHp, 8)} · ${renderEnergyBar(p.energy, 100, 5)}${s ? ` · ${s}` : ''}`;
    }).join('\n');

    const active = getActivePlayer();
    const activeClass = getClass(active.style);
    const bossStatus = statusSummary(boss);

    return new EmbedBuilder()
      .setTitle(`${boss.name} ${boss.enraged ? '🔥 [ENRAGED]' : ''}`)
      .setDescription(`${combatLog}\n\n👉 Turn: **<@${active.userId}>** (**${active.name}**)`)
      .addFields(
        { name: `👹 Boss HP`, value: `${renderHealthBar(boss.hp, boss.maxHp, 14)}${bossStatus ? `\n${bossStatus}` : ''}`, inline: false },
        { name: '🛡️ Party', value: partyStatus, inline: false }
      )
      .setFooter({ text: `${active.name}'s Special: ${activeClass.special.name} (${activeClass.special.cost}⚡)` })
      .setColor(boss.color);
  }

  function buildRow() {
    const active = getActivePlayer();
    const activeClass = getClass(active.style);
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('raid_attack').setLabel('Strike Boss').setEmoji('⚔️').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('raid_special').setLabel('Special').setEmoji('🌟').setStyle(ButtonStyle.Primary).setDisabled(active.energy < activeClass.special.cost),
      new ButtonBuilder().setCustomId('raid_heal').setLabel('Heal Party').setEmoji('✨').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('raid_guard').setLabel('Guard').setEmoji('🛡️').setStyle(ButtonStyle.Secondary)
    );
  }

  await mainMsg.edit({ content: '', embeds: [renderBattleEmbed()], components: [buildRow()] });
  const battleCollector = mainMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 300000 });

  async function awardVictory(i) {
    battleCollector.stop('boss_defeated');
    const survivors = party.filter(p => p.isAlive);
    const lootLines = [];

    for (const p of party) {
      const doc = await Fighter.findOne({ userId: p.userId });
      if (!doc) continue;
      const coins = p.isAlive ? 250 : 100;
      doc.balance += coins;
      const leveled = applyXpAndLevel(doc, 100);
      await doc.save();

      let inv = await Inventory.findOne({ userId: p.userId });
      if (!inv) inv = await Inventory.create({ userId: p.userId });
      const potionsWon = 1 + Math.floor(Math.random() * 3);
      inv.potions += potionsWon;
      let extra = '';
      if (Math.random() < 0.4) {
        const w = WEAPON_LOOT[Math.floor(Math.random() * WEAPON_LOOT.length)];
        if (!inv.weaponsOwned.includes(w)) { inv.weaponsOwned.push(w); extra += ` +⚔️ ${w}`; }
      }
      if (Math.random() < 0.25) {
        const a = ARMOR_LOOT[Math.floor(Math.random() * ARMOR_LOOT.length)];
        if (!inv.armorOwned.includes(a)) { inv.armorOwned.push(a); extra += ` +🛡️ ${a}`; }
      }
      await inv.save();
      lootLines.push(`• **${p.name}**: +${coins} coins, +100 XP, +🧪${potionsWon}${extra}${leveled ? ` — ⬆️ Lvl ${doc.level}!` : ''}`);
    }

    const winEmbed = new EmbedBuilder()
      .setTitle('🏆 VICTORY! Raid Boss Defeated!')
      .setDescription(`The party slayed **${boss.name}**!\n\n🎁 **Loot:**\n${lootLines.join('\n')}${survivors.length < party.length ? '\n\n_Fallen members earned reduced coins._' : ''}`)
      .setColor('#2ECC71');
    return i.update({ content: '', embeds: [winEmbed], components: [] });
  }

  battleCollector.on('collect', async (i) => {
    const currentPlayer = getActivePlayer();
    if (i.user.id !== currentPlayer.userId) {
      return i.reply({ content: `It's not your turn! Waiting for <@${currentPlayer.userId}>.`, ephemeral: true });
    }

    let actionLines = [];

    // Start-of-turn effects for the acting player
    const tick = tickStatuses(currentPlayer);
    actionLines.push(...tick.logs);
    if (!currentPlayer.isAlive) {
      actionLines.push(`💀 **${currentPlayer.name}** has fallen!`);
    } else if (tick.stunned) {
      // loses turn
    } else {
      if (i.customId === 'raid_attack') {
        actionLines.push(...performAttack(currentPlayer, boss).logs);
      } else if (i.customId === 'raid_special') {
        const res = performSpecial(currentPlayer, boss);
        if (res.failed) return i.reply({ content: res.logs.join('\n'), ephemeral: true });
        actionLines.push(...res.logs);
      } else if (i.customId === 'raid_heal') {
        party.forEach(p => { if (p.isAlive) healRaw(p, 25); });
        currentPlayer.energy = Math.min(currentPlayer.maxEnergy, currentPlayer.energy + 15);
        actionLines.push(`✨ **${currentPlayer.name}** healed all living party members for **25 HP**!`);
      } else if (i.customId === 'raid_guard') {
        actionLines.push(...performGuard(currentPlayer).logs);
      }
    }

    if (boss.hp <= 0) { combatLog = actionLines.join('\n'); return awardVictory(i); }

    // Advance to next living player
    const anyAlive = party.some(p => p.isAlive);
    if (anyAlive) {
      do { turnIndex = (turnIndex + 1) % party.length; } while (!party[turnIndex].isAlive);
    }

    // Boss turn at end of a full round
    if (turnIndex === 0) {
      const bossTick = tickStatuses(boss);
      actionLines.push(...bossTick.logs);

      if (boss.hp <= 0) { combatLog = actionLines.join('\n'); return awardVictory(i); }

      // Enrage phase
      if (!boss.enraged && boss.hp < boss.maxHp * 0.3) {
        boss.enraged = true;
        boss.attack = Math.round(boss.attack * 1.4);
        actionLines.push(`🔥 **${boss.name}** is **ENRAGED**! Its attacks grow far deadlier!`);
      }

      if (!bossTick.stunned) {
        const living = party.filter(p => p.isAlive);
        if (living.length) {
          const move = boss.enraged && Math.random() < 0.5
            ? boss.enrage
            : boss.attacks[Math.floor(Math.random() * boss.attacks.length)];
          const targets = move.aoe ? living : [living[Math.floor(Math.random() * living.length)]];
          const hitLines = [];
          for (const t of targets) {
            const raw = boss.attack * move.mult - t.defense * 0.5;
            const res = applyDamage(t, raw);
            if (res.evaded || res.blocked) { hitLines.push(res.notes.join(' ')); continue; }
            if (move.status && t.isAlive) {
              const val = move.status.type === 'poison' ? Math.round(boss.attack * 0.25)
                : move.status.type === 'bleed' ? Math.round(boss.attack * 0.2) : 0;
              addStatus(t, move.status.type, move.status.duration, val);
            }
            hitLines.push(`**${t.name}** takes **${res.damage}**${!t.isAlive ? ' 💀 (fallen!)' : ''}`);
          }
          actionLines.push(`🔥 **${boss.name}** uses **${move.name}**! ${hitLines.join(', ')}`);
        }
      } else {
        actionLines.push(`💫 **${boss.name}** is stunned and cannot attack!`);
      }

      // Skip over any freshly-fallen player at index 0
      if (party.some(p => p.isAlive) && !party[turnIndex].isAlive) {
        do { turnIndex = (turnIndex + 1) % party.length; } while (!party[turnIndex].isAlive);
      }
    }

    if (!party.some(p => p.isAlive)) {
      battleCollector.stop('party_wiped');
      const loseEmbed = new EmbedBuilder()
        .setTitle('💀 DEFEAT! The Party Has Fallen!')
        .setDescription(`**${boss.name}** wiped out your team! Train up and try again.`)
        .setColor('#E74C3C');
      return i.update({ content: '', embeds: [loseEmbed], components: [] });
    }

    combatLog = actionLines.join('\n') || '...';
    await i.update({ content: '', embeds: [renderBattleEmbed()], components: [buildRow()] });
  });

  battleCollector.on('end', (collected, reason) => {
    if (reason === 'time') mainMsg.edit({ content: '⏱️ The raid timed out.', components: [] }).catch(() => {});
  });
}
