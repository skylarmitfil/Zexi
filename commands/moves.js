const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const Fighter = require('../models/Fighter');
const { getClassMoves, unlockedMoves, lockedMoves, describeMove, LOADOUT_SIZE } = require('../utils/moves');

async function pickFighter(message) {
  const fighters = await Fighter.find({ userId: message.author.id });
  if (!fighters.length) { await message.reply('⚠️ You have no characters! Create one with `,create`.'); return null; }
  if (fighters.length === 1) return fighters[0];
  const row = new ActionRowBuilder().addComponents(
    fighters.map(f => new ButtonBuilder().setCustomId(`pick_${f.slot}`).setLabel(`Slot ${f.slot}: ${f.name}`).setStyle(ButtonStyle.Primary))
  );
  const msg = await message.channel.send({ content: 'Which character?', components: [row] });
  const choice = await msg.awaitMessageComponent({ filter: i => i.user.id === message.author.id, time: 30000 }).catch(() => null);
  await msg.delete().catch(() => {});
  if (!choice) { await message.channel.send('⏱️ Selection timed out.'); return null; }
  return fighters.find(f => f.slot === parseInt(choice.customId.split('_')[1]));
}

module.exports = {
  name: 'moves',
  aliases: ['loadout', 'movelist', 'equip'],
  description: 'View your unlocked attacks and equip a battle loadout.',
  async execute(message) {
    const fighter = await pickFighter(message);
    if (!fighter) return;

    function render() {
      const unlocked = unlockedMoves(fighter);
      const locked = lockedMoves(fighter);
      const equipped = fighter.loadout || [];

      const embed = new EmbedBuilder()
        .setTitle(`🎯 Move Loadout — ${fighter.name} (${fighter.fightingStyle})`)
        .setColor('#3498DB')
        .setDescription(`Equip up to **${LOADOUT_SIZE}** moves to use in battle (plus Attack, Block & Potion which are always available).\nSelect moves below to set your loadout.`)
        .addFields(
          { name: `⚔️ Equipped (${equipped.length}/${LOADOUT_SIZE})`, value: equipped.length ? equipped.map(id => { const m = getClassMoves(fighter.fightingStyle).find(x => x.id === id); return m ? `• **${m.name}** — ${describeMove(m)}` : null; }).filter(Boolean).join('\n') : '_Nothing equipped._', inline: false },
          { name: `🔓 Unlocked (${unlocked.length})`, value: unlocked.map(m => m.name).join(', ') || '_None_', inline: false }
        );
      if (locked.length) {
        const next = locked.filter(m => m.unlock.method === 'level').sort((a, b) => a.unlock.level - b.unlock.level).slice(0, 5);
        if (next.length) embed.addFields({ name: '🔒 Next Level Unlocks', value: next.map(m => `Lvl ${m.unlock.level}: ${m.name}`).join('\n'), inline: false });
        embed.addFields({ name: '🛒 Shop', value: 'Buy more attacks with `,moveshop`.', inline: false });
      }

      const options = unlocked.slice(0, 25).map(m => ({
        label: m.name.slice(0, 100),
        value: m.id,
        description: describeMove(m).slice(0, 100),
        default: equipped.includes(m.id)
      }));

      const menu = new StringSelectMenuBuilder()
        .setCustomId('set_loadout')
        .setPlaceholder('Choose your equipped moves...')
        .setMinValues(0)
        .setMaxValues(Math.min(LOADOUT_SIZE, options.length || 1))
        .addOptions(options.length ? options : [{ label: 'No moves unlocked yet', value: 'none' }]);

      return { embeds: [embed], components: options.length ? [new ActionRowBuilder().addComponents(menu)] : [] };
    }

    const msg = await message.channel.send(render());
    if (!unlockedMoves(fighter).length) return;

    const collector = msg.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 90000 });
    collector.on('collect', async (i) => {
      if (i.user.id !== message.author.id) return i.reply({ content: 'This loadout is not yours.', ephemeral: true });
      if (i.values.includes('none')) return i.deferUpdate();

      const fresh = await Fighter.findById(fighter._id);
      const validIds = unlockedMoves(fresh).map(m => m.id);
      const chosen = i.values.filter(v => validIds.includes(v)).slice(0, LOADOUT_SIZE);
      fresh.loadout = chosen;
      await fresh.save();
      Object.assign(fighter, fresh.toObject());
      await i.update({ ...render(), content: `✅ Loadout updated (${chosen.length} equipped).` });
    });
    collector.on('end', () => msg.edit({ components: [] }).catch(() => {}));
  }
};
