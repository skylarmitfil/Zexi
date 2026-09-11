require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');
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

    // Direct Mongo update to prevent Mongoose validation failures on old documents
    try {
      // 1. Assign slot = 1 to unassigned legacy documents
      const slotResult = await Fighter.updateMany(
        { slot: { $exists: false } },
        { 
          $set: { 
            slot: 1,
            level: 1,
            xp: 0,
            statPoints: 0,
            wins: 0,
            losses: 0,
            balance: 100
          } 
        }
      );

      if (slotResult.modifiedCount > 0) {
        console.log(`✅ Migrated ${slotResult.modifiedCount} legacy character(s) to Slot 1.`);
      }

      // 2. Patch missing schema required fields on corrupted test records
      await Fighter.updateMany(
        { imageUrl: { $exists: false } },
        { $set: { imageUrl: 'https://cdn.discordapp.com/embed/avatars/0.png' } }
      );
      await Fighter.updateMany(
        { fightingStyle: { $exists: false } },
        { $set: { fightingStyle: 'Berserker' } }
      );
      await Fighter.updateMany(
        { defense: { $exists: false } },
        { $set: { defense: 5 } }
      );
      await Fighter.updateMany(
        { attack: { $exists: false } },
        { $set: { attack: 15 } }
      );
      await Fighter.updateMany(
        { hp: { $exists: false } },
        { $set: { hp: 100, maxHp: 100 } }
      );

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
