module.exports = {
  apps: [{
    name: 'discord-bot',
    script: 'index.js',
    watch: true,
    ignore_watch: [
      'node_modules',
      'logs',
      '.git',
      '*.log',
      '.env'
    ],
    watch_delay: 1000 // Waits 1 second after saving before restarting
  }]
};
