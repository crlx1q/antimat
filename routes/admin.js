const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const User = require('../models/User');
const Group = require('../models/Group');
const Penalty = require('../models/Penalty');
const ChatMessage = require('../models/ChatMessage');
const Update = require('../models/Update');
const { adminAuth, generateAdminToken } = require('../middleware/adminAuth');
const admin = require('firebase-admin');

// Initialize Firebase Admin with env vars (service account fields provided as individual envs)
if (!admin.apps.length) {
  const {
    project_id,
    client_email,
    private_key,
    private_key_id,
    client_id,
    auth_uri,
    token_uri,
    auth_provider_x509_cert_url,
    client_x509_cert_url,
    universe_domain,
  } = process.env;

  if (project_id && client_email && private_key) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: project_id,
        clientEmail: client_email,
        privateKey: private_key.replace(/\\n/g, '\n'),
        privateKeyId: private_key_id,
        clientId: client_id,
        authUri: auth_uri,
        tokenUri: token_uri,
        authProviderX509CertUrl: auth_provider_x509_cert_url,
        clientX509CertUrl: client_x509_cert_url,
        universeDomain: universe_domain,
      }),
    });
  } else {
    console.warn('[FCM] Service account env vars are missing; push test will be disabled');
  }
}

// POST /api/admin/push/test - Send test push to all users with fcmToken
router.post('/push/test', adminAuth, async (req, res) => {
  try {
    if (!admin.apps.length) {
      return res.status(500).json({
        success: false,
        message: 'FCM не инициализирован. Проверьте сервисные env переменные.',
      });
    }

    const { title = 'Antimat', body = 'Тестовое уведомление' } = req.body || {};

    const users = await User.find({ fcmToken: { $exists: true, $ne: null } }).select('fcmToken');
    const tokens = users.map((u) => u.fcmToken).filter(Boolean);

    if (!tokens.length) {
      return res.json({ success: false, message: 'Нет доступных FCM токенов' });
    }

    const message = {
      notification: { title, body },
      data: { type: 'test', ts: Date.now().toString() },
      tokens,
    };

    const result = await admin.messaging().sendEachForMulticast(message);

    res.json({
      success: true,
      data: {
        successCount: result.successCount,
        failureCount: result.failureCount,
        responses: result.responses.map((r) => ({
          success: r.success,
          error: r.error ? r.error.message : null,
        })),
      },
    });
  } catch (error) {
    console.error('Send test push error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка отправки тестового пуша',
      error: error.message,
    });
  }
});

// Создаём папку для загрузок, если её нет
const uploadsDir = path.join(__dirname, '../uploads/apk');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Настройка multer для загрузки APK файлов
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'app-release-' + uniqueSuffix + '.apk');
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/vnd.android.package-archive' || 
        path.extname(file.originalname).toLowerCase() === '.apk') {
      cb(null, true);
    } else {
      cb(new Error('Разрешены только APK файлы'));
    }
  }
});

// POST /api/admin/login - Вход в админ-панель
router.post('/login', async (req, res) => {
  try {
    const { password } = req.body;
    const adminPassword = process.env.ADMIN_PASSWORD;
    
    if (!adminPassword) {
      return res.status(500).json({
        success: false,
        message: 'Админский пароль не настроен'
      });
    }
    
    if (!password || password !== adminPassword) {
      return res.status(401).json({
        success: false,
        message: 'Неверный пароль'
      });
    }
    
    const token = generateAdminToken();
    
    res.json({
      success: true,
      message: 'Вход выполнен успешно',
      data: { token }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при входе'
    });
  }
});

// GET /api/admin/stats - Общая статистика
router.get('/stats', adminAuth, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalGroups = await Group.countDocuments();
    const now = new Date();
    const activePremium = await User.countDocuments({
      premiumExpiresAt: { $gt: now },
      isPremium: true
    });
    
    const penaltiesStats = await Penalty.aggregate([
      {
        $group: {
          _id: null,
          totalCount: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);
    
    const totalPenalties = penaltiesStats[0]?.totalCount || 0;
    const totalPenaltiesAmount = penaltiesStats[0]?.totalAmount || 0;
    
    res.json({
      success: true,
      data: {
        totalUsers,
        totalGroups,
        activePremium,
        totalPenalties,
        totalPenaltiesAmount
      }
    });
  } catch (error) {
    console.error('Get admin stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка получения статистики'
    });
  }
});

// GET /api/admin/users - Список всех пользователей
router.get('/users', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '' } = req.query;
    
    const query = {};
    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } }
      ];
    }
    
    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .populate('groups', 'name');
    
    const total = await User.countDocuments(query);
    
    // Проверяем статус премиум для каждого пользователя
    const now = new Date();
    const usersWithPremiumStatus = users.map(user => {
      const userObj = user.toObject();
      const isPremiumActive = user.premiumExpiresAt && user.premiumExpiresAt > now;
      userObj.isPremium = isPremiumActive;
      userObj.premiumExpiresAt = user.premiumExpiresAt || null;
      return userObj;
    });
    
    res.json({
      success: true,
      data: {
        users: usersWithPremiumStatus,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Get admin users error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка получения пользователей'
    });
  }
});

// POST /api/admin/users/:id/premium - Выдача PRO подписки
router.post('/users/:id/premium', adminAuth, async (req, res) => {
  try {
    const { period } = req.body; // 7d, 14d, 1m, 3m, 6m, 12m
    
    if (!period || !['7d', '14d', '1m', '3m', '6m', '12m'].includes(period)) {
      return res.status(400).json({
        success: false,
        message: 'Неверный период. Доступны: 7d, 14d, 1m, 3m, 6m, 12m'
      });
    }
    
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден'
      });
    }
    
    // Вычисляем период в миллисекундах
    const periodMap = {
      '7d': 7 * 24 * 60 * 60 * 1000,
      '14d': 14 * 24 * 60 * 60 * 1000,
      '1m': 30 * 24 * 60 * 60 * 1000,
      '3m': 90 * 24 * 60 * 60 * 1000,
      '6m': 180 * 24 * 60 * 60 * 1000,
      '12m': 365 * 24 * 60 * 60 * 1000
    };
    
    const periodMs = periodMap[period];
    const now = new Date();
    
    // Если у пользователя уже есть активная подписка - продлеваем
    if (user.premiumExpiresAt && user.premiumExpiresAt > now) {
      user.premiumExpiresAt = new Date(user.premiumExpiresAt.getTime() + periodMs);
    } else {
      // Иначе начинаем с текущей даты
      user.premiumExpiresAt = new Date(now.getTime() + periodMs);
    }
    
    user.isPremium = true;
    await user.save();
    
    res.json({
      success: true,
      message: `PRO подписка выдана на ${period}`,
      data: {
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          isPremium: user.isPremium,
          premiumExpiresAt: user.premiumExpiresAt
        }
      }
    });
  } catch (error) {
    console.error('Give premium error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка выдачи подписки'
    });
  }
});

// DELETE /api/admin/users/:id/premium - Удаление PRO подписки
router.delete('/users/:id/premium', adminAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден'
      });
    }
    
    user.isPremium = false;
    user.premiumExpiresAt = null;
    await user.save();
    
    res.json({
      success: true,
      message: 'PRO подписка удалена',
      data: {
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          isPremium: user.isPremium,
          premiumExpiresAt: user.premiumExpiresAt
        }
      }
    });
  } catch (error) {
    console.error('Remove premium error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка удаления подписки'
    });
  }
});

// POST /api/admin/users/:id/clear-penalties - Очистка штрафов/долга пользователя
router.post('/users/:id/clear-penalties', adminAuth, async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден'
      });
    }

    // Удаляем все штрафы пользователя
    await Penalty.deleteMany({ user: userId });

    // Сбрасываем долг
    user.totalDebt = 0;
    await user.save();

    res.json({
      success: true,
      message: 'Все штрафы и долги очищены'
    });
  } catch (error) {
    console.error('Clear penalties error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка при очистке штрафов'
    });
  }
});

// DELETE /api/admin/users/:id - Полное удаление аккаунта
router.delete('/users/:id', adminAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Пользователь не найден'
      });
    }
    
    // Удаляем пользователя из всех групп
    const groups = await Group.find({ 'members.user': user._id });
    
    for (const group of groups) {
      // Удаляем пользователя из участников
      group.members = group.members.filter(m => !m.user.equals(user._id));
      group.admins = group.admins.filter(a => !a.equals(user._id));
      
      // Если пользователь был владельцем, удаляем группу
      if (group.owner.equals(user._id)) {
        // Удаляем все сообщения группы
        await ChatMessage.deleteMany({ group: group._id });
        // Удаляем все штрафы группы
        await Penalty.deleteMany({ group: group._id });
        // Удаляем группу
        await Group.findByIdAndDelete(group._id);
        // Удаляем группу у всех пользователей
        await User.updateMany(
          { groups: group._id },
          { $pull: { groups: group._id } }
        );
      } else {
        await group.save();
      }
    }
    
    // Удаляем группу из списка пользователя
    await User.updateMany(
      { groups: { $in: user.groups } },
      { $pull: { groups: { $in: user.groups } } }
    );
    
    // Удаляем все штрафы пользователя
    await Penalty.deleteMany({ user: user._id });
    
    // Удаляем все сообщения, где пользователь был отправителем
    await ChatMessage.deleteMany({ sender: user._id });
    
    // Удаляем сам аккаунт
    await User.findByIdAndDelete(user._id);
    
    res.json({
      success: true,
      message: 'Аккаунт полностью удалён'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка удаления аккаунта'
    });
  }
});

// GET /api/admin/updates - Список обновлений
router.get('/updates', adminAuth, async (req, res) => {
  try {
    const updates = await Update.find()
      .sort({ createdAt: -1 })
      .limit(50);
    
    res.json({
      success: true,
      data: { updates }
    });
  } catch (error) {
    console.error('Get updates error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка получения обновлений'
    });
  }
});

// DELETE /api/admin/updates/:id - Удалить обновление
router.delete('/updates/:id', adminAuth, async (req, res) => {
  try {
    const update = await Update.findById(req.params.id);
    
    if (!update) {
      return res.status(404).json({
        success: false,
        message: 'Обновление не найдено'
      });
    }
    
    // Удаляем файл, если он существует
    // Проверяем как по filePath, так и по стандартному пути app-release.apk
    const filePaths = [];
    
    if (update.filePath && fs.existsSync(update.filePath)) {
      filePaths.push(update.filePath);
    }
    
    // Также проверяем стандартный путь, если файл называется app-release.apk
    if (update.fileName === 'app-release.apk') {
      const standardPath = path.join(uploadsDir, 'app-release.apk');
      if (fs.existsSync(standardPath) && !filePaths.includes(standardPath)) {
        filePaths.push(standardPath);
      }
    }
    
    // Удаляем все найденные файлы
    for (const filePath of filePaths) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log('Deleted file:', filePath);
        }
      } catch (err) {
        console.error('Error deleting file:', filePath, err);
        // Продолжаем удаление записи даже если файл не удалился
      }
    }
    
    // Удаляем запись из БД
    await Update.findByIdAndDelete(req.params.id);
    
    res.json({
      success: true,
      message: 'Обновление удалено'
    });
  } catch (error) {
    console.error('Delete update error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка удаления обновления'
    });
  }
});

// POST /api/admin/updates - Загрузка нового обновления
router.post('/updates', adminAuth, upload.single('apk'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'APK файл обязателен'
      });
    }
    
    const { version, title, description } = req.body;
    
    if (!version) {
      // Удаляем загруженный файл
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        message: 'Версия обязательна'
      });
    }
    
    // Проверяем, не существует ли уже такая версия
    const existingUpdate = await Update.findOne({ version });
    if (existingUpdate) {
      // Удаляем загруженный файл
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        message: 'Версия уже существует'
      });
    }
    
    // Проверяем, что загруженный файл существует
    if (!fs.existsSync(req.file.path)) {
      return res.status(400).json({
        success: false,
        message: 'Ошибка загрузки файла'
      });
    }
    
    // Удаляем старый файл app-release.apk, если он есть
    const oldFilePath = path.join(uploadsDir, 'app-release.apk');
    if (fs.existsSync(oldFilePath)) {
      try {
        fs.unlinkSync(oldFilePath);
      } catch (err) {
        console.error('Error deleting old APK:', err);
      }
    }
    
    // Копируем новый файл как app-release.apk
    const newFilePath = path.join(uploadsDir, 'app-release.apk');
    try {
      fs.copyFileSync(req.file.path, newFilePath);
    } catch (err) {
      console.error('Error copying file:', err);
      // Удаляем загруженный файл в случае ошибки
      if (fs.existsSync(req.file.path)) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (unlinkErr) {
          console.error('Error deleting temp file:', unlinkErr);
        }
      }
      return res.status(500).json({
        success: false,
        message: 'Ошибка сохранения файла'
      });
    }
    
    // Удаляем временный файл после успешного копирования
    if (fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (err) {
        console.error('Error deleting temp file:', err);
      }
    }
    
    // Удаляем все остальные старые временные файлы
    try {
      const files = fs.readdirSync(uploadsDir);
      files.forEach(file => {
        if (file.startsWith('app-release-') && file !== 'app-release.apk') {
          try {
            fs.unlinkSync(path.join(uploadsDir, file));
          } catch (err) {
            // Игнорируем ошибки удаления старых файлов
          }
        }
      });
    } catch (err) {
      // Игнорируем ошибки чтения директории
    }
    
    // Создаём запись об обновлении
    const update = await Update.create({
      version,
      title: title || '',
      description: description || '',
      filePath: newFilePath,
      fileName: 'app-release.apk',
      fileSize: req.file.size
    });
    
    res.status(201).json({
      success: true,
      message: 'Обновление загружено',
      data: { update }
    });
  } catch (error) {
    console.error('Upload update error:', error);
    // Удаляем загруженный файл в случае ошибки
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (err) {
        console.error('Error deleting temp file on error:', err);
      }
    }
    res.status(500).json({
      success: false,
      message: 'Ошибка загрузки обновления'
    });
  }
});

module.exports = router;

