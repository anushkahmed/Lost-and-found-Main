// tests/global-teardown.js
module.exports = async () => {
  const mongo = global.__MONGO__;
  if (mongo) await mongo.stop();
};
