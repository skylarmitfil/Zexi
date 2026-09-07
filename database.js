const mongoose = require('mongoose');

async function connectDatabase() {
  const uri = process.env.MONGO_URL || process.env.MONGODB_URI;
  if (!uri) {
    console.warn('[Database] No connection URI found. Skipping DB init.');
    return;
  }

  try {
    await mongoose.connect(uri);
    console.log('[Database] Connected to Railway MongoDB.');
  } catch (error) {
    console.error('[Database] Connection failed:', error);
  }
}

module.exports = { connectDatabase };
