const mongoose = require('mongoose');

const fighterSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  level: { type: Number, default: 1 },
  xp: { type: Number, default: 0 },
  statPoints: { type: Number, default: 0 },
  hp: { type: Number, default: 100 },
  maxHp: { type: Number, default: 100 },
  attack: { type: Number, default: 15 },
  defense: { type: Number, default: 5 },
  balance: { type: Number, default: 100 },
  imageUrl: { type: String, default: 'https://i.imgur.com/8Q9Z5b3.png' },
  wins: { type: Number, default: 0 },
  losses: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Fighter', fighterSchema);
