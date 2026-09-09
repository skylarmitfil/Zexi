require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');
const { connectDatabase } = require('./database');
const { startPresenceRotation } = require('./presence');
const { loadCommands, commands, initCommandWebSocket } = require('./commandHandler');
const Guild = require('./models/Guild');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences
  ]
});

const DEFAULT_PREFIX = ',';

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.content) return;

  let prefix = DEFAULT_PREFIX;

  if (message.guild) {
    const guildData = await Guild.findOne({ guildId: message.guild.id });
    if (guildData && guildData.prefix) {
      prefix = guildData.prefix;
    }
  }

  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();

  const command = commands.get(commandName) || commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));
  if (!command) return;

  try {
    await command.execute(message, args);
  } catch (error) {
    console.error(`Error executing command ${commandName}:`, error);
    message.channel.send('There was an error trying to execute that command.');
  }
});

async function bootstrap() {
  await connectDatabase();
  loadCommands();

  client.once(Events.ClientReady, (readyClient) => {
    console.log(`Logged in as ${readyClient.user.tag}`);
    startPresenceRotation(readyClient, 2 * 60 * 1000);
    
    const port = process.env.PORT || 8080;
    initCommandWebSocket(readyClient, port);
  });

  client.login(process.env.DISCORD_TOKEN);
}

bootstrap();