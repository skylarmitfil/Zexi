const { EmbedBuilder } = require('discord.js');

const PREFIX = ',';

// Fighting / combat guide shown for `,help fight`.
const FIGHT_COMMANDS = [
  { name: 'pvp', usage: ',pvp @user', desc: 'Challenge another player to a turn-based duel.' },
  { name: 'story', usage: ',story', desc: 'Solo PvE — battle AI foes (Small/Medium/Boss) for XP & gold.' },
  { name: 'endless', usage: ',endless', desc: 'Co-op wave survival (up to 4). Wipe or bank keeps rewards; only End Run forfeits (loot lost, half XP).' },
  { name: 'raid', usage: ',raid', desc: 'Team up (party of 4) to fight a rotating raid boss for loot.' },
  { name: 'moves', usage: ',moves', desc: 'View unlocked attacks and equip your battle loadout (up to 5).' },
  { name: 'moveshop', usage: ',moveshop', desc: 'Buy new attacks with gold (level requirements apply).' },
  { name: 'customize', usage: ',customize', desc: 'View your fighter, spend stat points, passive & loadout.' },
  { name: 'leaderboard', usage: ',leaderboard [wins|streak|gold|wave]', desc: 'See the top fighters (wave = Endless rankings).' }
];

module.exports = {
  name: 'help',
  aliases: ['h', 'commands', 'guide'],
  description: 'Show help. Use `,help fight` for the combat guide, or `,help <command>`.',
  execute(message, args) {
    const topic = (args[0] || '').toLowerCase();

    // Combat guide
    if (['fight', 'fighting', 'combat', 'battle', 'battles'].includes(topic)) {
      const embed = new EmbedBuilder()
        .setTitle('⚔️ Fighting Guide')
        .setColor('#E74C3C')
        .setDescription('Everything you need to battle. All fights are turn-based — pick an action each turn.')
        .addFields(
          {
            name: '🎮 In-battle actions',
            value: [
              '**Attack** — basic hit; builds ⚡ energy.',
              '**Block** — halve the next hit (deals no damage).',
              '**Potion** 🧪 — heal 30 HP (uses a potion from `,shop`).',
              '**Moves menu** — use an equipped move; strong ones cost ⚡ energy.',
              '**Forfeit / Flee** — leave the battle.'
            ].join('\n'),
            inline: false
          },
          {
            name: '✨ Mechanics',
            value: [
              '⚡ **Energy** fills as you fight; spend it on Specials & moves.',
              '🩸 **Status effects**: bleed/poison damage over time, stun skips a turn, shields & buffs help you.',
              '🧬 **Class passives** are always active (see `,customize`).',
              '⬆️ **Level up** by winning fights (max level 100) to gain stat points & unlock moves.'
            ].join('\n'),
            inline: false
          },
          {
            name: '🗡️ Fighting commands',
            value: FIGHT_COMMANDS.map(c => `**\`${c.usage}\`** — ${c.desc}`).join('\n'),
            inline: false
          }
        )
        .setFooter({ text: 'Tip: set your loadout with ,moves before you fight. Use ,help <command> for details.' });
      return message.channel.send({ embeds: [embed] });
    }

    // Specific command help
    if (topic) {
      const all = require('../commandHandler').commands;
      const found = all.get(topic) || [...all.values()].find(c => c.aliases && c.aliases.includes(topic));
      if (found) {
        const embed = new EmbedBuilder()
          .setTitle(`📖 Help — ,${found.name}`)
          .setColor('#3498DB')
          .setDescription(found.description || 'No description available.')
          .addFields({ name: 'Aliases', value: found.aliases && found.aliases.length ? found.aliases.map(a => `\`${a}\``).join(', ') : 'None', inline: false });
        return message.channel.send({ embeds: [embed] });
      }
      return message.channel.send(`⚠️ No help found for \`${topic}\`. Try \`,help\` or \`,help fight\`.`);
    }

    // General overview
    const embed = new EmbedBuilder()
      .setTitle('📜 Zexi — Command Help')
      .setColor('#9B59B6')
      .setDescription(`Prefix: \`${PREFIX}\`\nUse **\`,help fight\`** for the full combat guide, or \`,help <command>\` for a specific command.`)
      .addFields(
        { name: '⚔️ Fighting', value: '`pvp` · `story` · `endless` · `raid` · `moves` · `moveshop`', inline: false },
        { name: '🧙 Character', value: '`create` · `customize` · `resetstats` · `leaderboard`', inline: false },
        { name: '💰 Economy', value: '`balance` · `shop` · `inventory`', inline: false },
        { name: '🛡️ Moderation', value: '`nuke`', inline: false },
        { name: '🔧 Misc', value: '`ping` · `help`', inline: false }
      )
      .setFooter({ text: 'New here? Start with ,create then try ,story to level up!' });
    return message.channel.send({ embeds: [embed] });
  }
};
