const express = require('express');
const router = express.Router();
const Update = require('../models/Update');

// GET /api/updates/check - Проверка доступности обновления
// Принимает query параметр currentVersion (например, "1.0.0")
router.get('/check', async (req, res) => {
  try {
    const { currentVersion } = req.query;
    
    if (!currentVersion) {
      return res.status(400).json({
        success: false,
        message: 'Текущая версия обязательна'
      });
    }
    
    // Получаем последнюю версию из БД
    const latestUpdate = await Update.getLatest();
    
    if (!latestUpdate) {
      return res.json({
        success: true,
        data: {
          hasUpdate: false,
          message: 'Обновления не найдены'
        }
      });
    }
    
    // Сравниваем версии
    const hasUpdate = compareVersions(latestUpdate.version, currentVersion) > 0;
    
    if (!hasUpdate) {
      return res.json({
        success: true,
        data: {
          hasUpdate: false,
          currentVersion,
          latestVersion: latestUpdate.version
        }
      });
    }
    
    // Формируем URL для скачивания
    // Используем порт сайта (3000) вместо порта API (3001)
    const host = req.get('host').split(':')[0]; // Получаем только хост без порта
    const sitePort = process.env.SITE_PORT || 3000;
    const downloadUrl = `${req.protocol}://${host}:${sitePort}/download/app-release.apk`;
    
    res.json({
      success: true,
      data: {
        hasUpdate: true,
        currentVersion,
        latestVersion: latestUpdate.version,
        title: latestUpdate.title || 'Доступно обновление',
        description: latestUpdate.description || 'Новая версия приложения доступна для скачивания',
        downloadUrl,
        fileSize: latestUpdate.fileSize,
        fileName: latestUpdate.fileName
      }
    });
  } catch (error) {
    console.error('Check update error:', error);
    res.status(500).json({
      success: false,
      message: 'Ошибка проверки обновления'
    });
  }
});

// Функция для сравнения версий (например, "1.0.1" vs "1.0.0")
function compareVersions(version1, version2) {
  const v1Parts = version1.split('.').map(Number);
  const v2Parts = version2.split('.').map(Number);
  
  const maxLength = Math.max(v1Parts.length, v2Parts.length);
  
  for (let i = 0; i < maxLength; i++) {
    const v1Part = v1Parts[i] || 0;
    const v2Part = v2Parts[i] || 0;
    
    if (v1Part > v2Part) return 1;
    if (v1Part < v2Part) return -1;
  }
  
  return 0;
}

module.exports = router;

