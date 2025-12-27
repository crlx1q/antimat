// ============================================
// ANTIMAT - Admin Panel
// ============================================

const API_BASE = '/api';

class AdminAPI {
  constructor() {
    this.token = localStorage.getItem('admin-token');
  }

  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('admin-token', token);
    } else {
      localStorage.removeItem('admin-token');
    }
  }

  getHeaders() {
    const headers = {
      'Content-Type': 'application/json'
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        ...options,
        headers: this.getHeaders()
      });
      
      const data = await response.json();
      
      // Проверяем если токен истёк или недействителен (401)
      if (response.status === 401) {
        this.setToken(null); // Очищаем токен
        showLoginModal(); // Показываем форму входа
        throw new Error(data.message || 'Требуется авторизация');
      }
      
      if (!response.ok) {
        throw new Error(data.message || 'Ошибка сервера');
      }
      
      return data;
    } catch (error) {
      throw error;
    }
  }

  async login(password) {
    const data = await this.request('/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password })
    });
    
    if (data.success && data.data.token) {
      this.setToken(data.data.token);
    }
    
    return data;
  }

  async getStats() {
    return await this.request('/admin/stats');
  }

  async getUsers(page = 1, limit = 50, search = '') {
    let url = `/admin/users?page=${page}&limit=${limit}`;
    if (search) {
      url += `&search=${encodeURIComponent(search)}`;
    }
    return await this.request(url);
  }

  async givePremium(userId, period) {
    return await this.request(`/admin/users/${userId}/premium`, {
      method: 'POST',
      body: JSON.stringify({ period })
    });
  }

  async deleteUser(userId) {
    return await this.request(`/admin/users/${userId}`, {
      method: 'DELETE'
    });
  }

  async removePremium(userId) {
    return await this.request(`/admin/users/${userId}/premium`, {
      method: 'DELETE'
    });
  }

  async getUpdates() {
    return await this.request('/admin/updates');
  }

  async deleteUpdate(updateId) {
    return await this.request(`/admin/updates/${updateId}`, {
      method: 'DELETE'
    });
  }

  async uploadUpdate(version, title, description, file, onProgress) {
    const formData = new FormData();
    formData.append('version', version);
    formData.append('title', title || '');
    formData.append('description', description || '');
    formData.append('apk', file);

    const url = `${API_BASE}/admin/updates`;
    const headers = {};
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && typeof onProgress === 'function') {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };
      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          try {
            const data = JSON.parse(xhr.responseText || '{}');
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(data);
            } else {
              reject(new Error(data.message || 'Ошибка загрузки'));
            }
          } catch (e) {
            reject(new Error('Ошибка обработки ответа'));
          }
        }
      };
      xhr.onerror = () => reject(new Error('Ошибка сети'));
      xhr.send(formData);
    });
  }

  logout() {
    this.setToken(null);
  }
}

// Initialize API
const adminAPI = new AdminAPI();

// State
let currentPage = 'stats';
let currentUserPage = 1;
let currentUserId = null;
let searchTimeout = null;

// DOM Elements
const loginModal = document.getElementById('loginModal');
const adminPanel = document.getElementById('adminPanel');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const logoutBtn = document.getElementById('logoutBtn');
const navItems = document.querySelectorAll('.nav-item');
const pages = document.querySelectorAll('.admin-page');

// ============================================
// Initialization
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  // Check if already logged in
  if (adminAPI.token) {
    showAdminPanel();
    loadPage('stats');
  } else {
    showLoginModal();
  }

  // Setup event listeners
  setupEventListeners();
});

// ============================================
// Event Listeners
// ============================================

function setupEventListeners() {
  // Login form
  loginForm.addEventListener('submit', handleLogin);

  // Logout
  logoutBtn.addEventListener('click', handleLogout);

  // Navigation
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const page = item.dataset.page;
      loadPage(page);
    });
  });

  // User search
  const userSearch = document.getElementById('userSearch');
  if (userSearch) {
    userSearch.addEventListener('input', (e) => {
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
      const searchValue = e.target.value.trim();
      searchTimeout = setTimeout(() => {
        loadUsers(1, searchValue);
      }, 500);
    });
  }

  // Upload update form
  const uploadForm = document.getElementById('uploadUpdateForm');
  if (uploadForm) {
    uploadForm.addEventListener('submit', handleUploadUpdate);
  }

  // User actions - используем делегирование событий
  document.addEventListener('click', (e) => {
    // Проверяем, кликнули ли на overlay модального окна (но не на сам modal)
    const modal = document.getElementById('userActionsModal');
    if (modal && e.target === modal) {
      closeUserActions();
      return;
    }

    // Проверяем кнопку закрытия
    if (e.target.id === 'closeUserActions' || e.target.closest('#closeUserActions') || e.target.closest('.modal-close')) {
      closeUserActions();
      return;
    }

    // Проверяем, кликнули ли на кнопку действий или её дочерний элемент
    const actionBtn = e.target.closest('.action-btn');
    if (actionBtn) {
      const userId = actionBtn.dataset.userId;
      if (userId) {
        showUserActions(userId);
      }
      return;
    }

    // Проверяем кнопки периодов
    const periodBtn = e.target.closest('.period-btn');
    if (periodBtn) {
      const period = periodBtn.dataset.period;
      if (period) {
        givePremiumToUser(period);
      }
      return;
    }

    // Проверяем кнопку удаления подписки
    if (e.target.id === 'removePremiumBtn' || e.target.closest('#removePremiumBtn')) {
      removePremiumFromUser();
      return;
    }

    // Проверяем кнопку удаления
    if (e.target.id === 'deleteUserBtn' || e.target.closest('#deleteUserBtn')) {
      deleteCurrentUser();
      return;
    }
  });

  // Закрытие модального окна при нажатии ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('userActionsModal');
      if (modal && modal.style.display === 'flex') {
        closeUserActions();
      }
    }
  });
}

// ============================================
// Authentication
// ============================================

async function handleLogin(e) {
  e.preventDefault();
  
  const password = document.getElementById('adminPassword').value;
  loginError.textContent = '';
  
  try {
    const result = await adminAPI.login(password);
    
    if (result.success) {
      showAdminPanel();
      loadPage('stats');
    }
  } catch (error) {
    loginError.textContent = error.message || 'Ошибка входа';
  }
}

function handleLogout() {
  if (confirm('Вы уверены, что хотите выйти?')) {
    adminAPI.logout();
    showLoginModal();
    document.getElementById('adminPassword').value = '';
  }
}

function showLoginModal() {
  loginModal.style.display = 'flex';
  adminPanel.style.display = 'none';
}

function showAdminPanel() {
  loginModal.style.display = 'none';
  adminPanel.style.display = 'flex';
}

// ============================================
// Navigation
// ============================================

function loadPage(page) {
  currentPage = page;
  
  // Update nav
  navItems.forEach(item => {
    if (item.dataset.page === page) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
  
  // Show page
  pages.forEach(p => {
    if (p.id === `page-${page}`) {
      p.classList.add('active');
    } else {
      p.classList.remove('active');
    }
  });
  
  // Load page data
  switch(page) {
    case 'stats':
      loadStats();
      break;
    case 'users':
      loadUsers();
      break;
    case 'updates':
      loadUpdates();
      break;
  }
}

// ============================================
// Stats Page
// ============================================

async function loadStats() {
  try {
    const result = await adminAPI.getStats();
    
    if (result.success) {
      const stats = result.data;
      document.getElementById('statTotalUsers').textContent = stats.totalUsers;
      document.getElementById('statTotalGroups').textContent = stats.totalGroups;
      document.getElementById('statActivePremium').textContent = stats.activePremium;
      document.getElementById('statTotalPenalties').textContent = stats.totalPenalties;
      document.getElementById('statTotalAmount').textContent = stats.totalPenaltiesAmount.toLocaleString('ru-RU');
    }
  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

// ============================================
// Users Page
// ============================================

async function loadUsers(page = 1, search = '') {
  currentUserPage = page;
  
  try {
    const result = await adminAPI.getUsers(page, 50, search);
    
    if (result.success) {
      renderUsers(result.data.users);
      renderPagination(result.data.pagination);
    }
  } catch (error) {
    console.error('Error loading users:', error);
    document.getElementById('usersTableBody').innerHTML = 
      `<tr><td colspan="7" class="empty-state">Ошибка загрузки: ${error.message}</td></tr>`;
  }
}

function renderUsers(users) {
  const tbody = document.getElementById('usersTableBody');
  
  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Пользователи не найдены</td></tr>';
    return;
  }
  
  tbody.innerHTML = users.map(user => {
    const now = new Date();
    const isPremiumActive = user.premiumExpiresAt && new Date(user.premiumExpiresAt) > now;
    const premiumExpires = user.premiumExpiresAt 
      ? new Date(user.premiumExpiresAt).toLocaleDateString('ru-RU')
      : null;
    
    return `
      <tr>
        <td class="user-email">${escapeHtml(user.email)}</td>
        <td class="user-name">${escapeHtml(user.name)}</td>
        <td>
          ${isPremiumActive 
            ? `<span class="premium-badge">PRO</span><div class="premium-expires">до ${premiumExpires}</div>`
            : '<span style="color: var(--text-muted);">—</span>'
          }
        </td>
        <td>${user.groups ? user.groups.length : 0}</td>
        <td>${user.totalDebt || 0} ₸</td>
        <td>${new Date(user.createdAt).toLocaleDateString('ru-RU')}</td>
        <td>
          <button class="action-btn" data-user-id="${user._id || user.id}">Действия</button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderPagination(pagination) {
  const container = document.getElementById('usersPagination');
  
  if (pagination.pages <= 1) {
    container.innerHTML = '';
    return;
  }
  
  let html = '';
  
  // Previous button
  html += `<button class="pagination-btn" ${pagination.page === 1 ? 'disabled' : ''} onclick="loadUsers(${pagination.page - 1})">Назад</button>`;
  
  // Page numbers
  for (let i = 1; i <= pagination.pages; i++) {
    if (i === 1 || i === pagination.pages || (i >= pagination.page - 2 && i <= pagination.page + 2)) {
      html += `<button class="pagination-btn ${i === pagination.page ? 'active' : ''}" onclick="loadUsers(${i})">${i}</button>`;
    } else if (i === pagination.page - 3 || i === pagination.page + 3) {
      html += `<span style="padding: 8px 12px; color: var(--text-muted);">...</span>`;
    }
  }
  
  // Next button
  html += `<button class="pagination-btn" ${pagination.page === pagination.pages ? 'disabled' : ''} onclick="loadUsers(${pagination.page + 1})">Вперёд</button>`;
  
  container.innerHTML = html;
}

// ============================================
// User Actions
// ============================================

async function showUserActions(userId) {
  currentUserId = userId;
  
  try {
    const result = await adminAPI.getUsers(1, 1000);
    const user = result.data.users.find(u => (u._id || u.id) === userId);
    
    if (!user) {
      alert('Пользователь не найден');
      return;
    }
    
    const now = new Date();
    const isPremiumActive = user.premiumExpiresAt && new Date(user.premiumExpiresAt) > now;
    const premiumExpires = user.premiumExpiresAt 
      ? new Date(user.premiumExpiresAt).toLocaleDateString('ru-RU')
      : 'Нет';
    
    document.getElementById('userInfo').innerHTML = `
      <div class="user-info-item">
        <span class="user-info-label">Email:</span>
        <span class="user-info-value">${escapeHtml(user.email)}</span>
      </div>
      <div class="user-info-item">
        <span class="user-info-label">Имя:</span>
        <span class="user-info-value">${escapeHtml(user.name)}</span>
      </div>
      <div class="user-info-item">
        <span class="user-info-label">PRO статус:</span>
        <span class="user-info-value">${isPremiumActive ? `Активен до ${premiumExpires}` : 'Неактивен'}</span>
      </div>
      <div class="user-info-item">
        <span class="user-info-label">Групп:</span>
        <span class="user-info-value">${user.groups ? user.groups.length : 0}</span>
      </div>
      <div class="user-info-item">
        <span class="user-info-label">Долг:</span>
        <span class="user-info-value">${user.totalDebt || 0} ₸</span>
      </div>
    `;
    
    document.getElementById('userActionsModal').style.display = 'flex';
  } catch (error) {
    alert('Ошибка загрузки данных пользователя: ' + error.message);
  }
}

function closeUserActions() {
  const modal = document.getElementById('userActionsModal');
  if (modal) {
    modal.style.display = 'none';
  }
  currentUserId = null;
}

async function givePremiumToUser(period) {
  if (!currentUserId) return;
  
  if (!confirm(`Выдать PRO подписку на ${period}?`)) {
    return;
  }
  
  try {
    const result = await adminAPI.givePremium(currentUserId, period);
    
    if (result.success) {
      alert('PRO подписка успешно выдана!');
      closeUserActions();
      loadUsers(currentUserPage);
    }
  } catch (error) {
    alert('Ошибка выдачи подписки: ' + error.message);
  }
}

async function removePremiumFromUser() {
  if (!currentUserId) return;
  
  if (!confirm('Вы уверены, что хотите забрать PRO подписку у этого пользователя?')) {
    return;
  }
  
  try {
    const result = await adminAPI.removePremium(currentUserId);
    
    if (result.success) {
      alert('PRO подписка успешно удалена!');
      closeUserActions();
      loadUsers(currentUserPage);
      loadStats();
    }
  } catch (error) {
    alert('Ошибка удаления подписки: ' + error.message);
  }
}

async function deleteCurrentUser() {
  if (!currentUserId) return;
  
  if (!confirm('ВНИМАНИЕ! Это действие удалит аккаунт пользователя полностью, включая все его данные, группы, штрафы и сообщения. Продолжить?')) {
    return;
  }
  
  if (!confirm('Вы уверены? Это действие необратимо!')) {
    return;
  }
  
  try {
    const result = await adminAPI.deleteUser(currentUserId);
    
    if (result.success) {
      alert('Аккаунт успешно удалён!');
      closeUserActions();
      loadUsers(currentUserPage);
      loadStats();
    }
  } catch (error) {
    alert('Ошибка удаления: ' + error.message);
  }
}

// ============================================
// Updates Page
// ============================================

async function loadUpdates() {
  try {
    const result = await adminAPI.getUpdates();
    
    if (result.success) {
      renderUpdates(result.data.updates);
    }
  } catch (error) {
    console.error('Error loading updates:', error);
    document.getElementById('updatesList').innerHTML = 
      `<div class="empty-state">Ошибка загрузки: ${error.message}</div>`;
  }
}

function renderUpdates(updates) {
  const container = document.getElementById('updatesList');
  
  if (updates.length === 0) {
    container.innerHTML = '<div class="empty-state">Обновления не найдены</div>';
    return;
  }
  
  container.innerHTML = updates.map(update => {
    const date = new Date(update.createdAt).toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    const fileSize = (update.fileSize / 1024 / 1024).toFixed(2);
    
    return `
      <div class="update-item">
        <div class="update-item-info">
          <div class="update-item-version">v${escapeHtml(update.version)}</div>
          ${update.title ? `<div class="update-item-title">${escapeHtml(update.title)}</div>` : ''}
          ${update.description ? `<div class="update-item-description">${escapeHtml(update.description)}</div>` : ''}
          <div class="update-item-meta">Загружено: ${date} • ${fileSize} MB</div>
        </div>
        <button class="btn btn-danger btn-sm" onclick="deleteUpdate('${update._id || update.id}')" title="Удалить обновление">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px;">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </div>
    `;
  }).join('');
}

async function deleteUpdate(updateId) {
  if (!confirm('Вы уверены, что хотите удалить это обновление? Файл и запись в базе данных будут удалены.')) {
    return;
  }
  
  try {
    const result = await adminAPI.deleteUpdate(updateId);
    
    if (result.success) {
      alert('Обновление успешно удалено!');
      loadUpdates();
    }
  } catch (error) {
    alert('Ошибка удаления: ' + error.message);
  }
}

// Делаем функцию доступной глобально
window.deleteUpdate = deleteUpdate;

async function handleUploadUpdate(e) {
  e.preventDefault();
  
  const version = document.getElementById('updateVersion').value;
  const title = document.getElementById('updateTitle').value;
  const description = document.getElementById('updateDescription').value;
  const file = document.getElementById('updateFile').files[0];
  const progressBar = document.getElementById('uploadProgress');
  const progressText = document.getElementById('uploadProgressText');
  
  if (!file) {
    alert('Выберите APK файл');
    return;
  }
  
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Загрузка...';
  if (progressBar) {
    progressBar.style.display = 'block';
    progressBar.value = 0;
  }
  if (progressText) {
    progressText.textContent = '0%';
  }
  
  try {
    const result = await adminAPI.uploadUpdate(version, title, description, file, (p) => {
      if (progressBar) progressBar.value = p;
      if (progressText) progressText.textContent = `${p}%`;
    });
    
    if (result.success) {
      alert('Обновление успешно загружено!');
      e.target.reset();
      loadUpdates();
    }
  } catch (error) {
    alert('Ошибка загрузки: ' + error.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
    // keep final progress
  }
}

// ============================================
// Utilities
// ============================================

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Make loadUsers available globally for pagination
window.loadUsers = loadUsers;

