const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  potions: { type: Number, default: 0 },
  equippedWeapon: { type: String, default: 'None' },
  equippedArmor: { type: String, default: 'None' },
  weaponsOwned: [{ type: String }],
  armorOwned: [{ type: String }]
}, { timestamps: true });

module.exports = mongoose.model('Inventory', inventorySchema);
