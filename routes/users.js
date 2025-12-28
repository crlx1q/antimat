const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { auth } = require('../middleware/auth');

// PUT /api/user/push-token - сохранить FCM токен
router.put('/push-token', auth, async (req, res) => {
  try {
    const { fcmToken } = req.body;
    if (!fcmToken || typeof fcmToken !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'FCM token is required'
      });
    }

    await User.findByIdAndUpdate(
      req.userId,
      { fcmToken },
      { new: true }
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Save push token error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка сохранения push токена'
    });
  }
});

// PUT /api/user/ping - легкий heartbeat для поддержания online статуса
router.put('/ping', auth, async (req, res) => {
  try {
    // lastSeen уже обновлен в auth middleware
    // Если сейчас запись активна, не затираем статус на "online"
    const user = await User.findById(req.userId).populate('groups', '_id');
    if (user?.groups?.length && !user.isRecording) {
      const { sendPresencePush } = require('../utils/fcm');
      for (const group of user.groups) {
        await sendPresencePush(group._id.toString(), req.userId, false);
      }
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false });
  }
});

// PUT /api/user/presence - обновить статус присутствия (recording/online)
router.put('/presence', auth, async (req, res) => {
  try {
    const { recording } = req.body;
    if (typeof recording !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'recording (boolean) is required'
      });
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      { 
        isRecording: recording,
        lastSeen: new Date()
      },
      { new: true }
    ).populate('groups', '_id');

    // Send presence push to all groups
    const { sendPresencePush } = require('../utils/fcm');
    if (user.groups && user.groups.length > 0) {
      for (const group of user.groups) {
        await sendPresencePush(group._id.toString(), req.userId, recording);
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Update presence error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка обновления статуса присутствия'
    });
  }
});

// GET /api/user/profile - Получить профиль
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .select('-password')
      .populate('groups', 'name inviteCode members');
    
    res.json({
      success: true,
      data: { user }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка получения профиля'
    });
  }
});

// PUT /api/user/settings - Обновить настройки
router.put('/settings', auth, async (req, res) => {
  try {
    const { penaltyAmount, theme, soundEnabled, notificationsEnabled } = req.body;
    const user = await User.findById(req.userId);
    
    // Обновление штрафа (с проверкой недельного ограничения)
    if (penaltyAmount !== undefined && penaltyAmount !== user.penaltyAmount) {
      if (!user.canUpdatePenaltyAmount()) {
        const nextUpdate = new Date(user.penaltyAmountUpdatedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
        return res.status(400).json({
          success: false,
          message: `Изменить сумму штрафа можно после ${nextUpdate.toLocaleDateString('ru-RU')}`
        });
      }
      
      user.penaltyAmount = Math.max(1, Math.min(penaltyAmount, 100000)); // 1 - 100000 тенге
      user.penaltyAmountUpdatedAt = new Date();
    }
    
    // Обновление настроек
    if (theme) user.settings.theme = theme;
    if (soundEnabled !== undefined) user.settings.soundEnabled = soundEnabled;
    if (notificationsEnabled !== undefined) user.settings.notificationsEnabled = notificationsEnabled;
    
    await user.save();
    
    res.json({
      success: true,
      message: 'Настройки обновлены',
      data: {
        penaltyAmount: user.penaltyAmount,
        penaltyAmountUpdatedAt: user.penaltyAmountUpdatedAt,
        settings: user.settings
      }
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка обновления настроек'
    });
  }
});

// PUT /api/user/profile - Обновить профиль
router.put('/profile', auth, async (req, res) => {
  try {
    const { name, avatar } = req.body;
    const updateData = {};
    
    if (name) updateData.name = name.trim();
    if (avatar !== undefined) updateData.avatar = avatar;
    
    const user = await User.findByIdAndUpdate(
      req.userId,
      updateData,
      { new: true }
    ).select('-password');
    
    res.json({
      success: true,
      message: 'Профиль обновлён',
      data: { user }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка обновления профиля'
    });
  }
});

module.exports = router;

