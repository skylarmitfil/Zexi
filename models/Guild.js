const mongoose = require('mongoose');

const guildSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  prefix: { type: String, default: '.' },
  logChannelId: { type: String, default: null },
  modRoles: [{ type: String }],
  lockedChannels: [{ type: String }]
}, { timestamps: true });

module.exports = mongoose.model('Guild', guildSchema);
