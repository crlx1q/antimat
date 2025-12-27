const jwt = require('jsonwebtoken');

// Middleware для проверки админского пароля
const adminAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Требуется авторизация' 
      });
    }
    
    const token = authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Токен не предоставлен' 
      });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Проверяем, что это админский токен (содержит admin: true)
    if (!decoded.admin) {
      return res.status(403).json({ 
        success: false, 
        message: 'Доступ запрещён' 
      });
    }
    
    req.adminId = decoded.adminId;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Недействительный токен' 
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Токен истёк' 
      });
    }
    
    console.error('Admin auth middleware error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Ошибка авторизации' 
    });
  }
};

// Генерация JWT токена для админа
const generateAdminToken = () => {
  return jwt.sign(
    { adminId: 'admin', admin: true },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

module.exports = { adminAuth, generateAdminToken };

