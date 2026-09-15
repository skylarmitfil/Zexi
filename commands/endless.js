const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ComponentType } = require('discord.js');
const Fighter = require('../models/Fighter');
const Inventory = require('../models/Inventory');
const combat = require('../utils/combat');
const { getClassMoves } = require('../utils/moves');
const { BASE_STYLES } = require('../utils/classData');

const POTION_HEAL = 30;
const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const WEAPON_LOOT = ['Iron Sword', 'Flame Blade', 'Dragon Fang', 'Shadow Dagger'];
const ARMOR_LOOT = ['Steel Armor', 'Dragonscale Mail', 'Aegis Plate'];
const NORMAL_NAMES = ['Goblin Horde', 'Orc Raider', 'Dire Wolf', 'Skeleton Squad', 'Bandit Pack', 'Venom Spider', 'Cursed Golem'];
const BOSS_NAMES = ['🐲 Wave Wyrm', '💀 Bone Overlord', '👹 Demon Warlord', '🦅 Storm Titan', '🕷️ Broodmother'];

function resolveLoadout(doc) {
  const pool = getClassMoves(doc.fightingStyle);
  let moves = (doc.loadout || []).map(id => pool.find(m => m.id === id)).filter(Boolean);
  if (!moves.length) moves = [pool[0]];
  return moves;
}

function spawnEnemy(party, wave) {
  const isBoss = wave % 5 === 0;
  const scale = 1 + (wave - 1) * 0.15;
  const hp = Math.round((90 * party.length + wave * 25) * scale * (isBoss ? 1.6 : 1));
  const atk = Math.round((18 + wave * 2) * (isBoss ? 1.2 : 1));
  const def = 4 + Math.floor(wave / 3);
  const ecKeys = Object.keys(BASE_STYLES);
  const ec = BASE_STYLES[ecKeys[rnd(0, ecKeys.length - 1)]];
  const name = (isBoss ? BOSS_NAMES : NORMAL_NAMES)[rnd(0, (isBoss ? BOSS_NAMES : NORMAL_NAMES).length - 1)];
  const e = combat.createCombatant({ userId: 'ENEMY', name, fightingStyle: ec.name, hp, maxHp: hp, attack: atk, defense: def });
  e.classKey = 'boss';
  e.isBoss = isBoss;
  return e;
}

module.exports = {
  name: 'endless',
  aliases: ['waves', 'survival', 'endlessmode'],
  description: 'Co-op endless wave survival (up to 4 players). Win to bank rewards — wipe/quit loses loot & half your XP.',
  async execute(message) {
    const hostFighter = await Fighter.findOne({ userId: message.author.id });
    if (!hostFighter) return message.channel.send('⚠️ You need a character first! Type `,create`.');

    const party = new Map();
    async function addMember(userId, doc) {
      const inv = await Inventory.findOne({ userId });
      party.set(userId, combat.createCombatant(doc, { moves: resolveLoadout(doc), potions: inv ? inv.potions : 0, runXp: 0, runLoot: [] }));
    }
    await addMember(message.author.id, hostFighter);

    // ---- Lobby ----
    const lobbyEmbed = () => new EmbedBuilder()
      .setTitle('♾️ Endless Mode Lobby')
      .setDescription(`Survive endless waves that grow tougher each round!\n**Host:** <@${message.author.id}>\n\n**Party (${party.size}/4):**\n${Array.from(party.values()).map(p => `• **${p.name}** (${p.style}) — ${p.maxHp} HP`).join('\n')}\n\nℹ️ Bank rewards anytime after clearing a wave. If the party **wipes**, you still keep everything earned — but pressing **End Run** forfeits (loot lost, XP halved).`)
      .setColor('#8E44AD')
      .setFooter({ text: 'Click Join, then the host clicks Start.' });
    const lobbyRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('join').setLabel('Join').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('start').setLabel('Start').setStyle(ButtonStyle.Danger)
    );
    const mainMsg = await message.channel.send({ embeds: [lobbyEmbed()], components: [lobbyRow] });
    const lobby = mainMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

    let started = false;
    lobby.on('collect', async (i) => {
      if (i.customId === 'join') {
        if (party.has(i.user.id)) return i.reply({ content: 'You are already in the party!', ephemeral: true });
        if (party.size >= 4) return i.reply({ content: 'Party is full (4 max)!', ephemeral: true });
        const doc = await Fighter.findOne({ userId: i.user.id });
        if (!doc) return i.reply({ content: 'You need a character! Type `,create`.', ephemeral: true });
        await addMember(i.user.id, doc);
        await i.update({ embeds: [lobbyEmbed()], components: [lobbyRow] });
      } else if (i.customId === 'start') {
        if (i.user.id !== message.author.id) return i.reply({ content: 'Only the host can start!', ephemeral: true });
        started = true;
        lobby.stop('started');
        await i.deferUpdate();
        startRun(message, mainMsg, Array.from(party.values()));
      }
    });
    lobby.on('end', (c, reason) => { if (!started && reason === 'time') mainMsg.edit({ content: '⏱️ Endless lobby timed out.', components: [] }).catch(() => {}); });
  }
};

async function startRun(message, mainMsg, party) {
  const hostId = message.author.id;
  let wave = 1;
  let wavesCleared = 0;

  function healBetweenWaves() {
    for (const p of party) {
      if (p.isAlive) { combat.healRaw(p, p.maxHp * 0.3); p.statuses = []; p.guarding = false; }
    }
  }

  async function settle(penalized) {
    const lines = [];
    for (const p of party) {
      const f = await Fighter.findById(p._id);
      if (!f) continue;
      const xpGain = penalized ? Math.floor(p.runXp / 2) : p.runXp;
      const leveled = combat.applyXpAndLevel(f, xpGain);
      if (wavesCleared > (f.bestWave || 0)) f.bestWave = wavesCleared;
      let lootTxt = '';
      if (!penalized && p.runLoot.length) {
        let inv = await Inventory.findOne({ userId: p.userId });
        if (!inv) inv = await Inventory.create({ userId: p.userId });
        for (const item of p.runLoot) {
          if (WEAPON_LOOT.includes(item) && !inv.weaponsOwned.includes(item)) { inv.weaponsOwned.push(item); lootTxt += ` ⚔️${item}`; }
          else if (ARMOR_LOOT.includes(item) && !inv.armorOwned.includes(item)) { inv.armorOwned.push(item); lootTxt += ` 🛡️${item}`; }
        }
        await inv.save();
      }
      await f.save();
      const lootNote = penalized
        ? (p.runLoot.length ? ' · 💥 loot forfeited' : '')
        : (lootTxt || (p.runLoot.length ? ' (loot already owned)' : ''));
      lines.push(`• <@${p.userId}> **${f.name}**: ${penalized ? `+${xpGain} XP (½ — forfeited!)` : `+${xpGain} XP`}${lootNote}${leveled ? ` ⬆️Lvl ${f.level}` : ''}`);
    }
    return lines.join('\n');
  }

  async function finish(reason) {
    const penalized = reason === 'forfeit';
    const rewardLines = await settle(penalized);
    let title, note, color;
    if (reason === 'bank') { title = '🏁 Run Banked!'; note = '✅ Rewards secured!'; color = '#2ECC71'; }
    else if (reason === 'forfeit') { title = '🏳️ Run Forfeited'; note = '💥 You used End Run — loot lost and XP halved.'; color = '#E67E22'; }
    else { title = '💀 Party Wiped'; note = 'Your party fell — but you keep all the XP and loot you earned!'; color = '#E74C3C'; }
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(`**Waves cleared: ${wavesCleared}**\n\n${rewardLines || '_No rewards._'}\n\n${note}`)
      .setColor(color);
    await mainMsg.edit({ content: '', embeds: [embed], components: [] }).catch(() => {});
  }

  // Play a single wave; resolves 'clear' | 'wipe' | 'timeout'.
  function playWave(enemy) {
    return new Promise((resolve) => {
      let turnIndex = party.findIndex(p => p.isAlive);
      if (turnIndex < 0) return resolve('wipe');
      let log = `**Wave ${wave}${enemy.isBoss ? ' — BOSS' : ''}!** A **${enemy.name}** (${enemy.style}) attacks the party!`;
      let done = false;

      const getActive = () => party[turnIndex];

      function render() {
        const active = getActive();
        const cls = combat.getClass(active.style);
        const partyStatus = party.map(p => {
          const s = combat.statusSummary(p);
          return `${p.isAlive ? '🟢' : '💀'} **${p.name}** ${combat.renderHealthBar(p.hp, p.maxHp, 7)} · ${combat.renderEnergyBar(p.energy, 100, 4)}${s ? ` ${s}` : ''}`;
        }).join('\n');
        const embed = new EmbedBuilder()
          .setTitle(`♾️ Endless — Wave ${wave}${enemy.isBoss ? ' 🔥[BOSS]' : ''}`)
          .setDescription(`${log}\n\n👉 Turn: **<@${active.userId}>** (**${active.name}**)`)
          .addFields(
            { name: `👹 ${enemy.name}`, value: combat.renderHealthBar(enemy.hp, enemy.maxHp, 14) + (combat.statusSummary(enemy) ? `\n${combat.statusSummary(enemy)}` : ''), inline: false },
            { name: '🛡️ Party', value: partyStatus, inline: false }
          )
          .setColor('#8E44AD')
          .setFooter({ text: `Cleared: ${wavesCleared} waves · Special: ${cls.special.name} (${cls.special.cost}⚡)` });

        const btns = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('e_attack').setLabel('Strike').setEmoji('⚔️').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('e_special').setLabel('Special').setEmoji('🌟').setStyle(ButtonStyle.Primary).setDisabled(active.energy < cls.special.cost),
          new ButtonBuilder().setCustomId('e_heal').setLabel('Heal Party').setEmoji('✨').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('e_potion').setLabel(`Potion (${active.potions})`).setEmoji('🧪').setStyle(ButtonStyle.Success).setDisabled(active.potions <= 0),
          new ButtonBuilder().setCustomId('e_guard').setLabel('Guard').setEmoji('🛡️').setStyle(ButtonStyle.Secondary)
        );
        const rows = [btns];
        const moves = (active.moves || []).filter(m => m.kind !== 'signature');
        if (moves.length) {
          rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
            .setCustomId('e_move').setPlaceholder(`${active.name}'s Moves`)
            .addOptions(moves.slice(0, 25).map(m => ({ label: `${m.name}${m.energyCost ? ` (${m.energyCost}⚡)` : ''}`.slice(0, 100), value: m.id, description: (m.power ? m.power.toFixed(2) + 'x ATK' : 'utility').slice(0, 100) })))));
        }
        rows.push(new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('e_end').setLabel('End Run (Host)').setEmoji('🏳️').setStyle(ButtonStyle.Secondary)
        ));
        return { content: '', embeds: [embed], components: rows };
      }

      function enemyTurn(lines) {
        const tk = combat.tickStatuses(enemy);
        lines.push(...tk.logs);
        if (enemy.hp <= 0 || tk.stunned) return;
        const living = party.filter(p => p.isAlive);
        if (!living.length) return;
        const aoe = Math.random() < (0.2 + Math.min(0.35, wave * 0.03));
        const targets = aoe ? living : [living[rnd(0, living.length - 1)]];
        const mult = aoe ? 0.6 : 1.0;
        const hits = [];
        for (const t of targets) {
          const res = combat.applyDamage(t, enemy.attack * mult - t.defense * 0.5);
          if (res.evaded || res.blocked) { hits.push(res.notes.join(' ')); continue; }
          hits.push(`**${t.name}** −${res.damage}${!t.isAlive ? ' 💀' : ''}`);
        }
        lines.push(`🔥 **${enemy.name}** ${aoe ? 'hits everyone' : 'strikes'}! ${hits.join(', ')}`);
      }

      mainMsg.edit(render());
      const col = mainMsg.createMessageComponentCollector({ time: 300000 });

      col.on('collect', async (i) => {
        if (i.customId === 'e_end') {
          if (i.user.id !== hostId) return i.reply({ content: 'Only the host can end the run.', ephemeral: true });
          done = true; col.stop('end'); await i.deferUpdate().catch(() => {}); return resolve('forfeit');
        }
        const active = getActive();
        if (i.user.id !== active.userId) return i.reply({ content: `It's <@${active.userId}>'s turn.`, ephemeral: true });

        let move = null;
        if (i.isStringSelectMenu && i.isStringSelectMenu() && i.customId === 'e_move') {
          move = (active.moves || []).find(m => m.id === i.values[0]);
          if (move && (move.energyCost || 0) > active.energy) return i.reply({ content: `⚡ Not enough energy for **${move.name}**.`, ephemeral: true });
        }
        if (i.customId === 'e_potion' && active.potions <= 0) return i.reply({ content: '⚠️ No potions! Buy with `,shop`.', ephemeral: true });

        const lines = [];
        const tk = combat.tickStatuses(active);
        lines.push(...tk.logs);
        if (!active.isAlive) { /* fell to DoT */ }
        else if (!tk.stunned) {
          if (i.customId === 'e_attack') lines.push(...combat.performAttack(active, enemy).logs);
          else if (i.customId === 'e_special') { const r = combat.performSpecial(active, enemy); if (r.failed) return i.reply({ content: r.logs.join('\n'), ephemeral: true }); lines.push(...r.logs); }
          else if (move) { const r = combat.performMove(active, enemy, move); if (r.failed) return i.reply({ content: r.logs.join('\n'), ephemeral: true }); lines.push(...r.logs); }
          else if (i.customId === 'e_heal') { party.forEach(p => { if (p.isAlive) combat.healRaw(p, 25); }); active.energy = Math.min(100, active.energy + 15); lines.push(`✨ **${active.name}** healed the party for 25 HP!`); }
          else if (i.customId === 'e_potion') { active.potions -= 1; await Inventory.updateOne({ userId: active.userId }, { $inc: { potions: -1 } }); const h = combat.healRaw(active, POTION_HEAL); combat.gainEnergy(active, 10); lines.push(`🧪 **${active.name}** drank a potion (+${h} HP, ${active.potions} left).`); }
          else if (i.customId === 'e_guard') lines.push(...combat.performGuard(active).logs);
        }

        if (enemy.hp <= 0) { done = true; log = lines.join('\n'); col.stop('cleared'); return resolve('clear'); }

        // Advance to the next living member; the enemy acts once the round wraps around.
        if (party.some(p => p.isAlive)) {
          const oldIndex = turnIndex;
          do { turnIndex = (turnIndex + 1) % party.length; } while (!party[turnIndex].isAlive);
          if (turnIndex <= oldIndex) enemyTurn(lines);
        }

        if (enemy.hp <= 0) { done = true; log = lines.join('\n'); col.stop('cleared'); return resolve('clear'); }
        if (!party.some(p => p.isAlive)) { done = true; log = lines.join('\n'); col.stop('wipe'); return resolve('wipe'); }
        if (!party[turnIndex].isAlive) { const nx = party.findIndex(p => p.isAlive); if (nx >= 0) turnIndex = nx; }

        log = lines.join('\n') || '...';
        await i.update(render());
      });

      col.on('end', (c, reason) => { if (!done && reason !== 'cleared' && reason !== 'wipe') resolve('timeout'); });
    });
  }

  // ---- Wave loop ----
  while (true) {
    const enemy = spawnEnemy(party, wave);
    const outcome = await playWave(enemy);

    if (outcome === 'timeout') { return finish('timeout'); }
    if (outcome === 'wipe') { return finish('wipe'); }
    if (outcome === 'forfeit') { return finish('forfeit'); }

    // Wave cleared → accumulate pending rewards (XP + loot in-memory; gold banked immediately)
    wavesCleared = wave;
    const xpThisWave = Math.min(30, 6 + wave * 2);
    const goldThisWave = rnd(15 + wave * 3, 30 + wave * 4);
    for (const p of party) {
      p.runXp += xpThisWave;
      await Fighter.updateOne({ _id: p._id }, { $inc: { balance: goldThisWave } });
      if (enemy.isBoss && p.isAlive) {
        if (Math.random() < 0.5) p.runLoot.push(WEAPON_LOOT[rnd(0, WEAPON_LOOT.length - 1)]);
        if (Math.random() < 0.3) p.runLoot.push(ARMOR_LOOT[rnd(0, ARMOR_LOOT.length - 1)]);
      }
    }

    // Victory-between-waves prompt (host controls)
    const pendXp = party.map(p => `<@${p.userId}>: ${p.runXp} XP`).join(' · ');
    const contEmbed = new EmbedBuilder()
      .setTitle(`✅ Wave ${wave} Cleared!`)
      .setDescription(`The party defeated **${enemy.name}**! (+${goldThisWave} gold each)\n\n**Pending XP** — ${pendXp}\n\n✅ **Stop & Bank** to keep everything. Push on and if you **wipe** you still keep your rewards — only pressing **End Run** mid-fight forfeits (loot lost, XP halved).`)
      .setColor('#2ECC71')
      .setFooter({ text: 'Host chooses. Survivors heal 30% before the next wave.' });
    const contRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('endless_next').setLabel(`Next Wave (${wave + 1})`).setEmoji('♾️').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('endless_stop').setLabel('Stop & Bank').setEmoji('🏦').setStyle(ButtonStyle.Success)
    );
    await mainMsg.edit({ content: `<@${hostId}>`, embeds: [contEmbed], components: [contRow] });

    const choice = await mainMsg.awaitMessageComponent({ filter: (x) => x.user.id === hostId && x.customId.startsWith('endless_'), time: 60000 }).catch(() => null);
    // Cleared the wave = a win state → banking (or idle timeout) keeps full rewards.
    if (!choice || choice.customId === 'endless_stop') { if (choice) await choice.deferUpdate().catch(() => {}); return finish('bank'); }

    await choice.deferUpdate().catch(() => {});
    healBetweenWaves();
    wave++;
  }
}
