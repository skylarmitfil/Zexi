const fs = require('fs');
const path = require('path');
const { Collection } = require('discord.js');
const { WebSocketServer } = require('ws');

const commands = new Collection();
const aliases = new Collection();

function loadCommands() {
  const commandsPath = path.join(__dirname, 'commands');
  
  if (!fs.existsSync(commandsPath)) {
    fs.mkdirSync(commandsPath);
  }

  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    
    if (command.name) {
      commands.set(command.name.toLowerCase(), command);
      
      if (command.aliases && Array.isArray(command.aliases)) {
        for (const alias of command.aliases) {
          aliases.set(alias.toLowerCase(), command.name.toLowerCase());
        }
      }
    }
  }

  console.log(`[Router] Loaded ${commands.size} command(s).`);
}

function initCommandWebSocket(client, port) {
  const wss = new WebSocketServer({ port });

  console.log(`[WebSocket Router] Listening on port ${port}`);

  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'READY', commands: Array.from(commands.keys()) }));

    ws.on('message', async (rawMessage) => {
      try {
        const payload = JSON.parse(rawMessage);
        
        if (payload.type === 'EXECUTE') {
          const commandName = payload.command.toLowerCase();
          const actualName = commands.has(commandName) ? commandName : aliases.get(commandName);
          const command = commands.get(actualName);

          if (!command) {
            return ws.send(JSON.stringify({ type: 'ERROR', message: 'Command not found' }));
          }

          const targetChannel = await client.channels.fetch(payload.channelId);
          if (!targetChannel) {
            return ws.send(JSON.stringify({ type: 'ERROR', message: 'Channel not found' }));
          }

          const mockMessage = {
            createdTimestamp: Date.now(),
            channel: targetChannel
          };

          await command.execute(mockMessage, payload.args || [], ws);
        }
      } catch (err) {
        ws.send(JSON.stringify({ type: 'ERROR', message: err.message }));
      }
    });
  });

  return wss;
}

module.exports = { loadCommands, initCommandWebSocket };
