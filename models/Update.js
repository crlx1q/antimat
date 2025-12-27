const mongoose = require('mongoose');

const updateSchema = new mongoose.Schema({
  // Версия обновления (например, "1.0.0")
  version: {
    type: String,
    required: true,
    unique: true
  },
  // Название обновления (необязательно)
  title: {
    type: String,
    default: ''
  },
  // Описание обновления
  description: {
    type: String,
    default: ''
  },
  // Путь к APK файлу
  filePath: {
    type: String,
    required: true
  },
  // Имя файла
  fileName: {
    type: String,
    required: true
  },
  // Размер файла в байтах
  fileSize: {
    type: Number,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Индекс для быстрого поиска последней версии
updateSchema.index({ createdAt: -1 });

// Статический метод для получения последней версии
updateSchema.statics.getLatest = async function() {
  return await this.findOne().sort({ createdAt: -1 });
};

module.exports = mongoose.model('Update', updateSchema);

