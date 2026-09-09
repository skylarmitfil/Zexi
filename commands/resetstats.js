const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const Fighter = require('../models/Fighter');

const RESET_COST = 1000; // Price in coins to reset stats

// Base archetype stats reference
const BASE_STYLES = {
  Berserker: { hp: 110, attack: 22, defense: 3 },
  Guardian: { hp: 140, attack: 12, defense: 12 },
  Assassin: { hp: 85, attack: 26, defense: 2 },
  Monk: { hp: 120, attack: 16, defense: 8 },
  Mage: { hp: 95, attack: 24, defense: 4 },
  Paladin: { hp: 130, attack: 14, defense: 10 }
};

module.exports = {
  name: 'resetstats',
  aliases: ['respec', 'reset'],
  description: 'Reset your allocated stat points for coins and re-distribute them',
  async execute(message, args) {
    let fighter = await Fighter.findOne({ userId: message.author.id });
    if (!fighter) {
      return message.channel.send('⚠️ You do not have a character yet! Type `.create` first.');
    }

    if ((fighter.balance || 0) < RESET_COST) {
      return message.channel.send(`❌ You need **${RESET_COST} coins** to reset your stats. You currently have **${fighter.balance || 0} coins**.`);
    }

    const base = BASE_STYLES[fighter.fightingStyle] || BASE_STYLES.Berserker;

    // Calculate total points earned beyond base stats:
    // 5 initial creation points + 2 points per level gained (level 1 = 0 level points)
    const totalPointsAvailable = 5 + ((fighter.level - 1) * 2);

    let unspentPoints = totalPointsAvailable;
    let addedHp = 0;
    let addedAtk = 0;
    let addedDef = 0;

    function renderEmbed() {
      return new EmbedBuilder()
        .setTitle(`🔄 Stat Respec: ${fighter.name}`)
        .setDescription(
          `**Style:** ${fighter.fightingStyle}\n` +
          `**Cost:** ${RESET_COST} coins (Balance: ${fighter.balance - RESET_COST})\n\n` +
          `You have **${unspentPoints}** stat point(s) to distribute.`
        )
        .addFields(
          { name: '❤️ Health (HP)', value: `**${base.hp + addedHp}** (+${addedHp})`, inline: true },
          { name: '⚔️ Attack (ATK)', value: `**${base.attack + addedAtk}** (+${addedAtk})`, inline: true },
          { name: '🛡️ Defense (DEF)', value: `**${base.defense + addedDef}** (+${addedDef})`, inline: true }
        )
        .setColor('#F1C40F');
    }

    function renderButtons() {
      return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('add_hp').setLabel('+10 HP').setStyle(ButtonStyle.Primary).setDisabled(unspentPoints <= 0),
        new ButtonBuilder().setCustomId('add_atk').setLabel('+2 ATK').setStyle(ButtonStyle.Danger).setDisabled(unspentPoints <= 0),
        new ButtonBuilder().setCustomId('add_def').setLabel('+1 DEF').setStyle(ButtonStyle.Secondary).setDisabled(unspentPoints <= 0),
        new ButtonBuilder().setCustomId('confirm_respec').setLabel('Confirm Respec').setStyle(ButtonStyle.Success)
      );
    }

    const respecMsg = await message.channel.send({ embeds: [renderEmbed()], components: [renderButtons()] });

    const collector = respecMsg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 90000
    });

    collector.on('collect', async (i) => {
      if (i.user.id !== message.author.id) {
        return i.reply({ content: 'This respec menu is not for you!', ephemeral: true });
      }

      if (i.customId === 'add_hp' && unspentPoints > 0) {
        addedHp += 10;
        unspentPoints--;
      } else if (i.customId === 'add_atk' && unspentPoints > 0) {
        addedAtk += 2;
        unspentPoints--;
      } else if (i.customId === 'add_def' && unspentPoints > 0) {
        addedDef += 1;
        unspentPoints--;
      } else if (i.customId === 'confirm_respec') {
        collector.stop('confirmed');

        // Apply cost and updated stats to DB
        fighter.balance -= RESET_COST;
        fighter.hp = base.hp + addedHp;
        fighter.maxHp = base.hp + addedHp;
        fighter.attack = base.attack + addedAtk;
        fighter.defense = base.defense + addedDef;
        fighter.statPoints = unspentPoints;

        await fighter.save();

        const successEmbed = new EmbedBuilder()
          .setTitle('✅ Stats Respec Complete!')
          .setDescription(`Deducted **${RESET_COST} coins**. Your character's stats have been updated!`)
          .addFields(
            { name: '❤️ HP', value: `${fighter.hp}`, inline: true },
            { name: '⚔️ ATK', value: `${fighter.attack}`, inline: true },
            { name: '🛡️ DEF', value: `${fighter.defense}`, inline: true },
            { name: 'Unspent Points', value: `${fighter.statPoints}`, inline: true },
            { name: 'Remaining Coins', value: `${fighter.balance}`, inline: true }
          )
          .setColor('#2ECC71');

        return i.update({ embeds: [successEmbed], components: [] });
      }

      await i.update({ embeds: [renderEmbed()], components: [renderButtons()] });
    });

    collector.on('end', (collected, reason) => {
      if (reason === 'time') {
        respecMsg.edit({ content: '⏱️ Respec session timed out. No coins were spent.', embeds: [], components: [] }).catch(() => {});
      }
    });
  }
};
