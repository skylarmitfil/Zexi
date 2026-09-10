const mongoose = require('mongoose');

const fighterSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  slot: { type: Number, required: true, enum: [1, 2] },
  name: { type: String, required: true },
  fightingStyle: { type: String, required: true },
  level: { type: Number, required: true },
  xp: { type: Number, required: true },
  statPoints: { type: Number, required: true },
  hp: { type: Number, required: true },
  maxHp: { type: Number, required: true },
  attack: { type: Number, required: true },
  defense: { type: Number, required: true },
  balance: { type: Number, required: true },
  imageUrl: { type: String, required: true },
  wins: { type: Number, required: true },
  losses: { type: Number, required: true }
}, { timestamps: true });

fighterSchema.index({ userId: 1, slot: 1 }, { unique: true });

module.exports = mongoose.model('Fighter', fighterSchema);
