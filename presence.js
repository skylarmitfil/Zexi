const { ActivityType } = require('discord.js');

const activities = [
  {
    type: ActivityType.Playing,
    name: 'Roblox',
    state: 'In a private server',
    details: 'Grinding levels',
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
    details: 'Favorite Playlist',
    state: 'Listening to music',
    status: 'online'
  },
  {
    type: ActivityType.Competing,
    name: 'with code',
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

  const activityData = {
    name,
    type: activityConfig.type,
    state: activityConfig.state || undefined,
    details: activityConfig.details || undefined
  };

  client.user.setPresence({
    activities: [activityData],
    status: activityConfig.status || 'idle'
  });

  const activityTypeNames = ['Playing', 'Streaming', 'Listening', 'Watching', 'Custom', 'Competing'];
  const typeLabel = activityTypeNames[activityConfig.type] || 'Activity';

  console.log(`[Presence] Updated | Status: ${activityConfig.status || 'idle'} | ${typeLabel}: ${name}`);

  currentIndex = (currentIndex + 1) % activities.length;
}

module.exports = { startPresenceRotation };
