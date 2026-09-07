require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');
const { startPresenceRotation } = require('./presence');
const { loadCommands, initCommandWebSocket } = require('./commandHandler');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences
  ]
});

loadCommands();

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  startPresenceRotation(readyClient, 2 * 60 * 1000);
  
  const port = process.env.PORT || 8080;
  initCommandWebSocket(readyClient, port);
});

client.login(process.env.DISCORD_TOKEN);
