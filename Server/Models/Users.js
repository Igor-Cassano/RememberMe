const mongoose = require('mongoose');

const User = new mongoose.Schema({
  username: String,
  fullName: String,
  email: String,
  passwordHash: String,
  createdBy: String,
  emailVerified: { type: Boolean, default: false },
  verificationToken: String,
  assignedDeceased: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Deceased'
    }],
  municipalityId: String,
});

module.exports = mongoose.model('User', User, 'Users');