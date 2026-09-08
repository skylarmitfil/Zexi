const mongoose = require('mongoose');

const fighterSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  balance: { type: Number, default: 100 },
  level: { type: Number, default: 1 },
  xp: { type: Number, default: 0 },
  wins: { type: Number, default: 0 },
  losses: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Fighter', fighterSchema);
