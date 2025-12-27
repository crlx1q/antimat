const express = require('express');
const router = express.Router();
const Penalty = require('../models/Penalty');
const User = require('../models/User');
const Group = require('../models/Group');
const ChatMessage = require('../models/ChatMessage');
const { auth } = require('../middleware/auth');

// POST /api/penalties/add - Добавить штраф
router.post('/add', auth, async (req, res) => {
  try {
    const { word, groupId, context, confidence } = req.body;
    
    if (!word) {
      return res.status(400).json({
        success: false,
        message: 'Слово обязательно'
      });
    }
    
    const user = await User.findById(req.userId);
    
    // Создаём штраф
    const penalty = await Penalty.create({
      user: req.userId,
      group: groupId || null,
      word: word.toLowerCase(),
      amount: user.penaltyAmount,
      metadata: {
        context,
        confidence
      },
      // Заглушка для ИИ наказания
      aiPunishment: getRandomPunishment()
    });
    
    // Обновляем общий долг пользователя
    user.totalDebt += user.penaltyAmount;
    await user.save();
    
    // Отправляем уведомление во ВСЕ группы пользователя
    const userGroups = await Group.find({ 'members.user': req.userId });
    for (const group of userGroups) {
      await ChatMessage.createPenaltyMessage(
        group._id,
        req.userId,
        user.name,
        word,
        user.penaltyAmount,
        penalty._id
      );
    }
    
    res.status(201).json({
      success: true,
      message: 'Штраф добавлен',
      data: {
        penalty: {
          id: penalty._id,
          word: penalty.word,
          amount: penalty.amount,
          aiPunishment: penalty.aiPunishment,
          detectedAt: penalty.detectedAt
        },
        totalDebt: user.totalDebt
      }
    });
  } catch (error) {
    console.error('Add penalty error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка добавления штрафа'
    });
  }
});

// GET /api/penalties/stats - Статистика штрафов
router.get('/stats', auth, async (req, res) => {
  try {
    const { period = 'all' } = req.query;
    
    const stats = await Penalty.getUserStats(req.userId, period);
    const topWords = await Penalty.getTopWords(req.userId, 5);
    const user = await User.findById(req.userId).select('totalDebt penaltyAmount');
    
    // Получаем историю штрафов за последние 7 дней
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const dailyStats = await Penalty.aggregate([
      { 
        $match: { 
          user: req.userId, 
          detectedAt: { $gte: sevenDaysAgo } 
        } 
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$detectedAt' } },
          count: { $sum: 1 },
          amount: { $sum: '$amount' }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    res.json({
      success: true,
      data: {
        totalCount: stats.totalCount,
        totalAmount: stats.totalAmount,
        forgivenCount: stats.forgivenCount,
        forgivenAmount: stats.forgivenAmount,
        currentDebt: user.totalDebt,
        penaltyAmount: user.penaltyAmount,
        topWords,
        dailyStats
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка получения статистики'
    });
  }
});

// GET /api/penalties/history - История штрафов
router.get('/history', auth, async (req, res) => {
  try {
    const { page = 1, limit = 20, groupId } = req.query;
    
    const query = { user: req.userId };
    if (groupId) query.group = groupId;
    
    const penalties = await Penalty.find(query)
      .sort({ detectedAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('group', 'name');
    
    const total = await Penalty.countDocuments(query);
    
    res.json({
      success: true,
      data: {
        penalties,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка получения истории'
    });
  }
});

// POST /api/penalties/:id/forgive - Списать штраф
router.post('/:id/forgive', auth, async (req, res) => {
  try {
    const penalty = await Penalty.findById(req.params.id);
    
    if (!penalty) {
      return res.status(404).json({
        success: false,
        message: 'Штраф не найден'
      });
    }
    
    if (penalty.isForgiven) {
      return res.status(400).json({
        success: false,
        message: 'Штраф уже списан'
      });
    }
    
    // Проверяем права (если групповой штраф)
    if (penalty.group) {
      const group = await Group.findById(penalty.group);
      const isAdmin = group.admins.includes(req.userId) || 
                      group.owner.equals(req.userId) ||
                      group.settings.canMembersForgiveDebt;
      
      if (!isAdmin && !penalty.user.equals(req.userId)) {
        return res.status(403).json({
          success: false,
          message: 'Нет прав для списания штрафа'
        });
      }
    }
    
    penalty.isForgiven = true;
    penalty.forgivenBy = req.userId;
    penalty.forgivenAt = new Date();
    await penalty.save();
    
    // Уменьшаем долг пользователя
    await User.findByIdAndUpdate(penalty.user, {
      $inc: { totalDebt: -penalty.amount }
    });
    
    res.json({
      success: true,
      message: 'Штраф списан'
    });
  } catch (error) {
    console.error('Forgive penalty error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка списания штрафа'
    });
  }
});

// Заглушка для ИИ наказаний
function getRandomPunishment() {
  const punishments = [
    'Сделай 10 приседаний',
    'Выпей стакан воды',
    'Позвони маме и скажи что любишь',
    'Сделай 5 отжиманий',
    'Улыбнись и подумай о хорошем',
    'Сделай комплимент первому встречному',
    'Убери одну вещь на своё место',
    'Напиши благодарность кому-нибудь',
    'Сделай 20 шагов на месте',
    'Задержи дыхание на 30 секунд'
  ];
  return punishments[Math.floor(Math.random() * punishments.length)];
}

module.exports = router;

