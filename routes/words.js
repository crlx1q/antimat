const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { auth } = require('../middleware/auth');

// GET /api/words - Получить список слов
router.get('/', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('bannedWords isPremium');
    
    // Calculate word limit based on premium status
    const wordLimit = user.isPremium ? 30 : 10;
    
    res.json({
      success: true,
      data: {
        words: user.bannedWords,
        limit: wordLimit,
        count: user.bannedWords.length,
        isPremium: user.isPremium
      }
    });
  } catch (error) {
    console.error('Get words error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка получения списка слов'
    });
  }
});

// POST /api/words - Добавить слово
router.post('/', auth, async (req, res) => {
  try {
    const { word } = req.body;
    
    if (!word || word.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Слово должно быть минимум 2 символа'
      });
    }
    
    const user = await User.findById(req.userId);
    
    // Проверка лимита
    if (user.bannedWords.length >= user.wordLimit) {
      return res.status(400).json({
        success: false,
        message: `Достигнут лимит слов (${user.wordLimit}). ${!user.isPremium ? 'Оформите Premium для увеличения лимита до 30 слов.' : ''}`
      });
    }
    
    const normalizedWord = word.trim().toLowerCase();
    
    // Проверка на дубликат
    if (user.bannedWords.some(w => w.word.toLowerCase() === normalizedWord)) {
      return res.status(400).json({
        success: false,
        message: 'Это слово уже есть в списке'
      });
    }
    
    user.bannedWords.push({ word: normalizedWord });
    await user.save();
    
    res.status(201).json({
      success: true,
      message: 'Слово добавлено',
      data: {
        word: normalizedWord,
        words: user.bannedWords,
        count: user.bannedWords.length,
        limit: user.wordLimit
      }
    });
  } catch (error) {
    console.error('Add word error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка добавления слова'
    });
  }
});

// DELETE /api/words/:word - Удалить слово
router.delete('/:word', auth, async (req, res) => {
  try {
    const { word } = req.params;
    const user = await User.findById(req.userId);
    
    const initialLength = user.bannedWords.length;
    user.bannedWords = user.bannedWords.filter(
      w => w.word.toLowerCase() !== word.toLowerCase()
    );
    
    if (user.bannedWords.length === initialLength) {
      return res.status(404).json({
        success: false,
        message: 'Слово не найдено'
      });
    }
    
    await user.save();
    
    res.json({
      success: true,
      message: 'Слово удалено',
      data: {
        words: user.bannedWords,
        count: user.bannedWords.length
      }
    });
  } catch (error) {
    console.error('Delete word error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка удаления слова'
    });
  }
});

module.exports = router;

