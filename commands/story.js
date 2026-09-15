const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const Fighter = require('../models/Fighter');
const Inventory = require('../models/Inventory');
const {
  getClass, createCombatant, tickStatuses, performAttack, performGuard, performSpecial, performMove,
  renderHealthBar, renderEnergyBar, statusSummary, applyXpAndLevel, healRaw, gainEnergy, MAX_LEVEL
} = require('../utils/combat');
const { getClassMoves } = require('../utils/moves');
const { BASE_STYLES } = require('../utils/classData');

const POTION_HEAL = 30;
const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// XP progress bar toward the next level (need = level * 50, capped at MAX_LEVEL).
function xpProgress(f) {
  if (f.level >= MAX_LEVEL) return `🏆 **MAX LEVEL (${MAX_LEVEL})**`;
  const need = f.level * 50;
  const cur = f.xp || 0;
  const filled = Math.round(Math.max(0, Math.min(1, cur / need)) * 10);
  return `\`[${'█'.repeat(filled)}${'░'.repeat(10 - filled)}]\` **${cur}/${need}** XP → Lvl ${f.level + 1} (${Math.max(0, need - cur)} to go)`;
}

const ENEMY_NAMES = {
  small: ['Goblin Scout', 'Bandit', 'Wild Wolf', 'Skeleton', 'Cave Rat', 'Feral Imp', 'Thief'],
  medium: ['Orc Warrior', 'Dark Knight', 'Venom Spider', 'Rogue Mage', 'Cursed Golem', 'Bandit Captain'],
  boss: ['🐲 Elder Wyrm', '💀 Bone Overlord', '👹 Demon Warlord', '🦅 Storm Titan', '🕷️ Broodmother']
};

const TIERS = {
  small: { label: 'Small Skirmish', hpMul: 0.85, atkMul: 0.85, defMul: 0.85, lvlAdd: 0, gold: [10, 20], xp: () => rnd(5, 10), color: '#95A5A6' },
  medium: { label: 'Medium Battle', hpMul: 1.0, atkMul: 0.95, defMul: 0.95, lvlAdd: 2, gold: [25, 40], xp: () => rnd(11, 20), color: '#E67E22' },
  boss: { label: 'Boss Fight', hpMul: 1.8, atkMul: 1.15, defMul: 1.1, lvlAdd: 4, gold: [60, 100], xp: () => 25, color: '#C0392B' }
};

function resolveLoadout(doc) {
  const pool = getClassMoves(doc.fightingStyle);
  let moves = (doc.loadout || []).map(id => pool.find(m => m.id === id)).filter(Boolean);
  if (!moves.length) moves = [pool[0]];
  return moves;
}

module.exports = {
  name: 'story',
  aliases: ['campaign', 'adventure', 'pve'],
  description: 'Fight AI enemies solo to earn XP and gold. Choose Small, Medium or Boss encounters.',
  async execute(message) {
    const fighters = await Fighter.find({ userId: message.author.id });
    if (!fighters.length) return message.reply('⚠️ You need a character first! Create one with `,create`.');

    let playerDoc = fighters[0];
    if (fighters.length > 1) {
      const row = new ActionRowBuilder().addComponents(
        fighters.map(f => new ButtonBuilder().setCustomId(`pick_${f.slot}`).setLabel(`Slot ${f.slot}: ${f.name}`).setStyle(ButtonStyle.Primary))
      );
      const pm = await message.channel.send({ content: 'Which character enters the story?', components: [row] });
      const c = await pm.awaitMessageComponent({ filter: i => i.user.id === message.author.id, time: 30000 }).catch(() => null);
      await pm.delete().catch(() => {});
      if (!c) return message.channel.send('⏱️ Selection timed out.');
      playerDoc = fighters.find(f => f.slot === parseInt(c.customId.split('_')[1]));
    }

    // Difficulty selection
    const diffEmbed = new EmbedBuilder()
      .setTitle('🗺️ Story Mode — Choose Your Encounter')
      .setDescription(`**${playerDoc.name}** (Lvl ${playerDoc.level}) sets out on an adventure.\nPick a battle — tougher fights give more XP.`)
      .addFields(
        { name: '🟢 Small Skirmish', value: 'Weaker foe · **5–10 XP**', inline: true },
        { name: '🟠 Medium Battle', value: 'Even match · **11–20 XP**', inline: true },
        { name: '🔴 Boss Fight', value: 'Powerful boss · **25 XP**', inline: true }
      )
      .setColor('#9B59B6');
    const diffRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('diff_small').setLabel('Small').setEmoji('🟢').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('diff_medium').setLabel('Medium').setEmoji('🟠').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('diff_boss').setLabel('Boss').setEmoji('🔴').setStyle(ButtonStyle.Danger)
    );
    const battleMsg = await message.channel.send({ embeds: [diffEmbed], components: [diffRow] });
    const diffChoice = await battleMsg.awaitMessageComponent({ filter: i => i.user.id === message.author.id && i.customId.startsWith('diff_'), time: 30000 }).catch(() => null);
    if (!diffChoice) return battleMsg.edit({ content: '⏱️ No encounter chosen.', embeds: [], components: [] }).catch(() => {});

    const tierKey = diffChoice.customId.replace('diff_', '');
    const tier = TIERS[tierKey];

    // Build player combatant
    const player = createCombatant(playerDoc);
    player.moves = resolveLoadout(playerDoc);
    const inv = await Inventory.findOne({ userId: message.author.id });
    player.potions = inv ? inv.potions : 0;

    // Build AI enemy scaled to the player
    const enemyKeys = Object.keys(BASE_STYLES);
    const enemyClass = BASE_STYLES[enemyKeys[rnd(0, enemyKeys.length - 1)]];
    const enemyName = ENEMY_NAMES[tierKey][rnd(0, ENEMY_NAMES[tierKey].length - 1)];
    const enemy = createCombatant({
      userId: 'ENEMY',
      name: enemyName,
      fightingStyle: enemyClass.name,
      level: playerDoc.level + tier.lvlAdd,
      hp: Math.max(40, Math.round(player.maxHp * tier.hpMul)),
      maxHp: Math.max(40, Math.round(player.maxHp * tier.hpMul)),
      attack: Math.max(8, Math.round(player.attack * tier.atkMul)),
      defense: Math.max(0, Math.round(player.defense * tier.defMul))
    });

    let turn = 1;
    let log = `A wild **${enemy.name}** (${enemy.style}) appears! Fight!`;

    function buildUI() {
      const sP = statusSummary(player);
      const sE = statusSummary(enemy);
      const embed = new EmbedBuilder()
        .setTitle(`⚔️ ${player.name} VS ${enemy.name}`)
        .setDescription(`**${tier.label}** · Turn ${turn}\n\n📜 ${log}`)
        .addFields(
          { name: `${player.name} (You)`, value: `${renderHealthBar(player.hp, player.maxHp)}\n${renderEnergyBar(player.energy)}\n${player.style}${sP ? ` · ${sP}` : ''}`, inline: true },
          { name: `${enemy.name}`, value: `${renderHealthBar(enemy.hp, enemy.maxHp)}\n${renderEnergyBar(enemy.energy)}\n${enemy.style}${sE ? ` · ${sE}` : ''}`, inline: true }
        )
        .setColor(tier.color)
        .setFooter({ text: playerDoc.level >= MAX_LEVEL ? `Max Level ${MAX_LEVEL}` : `XP ${playerDoc.xp}/${playerDoc.level * 50} → Lvl ${playerDoc.level + 1}` });

      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('s_attack').setLabel('Attack').setEmoji('⚔️').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('s_guard').setLabel('Block').setEmoji('🛡️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('s_potion').setLabel(`Potion (${player.potions})`).setEmoji('🧪').setStyle(ButtonStyle.Success).setDisabled(player.potions <= 0),
        new ButtonBuilder().setCustomId('s_flee').setLabel('Flee').setEmoji('🏳️').setStyle(ButtonStyle.Secondary)
      );
      const menu = new StringSelectMenuBuilder()
        .setCustomId('s_move')
        .setPlaceholder('Use a Move')
        .addOptions(player.moves.slice(0, 25).map(m => ({
          label: `${m.name}${m.energyCost ? ` (${m.energyCost}⚡)` : ''}`.slice(0, 100),
          value: m.id,
          description: (m.kind === 'signature' ? 'Signature ultimate' : `${m.power ? m.power.toFixed(2) + 'x ATK' : 'utility'}`).slice(0, 100)
        })));
      return { content: `<@${message.author.id}>`, embeds: [embed], components: [actionRow, new ActionRowBuilder().addComponents(menu)] };
    }

    function aiTurn(lines) {
      const tick = tickStatuses(enemy);
      lines.push(...tick.logs);
      if (turn > 25) { const a = turn - 25; enemy.hp = Math.max(0, enemy.hp - a); lines.push(`☄️ The battlefield collapses! **${enemy.name}** takes ${a} damage.`); }
      if (enemy.hp <= 0) return;
      if (tick.stunned) return;
      const cls = getClass(enemy.style);
      let r;
      if (enemy.energy >= cls.special.cost && Math.random() < 0.5) r = performSpecial(enemy, player);
      else if (Math.random() < 0.82) r = performAttack(enemy, player);
      else r = performGuard(enemy);
      if (r && r.failed) r = performAttack(enemy, player);
      lines.push(...(r ? r.logs : []));
    }

    async function win(interaction) {
      const fresh = await Fighter.findById(playerDoc._id);
      let rewardText = '';
      if (fresh) {
        const xp = tier.xp();
        const gold = rnd(tier.gold[0], tier.gold[1]);
        fresh.balance += gold;
        const atMax = fresh.level >= MAX_LEVEL;
        const leveled = applyXpAndLevel(fresh, xp);
        await fresh.save();
        rewardText = `🎁 **+${xp} XP** & **+${gold} gold**!`;
        if (leveled) rewardText += `\n⬆️ **${fresh.name}** reached **Level ${fresh.level}**! (+${leveled * 2} stat points)`;
        else if (atMax) rewardText += `\n🏆 **${fresh.name}** is at the max level (${MAX_LEVEL})!`;
        rewardText += `\n📊 ${xpProgress(fresh)}`;
        // keep the local doc in sync so the footer/UI reflects new XP
        playerDoc.level = fresh.level; playerDoc.xp = fresh.xp;
      }
      const e = new EmbedBuilder().setTitle('🏆 Victory!').setDescription(`You defeated **${enemy.name}**!\n\n📜 ${log}\n\n${rewardText}`).setColor('#2ECC71');
      return interaction.update({ content: '', embeds: [e], components: [] });
    }

    async function lose(interaction) {
      const e = new EmbedBuilder().setTitle('💀 Defeat').setDescription(`**${enemy.name}** bested you this time.\n\n📜 ${log}\nTrain up and try again with \`,story\`!`).setColor('#E74C3C');
      return interaction.update({ content: '', embeds: [e], components: [] });
    }

    await diffChoice.update(buildUI());
    let active = true;

    while (active) {
      const i = await battleMsg.awaitMessageComponent({ filter: (x) => x.user.id === message.author.id, time: 90000 }).catch(() => null);
      if (!i) return battleMsg.edit({ content: '', embeds: [new EmbedBuilder().setTitle('⏱️ Battle Timed Out').setColor('#95A5A6')], components: [] }).catch(() => {});

      if (i.isButton() && i.customId === 's_flee') {
        active = false;
        return i.update({ content: '', embeds: [new EmbedBuilder().setTitle('🏳️ You Fled').setDescription('You escaped the battle. No rewards earned.').setColor('#95A5A6')], components: [] });
      }

      // Pre-validate resource costs (no turn spent on invalid input)
      let move = null;
      if (i.isStringSelectMenu() && i.customId === 's_move') {
        move = player.moves.find(m => m.id === i.values[0]);
        const cost = move && move.kind === 'signature' ? getClass(player.style).special.cost : (move ? move.energyCost || 0 : 0);
        if (move && cost > player.energy) { await i.reply({ content: `⚡ Not enough energy for **${move.name}** (needs ${cost}, have ${player.energy}).`, ephemeral: true }); continue; }
      }
      if (i.isButton() && i.customId === 's_potion' && player.potions <= 0) { await i.reply({ content: '⚠️ No Health Potions! Buy some with `,shop`.', ephemeral: true }); continue; }

      const lines = [];
      const tick = tickStatuses(player);
      lines.push(...tick.logs);
      if (turn > 25) { const a = turn - 25; player.hp = Math.max(0, player.hp - a); lines.push(`☄️ The battlefield collapses! **${player.name}** takes ${a} damage.`); }
      if (player.hp <= 0) { active = false; log = lines.join('\n'); return lose(i); }

      if (!tick.stunned) {
        let r;
        if (i.isButton() && i.customId === 's_attack') r = performAttack(player, enemy);
        else if (i.isButton() && i.customId === 's_guard') r = performGuard(player);
        else if (i.isButton() && i.customId === 's_potion') {
          player.potions -= 1;
          await Inventory.updateOne({ userId: message.author.id }, { $inc: { potions: -1 } });
          const h = healRaw(player, POTION_HEAL); gainEnergy(player, 10);
          r = { logs: [`🧪 **${player.name}** drank a Potion and restored **${h}** HP! (${player.potions} left)`] };
        } else if (move) {
          r = performMove(player, enemy, move);
          if (r && r.failed) { await i.reply({ content: r.logs.join('\n'), ephemeral: true }); continue; }
        }
        lines.push(...(r ? r.logs : []));
      }

      if (enemy.hp <= 0) { active = false; log = lines.join('\n'); return win(i); }

      // Enemy responds
      aiTurn(lines);
      if (player.hp <= 0) { active = false; log = lines.join('\n'); return lose(i); }
      if (enemy.hp <= 0) { active = false; log = lines.join('\n'); return win(i); }

      turn++;
      log = lines.join('\n') || '...';
      await i.update(buildUI());
    }
  }
};
