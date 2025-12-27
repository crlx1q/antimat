// Middleware для логирования IP и запросов

const getClientIP = (req) => {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || 
         req.headers['x-real-ip'] || 
         req.connection?.remoteAddress || 
         req.socket?.remoteAddress ||
         'unknown';
};

const formatDate = () => {
  const now = new Date();
  return now.toLocaleString('ru-RU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m'
};

const getMethodColor = (method) => {
  switch (method) {
    case 'GET': return colors.green;
    case 'POST': return colors.blue;
    case 'PUT': return colors.yellow;
    case 'DELETE': return colors.red;
    case 'PATCH': return colors.magenta;
    default: return colors.white;
  }
};

const getStatusColor = (status) => {
  if (status >= 500) return colors.red;
  if (status >= 400) return colors.yellow;
  if (status >= 300) return colors.cyan;
  if (status >= 200) return colors.green;
  return colors.white;
};

const requestLogger = (serverType = 'API') => {
  return (req, res, next) => {
    const startTime = Date.now();
    const ip = getClientIP(req);
    
    // Логируем после завершения ответа
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const status = res.statusCode;
      const methodColor = getMethodColor(req.method);
      const statusColor = getStatusColor(status);
      
      console.log(
        `${colors.gray}[${formatDate()}]${colors.reset} ` +
        `${colors.bright}[${serverType}]${colors.reset} ` +
        `${colors.cyan}${ip}${colors.reset} ` +
        `${methodColor}${req.method}${colors.reset} ` +
        `${req.originalUrl} ` +
        `${statusColor}${status}${colors.reset} ` +
        `${colors.gray}${duration}ms${colors.reset}`
      );
    });
    
    next();
  };
};

// Логирование статуса MongoDB
const logMongoStatus = (isConnected) => {
  const status = isConnected ? 
    `${colors.green}● ONLINE${colors.reset}` : 
    `${colors.red}● OFFLINE${colors.reset}`;
  
  console.log(
    `${colors.gray}[${formatDate()}]${colors.reset} ` +
    `${colors.bright}[MongoDB]${colors.reset} ` +
    `Status: ${status}`
  );
};

// Логирование запуска сервера
const logServerStart = (serverType, port) => {
  console.log(
    `${colors.gray}[${formatDate()}]${colors.reset} ` +
    `${colors.bright}[${serverType}]${colors.reset} ` +
    `${colors.green}Server started on port ${port}${colors.reset}`
  );
};

module.exports = {
  requestLogger,
  logMongoStatus,
  logServerStart,
  getClientIP,
  colors
};

