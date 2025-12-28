const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  avatar: {
    type: String,
    default: null
  },
  // Штраф в тенге
  penaltyAmount: {
    type: Number,
    default: 100
  },
  // Дата последнего изменения штрафа (нельзя менять в течение недели)
  penaltyAmountUpdatedAt: {
    type: Date,
    default: Date.now
  },
  // Премиум статус
  isPremium: {
    type: Boolean,
    default: false
  },
  // Дата окончания PRO подписки
  premiumExpiresAt: {
    type: Date,
    default: null
  },
  // Лимит слов (10 для обычных, 30 для премиум)
  wordLimit: {
    type: Number,
    get: function() {
      return this.isPremium ? 30 : 10;
    }
  },
  // Непрерывная запись (только для премиум)
  continuousRecording: {
    type: Boolean,
    default: false
  },
  // Список запрещённых слов пользователя
  bannedWords: [{
    word: String,
    addedAt: { type: Date, default: Date.now }
  }],
  // Общая сумма штрафов (долг)
  totalDebt: {
    type: Number,
    default: 0
  },
  // Группы пользователя
  groups: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group'
  }],
  // Настройки
  settings: {
    theme: { type: String, enum: ['dark', 'light'], default: 'dark' },
    soundEnabled: { type: Boolean, default: true },
    notificationsEnabled: { type: Boolean, default: true }
  },
  // FCM push token
  fcmToken: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastActiveAt: {
    type: Date,
    default: Date.now
  }
});

// Хеширование пароля перед сохранением
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    // Проверяем статус премиум перед сохранением
    this.checkPremiumStatus();
    return next();
  }
  this.password = await bcrypt.hash(this.password, 12);
  // Проверяем статус премиум после хеширования пароля
  this.checkPremiumStatus();
  next();
});

// Метод проверки пароля
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Проверка возможности изменить штраф
userSchema.methods.canUpdatePenaltyAmount = function() {
  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  return Date.now() - this.penaltyAmountUpdatedAt.getTime() >= oneWeek;
};

// Проверка активности PRO подписки
userSchema.methods.checkPremiumStatus = function() {
  if (!this.premiumExpiresAt) {
    this.isPremium = false;
    return false;
  }
  
  const now = new Date();
  if (this.premiumExpiresAt < now) {
    this.isPremium = false;
    return false;
  }
  
  this.isPremium = true;
  return true;
};

module.exports = mongoose.model('User', userSchema);

