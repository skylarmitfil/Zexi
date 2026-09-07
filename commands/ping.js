module.exports = {
  name: 'ping',
  aliases: ['p'],
  description: 'Replies with bot latency over WebSocket',
  execute(message, args, ws) {
    const latency = Date.now() - message.createdTimestamp;
    const response = `Pong! Latency is \`${latency}ms\`.`;

    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({
        type: 'PONG',
        latency,
        channelId: message.channel.id
      }));
    }

    return message.channel.send(response);
  }
};
