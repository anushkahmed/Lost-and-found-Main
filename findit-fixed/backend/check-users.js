const mongoose = require('mongoose');
require('dotenv').config();
const User = require('./models/User');

async function checkUsers() {
  await mongoose.connect(process.env.MONGO_URI);
  const users = await User.find({}, 'name email role');
  console.log(JSON.stringify(users, null, 2));
  await mongoose.connection.close();
}

checkUsers().catch(console.error);
