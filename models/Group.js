const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  // Код приглашения (5 символов, буквы + цифры)
  inviteCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true
  },
  // Создатель группы
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Администраторы группы
  admins: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  // Участники группы
  members: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    role: {
      type: String,
      enum: ['member', 'admin', 'owner'],
      default: 'member'
    }
  }],
  // Настройки группы
  settings: {
    // Кто может добавлять слова
    canMembersAddWords: { type: Boolean, default: false },
    // Кто может видеть статистику всех
    canMembersSeeAllStats: { type: Boolean, default: true },
    // Кто может списывать штрафы
    canMembersForgiveDebt: { type: Boolean, default: false }
  },
  // Общий список слов группы
  groupWords: [{
    word: String,
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    addedAt: { type: Date, default: Date.now }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Генерация уникального кода приглашения
groupSchema.statics.generateInviteCode = async function() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  let exists = true;
  
  while (exists) {
    code = '';
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    exists = await this.findOne({ inviteCode: code });
  }
  
  return code;
};

module.exports = mongoose.model('Group', groupSchema);

