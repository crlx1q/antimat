const mongoose = require('mongoose');

const penaltySchema = new mongoose.Schema({
  // Пользователь, получивший штраф
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Группа (если применимо)
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    default: null
  },
  // Обнаруженное слово
  word: {
    type: String,
    required: true
  },
  // Сумма штрафа в тенге
  amount: {
    type: Number,
    required: true
  },
  // Списан ли штраф
  isForgiven: {
    type: Boolean,
    default: false
  },
  // Кто списал штраф
  forgivenBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  forgivenAt: {
    type: Date,
    default: null
  },
  // Наказание от ИИ (пока заглушка)
  aiPunishment: {
    type: String,
    default: null
  },
  // Время обнаружения
  detectedAt: {
    type: Date,
    default: Date.now
  },
  // Дополнительные данные
  metadata: {
    // Часть распознанного текста для контекста
    context: String,
    // Уверенность распознавания (0-1)
    confidence: Number
  }
});

// Индексы для быстрого поиска
penaltySchema.index({ user: 1, detectedAt: -1 });
penaltySchema.index({ group: 1, detectedAt: -1 });
penaltySchema.index({ word: 1 });

// Статические методы для статистики
penaltySchema.statics.getUserStats = async function(userId, period = 'all') {
  const match = { user: userId };
  
  if (period !== 'all') {
    const now = new Date();
    let startDate;
    
    switch (period) {
      case 'day':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        break;
      case 'week':
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'month':
        startDate = new Date(now.setMonth(now.getMonth() - 1));
        break;
    }
    
    if (startDate) {
      match.detectedAt = { $gte: startDate };
    }
  }
  
  const stats = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalCount: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
        forgivenCount: { $sum: { $cond: ['$isForgiven', 1, 0] } },
        forgivenAmount: { $sum: { $cond: ['$isForgiven', '$amount', 0] } }
      }
    }
  ]);
  
  return stats[0] || { totalCount: 0, totalAmount: 0, forgivenCount: 0, forgivenAmount: 0 };
};

penaltySchema.statics.getTopWords = async function(userId, limit = 5) {
  return await this.aggregate([
    { $match: { user: userId } },
    {
      $group: {
        _id: '$word',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' }
      }
    },
    { $sort: { count: -1 } },
    { $limit: limit }
  ]);
};

penaltySchema.statics.getGroupStats = async function(groupId) {
  const mongoose = require('mongoose');
  const groupObjectId = new mongoose.Types.ObjectId(groupId);
  return await this.aggregate([
    { $match: { group: groupObjectId } },
    {
      $group: {
        _id: '$user',
        totalCount: { $sum: 1 },
        totalAmount: { $sum: '$amount' }
      }
    },
    { $sort: { totalAmount: -1 } },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'userInfo'
      }
    },
    { $unwind: '$userInfo' },
    {
      $lookup: {
        from: 'penalties',
        let: { userId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$user', '$$userId'] },
                  { $eq: ['$group', groupObjectId] }
                ]
              }
            }
          },
          {
            $group: {
              _id: '$word',
              count: { $sum: 1 },
              totalAmount: { $sum: '$amount' }
            }
          },
          { $sort: { count: -1 } },
          { $limit: 3 }
        ],
        as: 'topWords'
      }
    },
    {
      $project: {
        userId: '$_id',
        name: '$userInfo.name',
        totalDebt: '$userInfo.totalDebt',
        isPremium: '$userInfo.isPremium',
        totalCount: 1,
        totalAmount: 1,
        topWords: 1
      }
    }
  ]);
};

module.exports = mongoose.model('Penalty', penaltySchema);

