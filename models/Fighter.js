const mongoose = require('mongoose');

const fighterSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  hp: { type: Number, default: 100 },
  maxHp: { type: Number, default: 100 },
  attack: { type: Number, default: 15 },
  wins: { type: Number, default: 0 },
  losses: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Fighter', fighterSchema);
