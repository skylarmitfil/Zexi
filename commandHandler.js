const fs = require('fs');
const path = require('path');

const commands = new Map();

function loadCommands() {
  const commandsPath = path.join(__dirname, 'commands');
  if (!fs.existsSync(commandsPath)) return;

  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
  for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    if (command.name) {
      commands.set(command.name, command);
    }
  }
}

function initCommandWebSocket(client, port) {
  // Your WebSocket initialization logic
}

module.exports = { loadCommands, commands, initCommandWebSocket };
