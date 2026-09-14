const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const Fighter = require('../models/Fighter');
const { getClassMoves, purchasableMoves, describeMove } = require('../utils/moves');

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
  name: 'moveshop',
  aliases: ['attackshop', 'abilities', 'learn'],
  description: 'Buy new attacks for your character using gold (level requirements apply).',
  async execute(message) {
    const fighter = await pickFighter(message);
    if (!fighter) return;

    function render() {
      const options = purchasableMoves(fighter);
      const embed = new EmbedBuilder()
        .setTitle(`📚 Move Shop — ${fighter.name} (${fighter.fightingStyle})`)
        .setDescription(`💰 Balance: **${fighter.balance}** gold · 🎚️ Level **${fighter.level}**\nBuy new attacks below. Locked moves need a higher level.`)
        .setColor('#1ABC9C');

      if (!options.length) {
        embed.addFields({ name: 'All bought!', value: 'You already own every purchasable move for this class. 🎉' });
        return { embeds: [embed], components: [] };
      }

      options.slice(0, 10).forEach(m => {
        const canLevel = fighter.level >= m.unlock.level;
        const canGold = fighter.balance >= m.unlock.cost;
        const lock = !canLevel ? `🔒 Requires Lvl ${m.unlock.level}` : !canGold ? `💰 Need ${m.unlock.cost}g` : '✅ Available';
        embed.addFields({ name: `${m.name} — ${m.unlock.cost}g (Lvl ${m.unlock.level})`, value: `${describeMove(m)}\n${lock}`, inline: false });
      });

      const menu = new StringSelectMenuBuilder()
        .setCustomId('buy_move')
        .setPlaceholder('Select a move to purchase...')
        .addOptions(options.slice(0, 25).map(m => ({
          label: `${m.name} (${m.unlock.cost}g, Lvl ${m.unlock.level})`.slice(0, 100),
          value: m.id,
          description: describeMove(m).slice(0, 100)
        })));

      return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] };
    }

    const shopMsg = await message.channel.send(render());
    if (!purchasableMoves(fighter).length) return;

    const collector = shopMsg.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 90000 });

    collector.on('collect', async (i) => {
      if (i.user.id !== message.author.id) return i.reply({ content: 'This shop is not yours.', ephemeral: true });

      const move = getClassMoves(fighter.fightingStyle).find(m => m.id === i.values[0]);
      if (!move) return i.reply({ content: 'Move not found.', ephemeral: true });

      const fresh = await Fighter.findById(fighter._id);
      if ((fresh.unlockedMoves || []).includes(move.id)) return i.reply({ content: `You already own **${move.name}**!`, ephemeral: true });
      if (fresh.level < move.unlock.level) return i.reply({ content: `🔒 **${move.name}** needs Level **${move.unlock.level}** (you are ${fresh.level}).`, ephemeral: true });
      if (fresh.balance < move.unlock.cost) return i.reply({ content: `💰 You need **${move.unlock.cost}** gold (you have ${fresh.balance}).`, ephemeral: true });

      fresh.balance -= move.unlock.cost;
      fresh.unlockedMoves = [...(fresh.unlockedMoves || []), move.id];
      await fresh.save();
      Object.assign(fighter, fresh.toObject());

      await i.update({ ...render(), content: `✅ Learned **${move.name}**! Equip it with \`,moves\`.` });
    });

    collector.on('end', () => shopMsg.edit({ components: [] }).catch(() => {}));
  }
};
