const mongoose = require('mongoose');

const fighterSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  slot: { type: Number, required: true, enum: [1, 2], default: 1 },
  name: { type: String, required: true },
  fightingStyle: { type: String, required: true },
  level: { type: Number, required: true, default: 1 },
  xp: { type: Number, required: true, default: 0 },
  statPoints: { type: Number, required: true, default: 0 },
  hp: { type: Number, required: true },
  maxHp: { type: Number, required: true },
  attack: { type: Number, required: true },
  defense: { type: Number, required: true },
  balance: { type: Number, required: true, default: 100 },
  imageUrl: { type: String, required: true },
  wins: { type: Number, required: true, default: 0 },
  losses: { type: Number, required: true, default: 0 }
}, { timestamps: true });

fighterSchema.index({ userId: 1, slot: 1 }, { unique: true });

module.exports = mongoose.model('Fighter', fighterSchema);