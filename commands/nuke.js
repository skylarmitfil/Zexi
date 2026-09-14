const { EmbedBuilder, PermissionsBitField, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// Stable animated explosion GIFs (verified image/gif on Giphy CDN).
const NUKE_GIFS = [
  'https://media.giphy.com/media/oe33xf3B50fsc/giphy.gif',
  'https://media.giphy.com/media/HhTXt43pk1I1W/giphy.gif',
  'https://media.giphy.com/media/SGRuGdc2FB5Go/giphy.gif',
  'https://media.giphy.com/media/XUFPGrX5Zis6Y/giphy.gif',
  'https://media.giphy.com/media/3o7btPCcdNniyf0ArS/giphy.gif',
  'https://media.giphy.com/media/26ufcVAp3AiJJsrIs/giphy.gif'
];
const randomGif = () => NUKE_GIFS[Math.floor(Math.random() * NUKE_GIFS.length)];

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

    // Confirmation step to prevent accidental wipes.
    const confirmEmbed = new EmbedBuilder()
      .setTitle('☢️ Confirm Channel Nuke')
      .setDescription(`This will **delete and recreate** <#${channel.id}>, permanently wiping **all messages**.\n\nAre you sure, <@${message.author.id}>?`)
      .setColor('#F1C40F');

    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('nuke_confirm').setLabel('Nuke it').setEmoji('💥').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('nuke_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
    );

    const prompt = await message.channel.send({ embeds: [confirmEmbed], components: [confirmRow] });

    const choice = await prompt.awaitMessageComponent({
      filter: (i) => i.user.id === message.author.id && ['nuke_confirm', 'nuke_cancel'].includes(i.customId),
      time: 30000
    }).catch(() => null);

    if (!choice || choice.customId === 'nuke_cancel') {
      const cancelEmbed = new EmbedBuilder()
        .setTitle('✅ Nuke Cancelled')
        .setDescription(choice ? 'The channel was not nuked.' : '⏱️ Confirmation timed out — the channel was not nuked.')
        .setColor('#2ECC71');
      if (choice) return choice.update({ embeds: [cancelEmbed], components: [] }).catch(() => {});
      return prompt.edit({ embeds: [cancelEmbed], components: [] }).catch(() => {});
    }

    // Acknowledge the interaction before the channel (and this message) get deleted.
    await choice.deferUpdate().catch(() => {});

    try {
      const position = channel.rawPosition;
      const nuker = message.author.tag;

      const cloned = await channel.clone({ reason: `Nuked by ${nuker}` });
      await cloned.setPosition(position).catch(() => {});
      await channel.delete(`Nuked by ${nuker}`);

      const doneEmbed = new EmbedBuilder()
        .setTitle('☢️ Channel Nuked')
        .setDescription(`This channel was nuked by <@${message.author.id}>.\nAll previous messages have been wiped clean. 💥`)
        .setImage(randomGif())
        .setColor('#E74C3C')
        .setTimestamp();

      await cloned.send({ embeds: [doneEmbed] });
    } catch (err) {
      console.error('Nuke command error:', err);
      message.author.send('⚠️ Something went wrong while nuking the channel. Please check my role position and Manage Channels permission.').catch(() => {});
    }
  }
};
