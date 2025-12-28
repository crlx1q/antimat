const express = require('express');
const router = express.Router();
const Group = require('../models/Group');
const User = require('../models/User');
const Penalty = require('../models/Penalty');
const ChatMessage = require('../models/ChatMessage');
const { sendPushToTokens, isFcmReady, computeUserStatus } = require('../utils/fcm');
const { auth } = require('../middleware/auth');

// GET /api/groups - Получить группы пользователя
router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).populate({
      path: 'groups',
      populate: [
        {
          path: 'owner',
          select: 'name avatar totalDebt isPremium premiumExpiresAt status lastSeen isRecording'
        },
        {
          path: 'members.user',
          select: 'name avatar totalDebt isPremium premiumExpiresAt status lastSeen isRecording'
        }
      ]
    });
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'Пользователь не найден' });
    }

    const groupsWithStatus = user.groups.map(group => {
      const g = group.toObject();
      if (g.members) {
        g.members = g.members.map(m => {
          if (m.user) {
            m.user.status = computeUserStatus(m.user);
          }
          return m;
        });
      }
      return g;
    });
    
    res.json({
      success: true,
      data: { groups: groupsWithStatus }
    });
  } catch (error) {
    console.error('Get groups error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка получения групп'
    });
  }
});

// POST /api/groups/create - Создать группу
router.post('/create', auth, async (req, res) => {
  try {
    const { name, description } = req.body;
    
    if (!name || name.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Название группы обязательно (минимум 2 символа)'
      });
    }
    
    // Check premium limits
    const user = await User.findById(req.userId).populate('groups');
    const groupLimit = user.isPremium ? 30 : 2;
    
    if (user.groups.length >= groupLimit) {
      return res.status(403).json({
        success: false,
        message: `Достигнут лимит групп (${groupLimit}). ${!user.isPremium ? 'Оформите Premium для увеличения лимита до 30 групп.' : ''}`
      });
    }
    
    const inviteCode = await Group.generateInviteCode();
    
    const group = await Group.create({
      name: name.trim(),
      description: description?.trim() || '',
      inviteCode,
      owner: req.userId,
      admins: [req.userId],
      members: [{
        user: req.userId,
        role: 'owner'
      }]
    });
    
    // Добавляем группу в список пользователя
    await User.findByIdAndUpdate(req.userId, {
      $push: { groups: group._id }
    });
    
    // Создаём системное сообщение о создании группы
    await ChatMessage.create({
      group: group._id,
      type: 'system',
      text: 'Группа создана'
    });
    
    res.status(201).json({
      success: true,
      message: 'Группа создана',
      data: {
        group: {
          id: group._id,
          name: group.name,
          inviteCode: group.inviteCode,
          inviteLink: `https://antimat.reflexai.pro/invite/${group.inviteCode}`
        }
      }
    });
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка создания группы'
    });
  }
});

// POST /api/groups/join - Присоединиться к группе
router.post('/join', auth, async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Код приглашения обязателен'
      });
    }
    
    // Check premium limits
    const user = await User.findById(req.userId).populate('groups');
    const groupLimit = user.isPremium ? 30 : 2;
    
    if (user.groups.length >= groupLimit) {
      return res.status(403).json({
        success: false,
        message: `Достигнут лимит групп (${groupLimit}). ${!user.isPremium ? 'Оформите Premium для увеличения лимита до 30 групп.' : ''}`
      });
    }
    
    const group = await Group.findOne({ 
      inviteCode: code.toUpperCase().trim() 
    });
    
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Группа не найдена'
      });
    }
    
    // Проверяем, не состоит ли уже в группе
    const isMember = group.members.some(m => m.user.equals(req.userId));
    if (isMember) {
      return res.status(400).json({
        success: false,
        message: 'Вы уже состоите в этой группе'
      });
    }
    
    // Добавляем участника
    group.members.push({
      user: req.userId,
      role: 'member'
    });
    await group.save();
    
    // Добавляем группу пользователю
    await User.findByIdAndUpdate(req.userId, {
      $push: { groups: group._id }
    });
    
    // Сообщение о присоединении (используем уже загруженного user)
    await ChatMessage.create({
      group: group._id,
      sender: req.userId,
      type: 'join',
      text: `${user.name} присоединился к группе`
    });
    
    res.json({
      success: true,
      message: 'Вы присоединились к группе',
      data: {
        group: {
          id: group._id,
          name: group.name
        }
      }
    });
  } catch (error) {
    console.error('Join group error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка присоединения к группе'
    });
  }
});

// GET /api/groups/:id - Данные группы
router.get('/:id', auth, async (req, res) => {
  try {
    const group = await Group.findById(req.params.id)
      .populate('owner', 'name avatar isPremium premiumExpiresAt totalDebt')
      .populate('admins', 'name avatar isPremium premiumExpiresAt totalDebt')
      .populate('members.user', 'name avatar totalDebt isPremium premiumExpiresAt isRecording lastSeen');
    
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Группа не найдена'
      });
    }
    
    // Проверяем членство
    const isMember = group.members.some(m => m.user._id.equals(req.userId));
    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: 'Вы не состоите в этой группе'
      });
    }
    
    // Add presence status to each member
    const groupObj = group.toObject();
    groupObj.members = groupObj.members.map(member => {
      if (member.user) {
        const status = computeUserStatus(member.user);
        return {
          ...member,
          user: {
            ...member.user,
            status
          }
        };
      }
      return member;
    });
    
    res.json({
      success: true,
      data: { group: groupObj }
    });
  } catch (error) {
    console.error('Get group error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка получения группы'
    });
  }
});

// GET /api/groups/:id/stats - Статистика группы
router.get('/:id/stats', auth, async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Группа не найдена'
      });
    }
    
    // Проверяем членство
    const isMember = group.members.some(m => m.user.equals(req.userId));
    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: 'Вы не состоите в этой группе'
      });
    }
    
    const memberStats = await Penalty.getGroupStats(req.params.id);
    
    // Общая статистика группы
    const totalStats = await Penalty.aggregate([
      { $match: { group: group._id } },
      {
        $group: {
          _id: null,
          totalCount: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);
    
    res.json({
      success: true,
      data: {
        memberStats,
        totalStats: totalStats[0] || { totalCount: 0, totalAmount: 0 }
      }
    });
  } catch (error) {
    console.error('Get group stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка получения статистики'
    });
  }
});

// GET /api/groups/:id/chat - Сообщения чата
router.get('/:id/chat', auth, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    
    const group = await Group.findById(req.params.id);
    
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Группа не найдена'
      });
    }
    
    // Проверяем членство
    const isMember = group.members.some(m => m.user.equals(req.userId));
    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: 'Вы не состоите в этой группе'
      });
    }
    
    const messages = await ChatMessage.find({ group: req.params.id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('sender', 'name avatar');
    
    const total = await ChatMessage.countDocuments({ group: req.params.id });
    
    res.json({
      success: true,
      data: {
        messages: messages.reverse(),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get chat error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка получения сообщений'
    });
  }
});

// GET /api/groups/:id/chat/poll - Long polling для новых сообщений
router.get('/:id/chat/poll', auth, async (req, res) => {
  try {
    const { lastMessageId } = req.query;
    const timeout = 30000; // 30 seconds
    const pollInterval = 1000; // Check every 1 second
    const startTime = Date.now();
    
    const group = await Group.findById(req.params.id);
    
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Группа не найдена'
      });
    }
    
    // Проверяем членство
    const isMember = group.members.some(m => m.user.equals(req.userId));
    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: 'Вы не состоите в этой группе'
      });
    }
    
    // Функция для проверки новых сообщений
    const checkForNewMessages = async () => {
      const query = { group: req.params.id };
      
      // Если есть lastMessageId, ищем только более новые сообщения
      if (lastMessageId) {
        const lastMessage = await ChatMessage.findById(lastMessageId);
        if (lastMessage) {
          query.createdAt = { $gt: lastMessage.createdAt };
        }
      }
      
      const newMessages = await ChatMessage.find(query)
        .sort({ createdAt: 1 })
        .limit(50)
        .populate('sender', 'name avatar');
      
      return newMessages;
    };
    
    // Poll for new messages
    const poll = async () => {
      const messages = await checkForNewMessages();
      
      if (messages.length > 0) {
        return res.json({
          success: true,
          data: { messages, hasNewMessages: true }
        });
      }
      
      // Check if timeout reached
      if (Date.now() - startTime >= timeout) {
        return res.json({
          success: true,
          data: { messages: [], hasNewMessages: false }
        });
      }
      
      // Wait and check again
      setTimeout(poll, pollInterval);
    };
    
    // Start polling
    poll();
    
  } catch (error) {
    console.error('Chat poll error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка получения сообщений'
    });
  }
});

// POST /api/groups/:id/chat - Отправить сообщение
router.post('/:id/chat', auth, async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text || text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Сообщение не может быть пустым'
      });
    }
    
    const group = await Group.findById(req.params.id);
    
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Группа не найдена'
      });
    }
    
    // Проверяем членство
    const isMember = group.members.some(m => m.user.equals(req.userId));
    if (!isMember) {
      return res.status(403).json({
        success: false,
        message: 'Вы не состоите в этой группе'
      });
    }
    
    const message = await ChatMessage.create({
      group: req.params.id,
      sender: req.userId,
      type: 'message',
      text: text.trim()
    });
    
    await message.populate('sender', 'name avatar');
    
    // Push to group members (except sender)
    if (isFcmReady()) {
      try {
        const memberIds = group.members.map((m) => m.user.toString());
        const targetIds = memberIds.filter((id) => id !== req.userId.toString());
        if (targetIds.length) {
          const users = await User.find({
            _id: { $in: targetIds },
            fcmToken: { $exists: true, $ne: null },
          }).select('fcmToken');
          const tokens = users.map((u) => u.fcmToken).filter(Boolean);
          if (tokens.length) {
            await sendPushToTokens(
              tokens,
              {
                title: group.name,
                body: `${message.sender?.name || 'Участник'}: ${message.text}`,
              },
              {
                type: 'chat_message',
                groupId: group._id.toString(),
                groupName: group.name,
                senderName: message.sender?.name || '',
                messageId: message._id.toString(),
                text: message.text,
                createdAt: message.createdAt.toISOString(),
              }
            );
          }
        }
      } catch (pushErr) {
        console.warn('Send chat push error', pushErr?.message || pushErr);
      }
    }

    res.status(201).json({
      success: true,
      data: { message }
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка отправки сообщения'
    });
  }
});

// DELETE /api/groups/:id - Удалить группу (только владелец)
router.delete('/:id', auth, async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Группа не найдена'
      });
    }
    
    // Проверяем, что пользователь является владельцем
    if (!group.owner.equals(req.userId)) {
      return res.status(403).json({
        success: false,
        message: 'Только владелец может удалить группу'
      });
    }
    
    // Удаляем все сообщения группы
    await ChatMessage.deleteMany({ group: group._id });
    
    // Удаляем группу у всех пользователей
    await User.updateMany(
      { groups: group._id },
      { $pull: { groups: group._id } }
    );
    
    // Удаляем все штрафы, связанные с группой
    await Penalty.deleteMany({ group: group._id });
    
    // Удаляем саму группу
    await Group.findByIdAndDelete(req.params.id);
    
    res.json({
      success: true,
      message: 'Группа удалена'
    });
  } catch (error) {
    console.error('Delete group error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка удаления группы'
    });
  }
});

// DELETE /api/groups/:id/leave - Покинуть группу
router.delete('/:id/leave', auth, async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Группа не найдена'
      });
    }
    
    // Владелец не может покинуть группу
    if (group.owner.equals(req.userId)) {
      return res.status(400).json({
        success: false,
        message: 'Владелец не может покинуть группу. Передайте права или удалите группу.'
      });
    }
    
    // Удаляем из группы
    group.members = group.members.filter(m => !m.user.equals(req.userId));
    group.admins = group.admins.filter(a => !a.equals(req.userId));
    await group.save();
    
    // Удаляем группу у пользователя
    await User.findByIdAndUpdate(req.userId, {
      $pull: { groups: group._id }
    });
    
    // Сообщение о выходе
    const user = await User.findById(req.userId);
    await ChatMessage.create({
      group: group._id,
      type: 'leave',
      text: `${user.name} покинул группу`
    });
    
    res.json({
      success: true,
      message: 'Вы покинули группу'
    });
  } catch (error) {
    console.error('Leave group error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка выхода из группы'
    });
  }
});

module.exports = router;

