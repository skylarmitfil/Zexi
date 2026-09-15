const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Fighter = require('../models/Fighter');
const { getClassMoves, purchasableMoves, describeMove } = require('../utils/moves');

const PAGE_SIZE = 6;

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

    let page = 0;

    function render() {
      const options = purchasableMoves(fighter);
      const pageCount = Math.max(1, Math.ceil(options.length / PAGE_SIZE));
      if (page >= pageCount) page = pageCount - 1;
      if (page < 0) page = 0;
      const slice = options.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

      const embed = new EmbedBuilder()
        .setTitle(`📚 Move Shop — ${fighter.name} (${fighter.fightingStyle})`)
        .setDescription(`💰 Balance: **${fighter.balance}** gold · 🎚️ Level **${fighter.level}**\nBuy new attacks below. Locked moves need a higher level.`)
        .setColor('#1ABC9C')
        .setFooter({ text: `Page ${page + 1}/${pageCount} · ${options.length} move(s) available` });

      if (!options.length) {
        embed.addFields({ name: 'All bought!', value: 'You already own every purchasable move for this class. 🎉' });
        return { embeds: [embed], components: [] };
      }

      slice.forEach(m => {
        const canLevel = fighter.level >= m.unlock.level;
        const canGold = fighter.balance >= m.unlock.cost;
        const lock = !canLevel ? `🔒 Requires Lvl ${m.unlock.level}` : !canGold ? `💰 Need ${m.unlock.cost}g` : '✅ Available';
        embed.addFields({ name: `${m.name} — ${m.unlock.cost}g (Lvl ${m.unlock.level})`, value: `${describeMove(m)}\n${lock}`, inline: false });
      });

      const menu = new StringSelectMenuBuilder()
        .setCustomId('buy_move')
        .setPlaceholder('Select a move on this page to buy...')
        .addOptions(slice.map(m => ({
          label: `${m.name} (${m.unlock.cost}g, Lvl ${m.unlock.level})`.slice(0, 100),
          value: m.id,
          description: describeMove(m).slice(0, 100)
        })));

      const components = [new ActionRowBuilder().addComponents(menu)];
      if (pageCount > 1) {
        components.push(new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('shop_prev').setLabel('Prev').setEmoji('◀️').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
          new ButtonBuilder().setCustomId('shop_page').setLabel(`Page ${page + 1}/${pageCount}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
          new ButtonBuilder().setCustomId('shop_next').setLabel('Next').setEmoji('▶️').setStyle(ButtonStyle.Secondary).setDisabled(page >= pageCount - 1)
        ));
      }
      return { embeds: [embed], components };
    }

    const shopMsg = await message.channel.send(render());
    if (!purchasableMoves(fighter).length) return;

    const collector = shopMsg.createMessageComponentCollector({ time: 120000 });

    collector.on('collect', async (i) => {
      if (i.user.id !== message.author.id) return i.reply({ content: 'This shop is not yours.', ephemeral: true });

      if (i.isButton && i.isButton()) {
        if (i.customId === 'shop_prev') page--;
        else if (i.customId === 'shop_next') page++;
        return i.update(render());
      }

      // Purchase
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
