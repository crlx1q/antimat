const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { generateToken, auth } = require('../middleware/auth');

// POST /api/auth/register - Регистрация
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    // Валидация
    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        message: 'Все поля обязательны'
      });
    }
    
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Пароль должен быть минимум 6 символов'
      });
    }
    
    // Проверка существующего пользователя
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Пользователь с таким email уже существует'
      });
    }
    
    // Создание пользователя с базовыми запрещёнными словами
    const user = await User.create({
      email: email.toLowerCase(),
      password,
      name,
      bannedWords: [
        { word: 'сука' },
        { word: 'блять' },
        { word: 'хуй' },
        { word: 'пизда' },
        { word: 'ебать' }
      ]
    });
    
    const token = generateToken(user._id);
    
    res.status(201).json({
      success: true,
      message: 'Регистрация успешна',
      data: {
        token,
        user: {
          _id: user._id,
          id: user._id,
          email: user.email,
          name: user.name,
          isPremium: user.isPremium,
          penaltyAmount: user.penaltyAmount,
          penaltyAmountUpdatedAt: user.penaltyAmountUpdatedAt,
          totalDebt: user.totalDebt,
          wordLimit: user.isPremium ? 30 : 10,
          settings: user.settings,
          bannedWords: user.bannedWords
        }
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при регистрации'
    });
  }
});

// POST /api/auth/login - Вход
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email и пароль обязательны'
      });
    }
    
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Неверный email или пароль'
      });
    }
    
    const isMatch = await user.comparePassword(password);
    
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Неверный email или пароль'
      });
    }
    
    const token = generateToken(user._id);
    
    res.json({
      success: true,
      message: 'Вход выполнен успешно',
      data: {
        token,
        user: {
          _id: user._id,
          id: user._id,
          email: user.email,
          name: user.name,
          isPremium: user.isPremium,
          penaltyAmount: user.penaltyAmount,
          penaltyAmountUpdatedAt: user.penaltyAmountUpdatedAt,
          totalDebt: user.totalDebt,
          wordLimit: user.isPremium ? 30 : 10,
          settings: user.settings,
          bannedWords: user.bannedWords
        }
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при входе'
    });
  }
});

// GET /api/auth/me - Получить текущего пользователя
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .select('-password')
      .populate('groups', 'name inviteCode');
    
    // Normalize user object for frontend
    const userObj = user.toObject();
    userObj._id = userObj._id || userObj.id;
    userObj.id = userObj._id;
    userObj.wordLimit = user.isPremium ? 30 : 10;
    
    res.json({
      success: true,
      data: { user: userObj }
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка получения данных'
    });
  }
});

module.exports = router;

