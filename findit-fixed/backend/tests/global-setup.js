// tests/global-setup.js
//
// Spins up an in-memory MongoDB once for the whole test run. The URI is
// stored on a global variable that global-teardown.js can read to stop the
// server cleanly. We also write it to process.env so individual test files
// pick it up via the standard MONGO_URI lookup in db.js.

const { MongoMemoryServer } = require('mongodb-memory-server');

module.exports = async () => {
  const mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri();
  global.__MONGO__ = mongo;
  process.env.MONGO_URI = uri;
  // Persist so child processes / parallel workers see the same URI.
  process.env.__MONGO_URI__ = uri;
};
