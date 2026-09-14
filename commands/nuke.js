const { EmbedBuilder, PermissionsBitField, ChannelType } = require('discord.js');

const NUKE_IMAGE = 'https://images.unsplash.com/photo-1742272366350-f9d795d7e742?crop=entropy&cs=srgb&fm=jpg&q=85&w=800';

module.exports = {
  name: 'nuke',
  aliases: ['purgechannel', 'nukechannel'],
  description: 'Deletes and recreates the current channel, wiping all messages. Requires Administrator + Manage Messages.',
  async execute(message, args) {
    if (!message.guild) return message.reply('⚠️ This command can only be used inside a server.');
    if (!message.member) return message.reply('⚠️ Could not verify your permissions. Please try again.');

    // Requester must have BOTH Administrator and Manage Messages.
    const perms = message.member.permissions;
    if (!perms.has(PermissionsBitField.Flags.Administrator) || !perms.has(PermissionsBitField.Flags.ManageMessages)) {
      return message.reply('⛔ You need **both Administrator and Manage Messages** permissions to use `,nuke`.');
    }

    // Bot needs Manage Channels to delete + recreate.
    const me = message.guild.members.me;
    if (!me || !me.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
      return message.reply('⛔ I need the **Manage Channels** permission to nuke this channel.');
    }

    const channel = message.channel;
    if (channel.isThread && channel.isThread()) {
      return message.reply('⚠️ You cannot nuke a thread. Run this in a regular text channel.');
    }
    if (![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) {
      return message.reply('⚠️ `,nuke` only works on text channels.');
    }

    try {
      const position = channel.rawPosition;
      const nuker = message.author.tag;

      // Clone preserves name, topic, permission overwrites, slowmode, nsfw, category.
      const cloned = await channel.clone({ reason: `Nuked by ${nuker}` });
      await cloned.setPosition(position).catch(() => {});
      await channel.delete(`Nuked by ${nuker}`);

      const embed = new EmbedBuilder()
        .setTitle('☢️ Channel Nuked')
        .setDescription(`This channel was nuked by <@${message.author.id}>.\nAll previous messages have been wiped clean. 💥`)
        .setImage(NUKE_IMAGE)
        .setColor('#E74C3C')
        .setTimestamp();

      await cloned.send({ embeds: [embed] });
    } catch (err) {
      console.error('Nuke command error:', err);
      // The original channel may already be gone; try to notify the user directly.
      message.author.send('⚠️ Something went wrong while nuking the channel. Please check my role position and Manage Channels permission.').catch(() => {});
    }
  }
};
