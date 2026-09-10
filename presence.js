const { ActivityType } = require('discord.js');

const activities = [
  {
    type: ActivityType.Playing,
    name: 'Roblox',
    status: 'idle'
  },
  {
    type: ActivityType.Watching,
    name: (client) => {
      const totalMembers = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
      return `${totalMembers} members across ${client.guilds.cache.size} servers`;
    },
    status: 'dnd'
  },
  {
    type: ActivityType.Listening,
    name: 'Spotify',
    status: 'online'
  },
  {
    type: ActivityType.Competing,
    name: 'a coding challenge',
    status: 'idle'
  }
];

let currentIndex = 0;

function startPresenceRotation(client, intervalMs = 2 * 60 * 1000) {
  updatePresence(client);

  setInterval(() => {
    updatePresence(client);
  }, intervalMs);
}

function updatePresence(client) {
  if (!client.user) return;

  const activityConfig = activities[currentIndex];

  const name = typeof activityConfig.name === 'function' 
    ? activityConfig.name(client) 
    : activityConfig.name;

  client.user.setPresence({
    activities: [{
      name: name,
      type: activityConfig.type
    }],
    status: activityConfig.status || 'online'
  });

  currentIndex = (currentIndex + 1) % activities.length;
}

module.exports = { startPresenceRotation };
