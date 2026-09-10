require('dotenv').config();
const { Client, GatewayIntentBits, Events, Collection } = require('discord.js');
const { connectDatabase } = require('./database');
const { startPresenceRotation } = require('./presence');
const { loadCommands, commands, initCommandWebSocket } = require('./commandHandler');
const Guild = require('./models/Guild');
const Fighter = require('./models/Fighter');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences
  ]
});

const DEFAULT_PREFIX = process.env.PREFIX || ',';

// Message Event Handler
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.content) return;

  let prefix = DEFAULT_PREFIX;

  if (message.guild) {
    try {
      const guildData = await Guild.findOne({ guildId: message.guild.id });
      if (guildData && guildData.prefix) {
        prefix = guildData.prefix;
      }
    } catch (err) {
      console.error('Error fetching guild prefix:', err);
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
    message.channel.send('There was an error trying to execute that command.').catch(() => {});
  }
});

// Bootstrap & Ready Lifecycle
async function bootstrap() {
  await connectDatabase();
  loadCommands();

  client.once(Events.ClientReady, async (readyClient) => {
    console.log(`🤖 Logged in as ${readyClient.user.tag}`);

    // Auto-migrate legacy characters missing the 'slot' or stat fields
    try {
      const unassignedFighters = await Fighter.find({ slot: { $exists: false } });
      if (unassignedFighters.length > 0) {
        console.log(`🔄 Found ${unassignedFighters.length} legacy character(s) missing slot data. Migrating to Slot 1...`);
        for (const fighter of unassignedFighters) {
          fighter.slot = 1;
          if (fighter.statPoints === undefined) fighter.statPoints = 0;
          if (fighter.xp === undefined) fighter.xp = 0;
          if (fighter.level === undefined) fighter.level = 1;
          if (fighter.wins === undefined) fighter.wins = 0;
          if (fighter.losses === undefined) fighter.losses = 0;
          if (fighter.balance === undefined) fighter.balance = 100;
          await fighter.save();
        }
        console.log('✅ Legacy character migration completed successfully!');
      }
    } catch (err) {
      console.error('❌ Error during legacy character migration:', err);
    }

    // Start background services
    startPresenceRotation(readyClient, 2 * 60 * 1000);

    const port = process.env.PORT || 8080;
    initCommandWebSocket(readyClient, port);
  });

  client.login(process.env.DISCORD_TOKEN);
}

process.on('unhandledRejection', error => {
  console.error('Unhandled Promise Rejection:', error);
});

bootstrap();
