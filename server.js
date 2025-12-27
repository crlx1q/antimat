require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const os = require('os');

const { requestLogger, logMongoStatus, logServerStart, colors } = require('./middleware/logger');

// Импорт маршрутов
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const wordsRoutes = require('./routes/words');
const penaltiesRoutes = require('./routes/penalties');
const groupsRoutes = require('./routes/groups');
const adminRoutes = require('./routes/admin');
const updatesRoutes = require('./routes/updates');
const Update = require('./models/Update');
const fs = require('fs');

// Создаём приложения для API и сайта
const apiApp = express();
const siteApp = express();

// Порты
const API_PORT = process.env.API_PORT || 3001;
const SITE_PORT = process.env.SITE_PORT || 3000;

// ============================================
// API Server Configuration
// ============================================

// Middleware для API
apiApp.use(cors({
  origin: '*', // В продакшене указать конкретные домены
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
apiApp.use(express.json());
apiApp.use(requestLogger('API'));

// API Routes
apiApp.use('/api/auth', authRoutes);
apiApp.use('/api/user', userRoutes);
apiApp.use('/api/words', wordsRoutes);
apiApp.use('/api/penalties', penaltiesRoutes);
apiApp.use('/api/groups', groupsRoutes);
apiApp.use('/api/admin', adminRoutes);
apiApp.use('/api/updates', updatesRoutes);

// Health check
apiApp.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// API 404 handler
apiApp.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint не найден'
  });
});

// API error handler
apiApp.use((err, req, res, next) => {
  console.error(`${colors.red}[API Error]${colors.reset}`, err);
  res.status(500).json({
    success: false,
    message: 'Внутренняя ошибка сервера'
  });
});

// ============================================
// Static Site Server Configuration
// ============================================

siteApp.use(requestLogger('SITE'));
// Проксируем /api на apiApp ДО статики/фолбэков
siteApp.use('/api', apiApp);

// В продакшене сервер находится в корне рядом с папкой website
// Поэтому используем путь без подъёма на уровень выше
const websitePath = path.join(__dirname, 'website');
siteApp.use(express.static(websitePath));

// Маршрут для скачивания APK файла
siteApp.get('/download/app-release.apk', async (req, res) => {
  try {
    const apkPath = path.join(__dirname, 'uploads/apk/app-release.apk');
    
    // Проверяем существование файла
    if (!fs.existsSync(apkPath)) {
      console.error('APK file not found at:', apkPath);
      return res.status(404).json({
        success: false,
        message: 'APK файл не найден'
      });
    }
    
    // Проверяем, что это файл, а не директория
    const stats = fs.statSync(apkPath);
    if (!stats.isFile()) {
      return res.status(404).json({
        success: false,
        message: 'APK файл не найден'
      });
    }
    
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', `attachment; filename="app-release.apk"`);
    res.setHeader('Content-Length', stats.size);
    res.sendFile(apkPath);
  } catch (error) {
    console.error('Download APK error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка скачивания файла'
    });
  }
});

// Обработка invite ссылок
siteApp.get('/invite/:code', (req, res) => {
  const { code } = req.params;
  // Можно редиректить на app scheme или показать страницу
  res.sendFile(path.join(websitePath, 'invite.html'));
});

// Админ-панель
siteApp.get('/admin', (req, res) => {
  res.sendFile(path.join(websitePath, 'admin.html'));
});

// Dashboard без .html
siteApp.get('/dashboard', (req, res) => {
  res.sendFile(path.join(websitePath, 'dashboard.html'));
});

// SPA fallback
siteApp.get('*', (req, res) => {
  res.sendFile(path.join(websitePath, 'index.html'));
});

// ============================================
// MongoDB Connection
// ============================================

let isMongoConnected = false;

const connectDB = async () => {
  try {
    // Получаем данные из переменных окружения
    let mongoURI = process.env.MONGODB_URI;
    
    // Если нет полного URI, собираем из отдельных переменных
    if (!mongoURI) {
      const mongoUser = process.env.MONGODB_USER;
      const mongoPassword = process.env.MONGODB_PASSWORD;
      const mongoCluster = process.env.MONGODB_CLUSTER;
      const mongoDBName = process.env.MONGODB_DB_NAME || 'antimat';
      
      if (!mongoUser || !mongoPassword || !mongoCluster) {
        throw new Error('Необходимо установить MONGODB_URI или MONGODB_USER, MONGODB_PASSWORD, MONGODB_CLUSTER в переменных окружения');
      }
      
      mongoURI = `mongodb+srv://${mongoUser}:${encodeURIComponent(mongoPassword)}@${mongoCluster}/${mongoDBName}?retryWrites=true&w=majority&appName=Cluster0`;
    }
    
    await mongoose.connect(mongoURI);
    
    isMongoConnected = true;
    logMongoStatus(true);
    
    // Обработка событий подключения
    mongoose.connection.on('disconnected', () => {
      isMongoConnected = false;
      logMongoStatus(false);
    });
    
    mongoose.connection.on('reconnected', () => {
      isMongoConnected = true;
      logMongoStatus(true);
    });
    
    mongoose.connection.on('error', (err) => {
      console.error(`${colors.red}[MongoDB Error]${colors.reset}`, err.message);
    });
    
  } catch (error) {
    isMongoConnected = false;
    logMongoStatus(false);
    console.error(`${colors.red}[MongoDB]${colors.reset} Connection error:`, error.message);
    
    // Повторная попытка через 5 секунд
    console.log(`${colors.yellow}[MongoDB]${colors.reset} Retrying connection in 5 seconds...`);
    setTimeout(connectDB, 5000);
  }
};

// ============================================
// Start Servers
// ============================================

const startServers = async () => {
  // Логотип
  console.log(`
${colors.red}    _    _   _ _____ ___ __  __    _  _____ ${colors.reset}
${colors.red}   / \\  | \\ | |_   _|_ _|  \\/  |  / \\|_   _|${colors.reset}
${colors.red}  / _ \\ |  \\| | | |  | || |\\/| | / _ \\ | |  ${colors.reset}
${colors.red} / ___ \\| |\\  | | |  | || |  | |/ ___ \\| |  ${colors.reset}
${colors.red}/_/   \\_\\_| \\_| |_| |___|_|  |_/_/   \\_\\_|  ${colors.reset}
${colors.gray}         Контроль нецензурной лексики${colors.reset}
  `);
  
  // Подключаемся к MongoDB
  await connectDB();
  
  // Запускаем API сервер на всех интерфейсах (0.0.0.0)
  apiApp.listen(API_PORT, '0.0.0.0', () => {
    logServerStart('API', API_PORT);
  });
  
  // Запускаем сайт на всех интерфейсах (0.0.0.0)
  siteApp.listen(SITE_PORT, '0.0.0.0', () => {
    logServerStart('SITE', SITE_PORT);
  });
  
  // Получаем локальный IP адрес
  const networkInterfaces = os.networkInterfaces();
  let localIP = 'localhost';
  
  for (const interfaceName in networkInterfaces) {
    const interfaces = networkInterfaces[interfaceName];
    for (const iface of interfaces) {
      if (iface.family === 'IPv4' && !iface.internal) {
        localIP = iface.address;
        break;
      }
    }
    if (localIP !== 'localhost') break;
  }
  
  console.log(`${colors.gray}────────────────────────────────────────────${colors.reset}`);
  console.log(`${colors.cyan}API:${colors.reset}  http://localhost:${API_PORT}/api`);
  console.log(`${colors.cyan}API:${colors.reset}  http://${localIP}:${API_PORT}/api`);
  console.log(`${colors.cyan}Site:${colors.reset} http://localhost:${SITE_PORT}`);
  console.log(`${colors.cyan}Site:${colors.reset} http://${localIP}:${SITE_PORT}`);
  console.log(`${colors.gray}────────────────────────────────────────────${colors.reset}`);
};

startServers();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log(`\n${colors.yellow}[Server]${colors.reset} Shutting down...`);
  await mongoose.connection.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log(`\n${colors.yellow}[Server]${colors.reset} Shutting down...`);
  await mongoose.connection.close();
  process.exit(0);
});

