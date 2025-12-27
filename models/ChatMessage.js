const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  // Группа
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true
  },
  // Отправитель (null для системных сообщений)
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  // Тип сообщения
  type: {
    type: String,
    enum: ['message', 'penalty', 'system', 'join', 'leave'],
    default: 'message'
  },
  // Текст сообщения
  text: {
    type: String,
    required: true
  },
  // Дополнительные данные для разных типов
  metadata: {
    // Для penalty типа
    penaltyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Penalty' },
    penaltyAmount: Number,
    word: String,
    // Для системных сообщений
    targetUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  // Прочитано ли
  readBy: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    readAt: { type: Date, default: Date.now }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Индекс для быстрой выборки сообщений группы
chatMessageSchema.index({ group: 1, createdAt: -1 });

// Статический метод для создания сообщения о штрафе
chatMessageSchema.statics.createPenaltyMessage = async function(groupId, userId, userName, word, amount, penaltyId) {
  const maskedWord = word.charAt(0) + '*'.repeat(word.length - 1);
  return await this.create({
    group: groupId,
    sender: userId,
    type: 'penalty',
    text: `${userName} получил штраф +${amount}₸ за слово "${maskedWord}"`,
    metadata: {
      penaltyId,
      penaltyAmount: amount,
      word: maskedWord
    }
  });
};

module.exports = mongoose.model('ChatMessage', chatMessageSchema);

