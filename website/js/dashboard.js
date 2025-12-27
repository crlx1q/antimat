// ============================================
// ANTIMAT - Dashboard JavaScript
// ============================================

// State
let currentUser = null;
let currentGroup = null;
let weeklyChart = null;
let chatPollingActive = false;
let lastMessageId = null;

// DOM Elements
const authModal = document.getElementById('authModal');
const dashboard = document.getElementById('dashboard');
const authForm = document.getElementById('authForm');
const authTitle = document.getElementById('authTitle');
const authSubmit = document.getElementById('authSubmit');
const authSwitchBtn = document.getElementById('authSwitchBtn');
const authSwitchText = document.getElementById('authSwitchText');
const authError = document.getElementById('authError');
const nameGroup = document.getElementById('nameGroup');

let isLoginMode = true;

// ============================================
// Initialization
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  initNavigation();
  initTheme();
  initModals();
  initWords();
  initSettings();
  initGroups();
});

// ============================================
// Authentication
// ============================================

function initAuth() {
  // Check if already logged in
  const token = localStorage.getItem('antimat-token');
  if (token) {
    loadUser();
  } else {
    showAuthModal();
  }

  // Auth form submission
  authForm.addEventListener('submit', handleAuth);

  // Toggle login/register
  authSwitchBtn.addEventListener('click', () => {
    isLoginMode = !isLoginMode;
    updateAuthMode();
  });

  // Logout buttons
  document.getElementById('logoutBtn').addEventListener('click', logout);
  document.getElementById('logoutBtnSettings').addEventListener('click', logout);
}

function updateAuthMode() {
  if (isLoginMode) {
    authTitle.textContent = 'Вход';
    authSubmit.textContent = 'Войти';
    authSwitchText.textContent = 'Нет аккаунта?';
    authSwitchBtn.textContent = 'Регистрация';
    nameGroup.style.display = 'none';
  } else {
    authTitle.textContent = 'Регистрация';
    authSubmit.textContent = 'Создать аккаунт';
    authSwitchText.textContent = 'Уже есть аккаунт?';
    authSwitchBtn.textContent = 'Войти';
    nameGroup.style.display = 'block';
  }
  authError.textContent = '';
}

async function handleAuth(e) {
  e.preventDefault();
  
  const email = document.getElementById('authEmail').value;
  const password = document.getElementById('authPassword').value;
  const name = document.getElementById('authName').value;
  
  authError.textContent = '';
  authSubmit.disabled = true;
  authSubmit.textContent = 'Загрузка...';
  
  try {
    let data;
    if (isLoginMode) {
      data = await api.login(email, password);
    } else {
      if (!name.trim()) {
        throw new Error('Введите имя');
      }
      data = await api.register(email, password, name);
    }
    
    currentUser = data.data.user;
    localStorage.setItem('antimat-user', JSON.stringify(currentUser));
    hideAuthModal();
    updateUserUI();
    loadStats();
    loadWords();
    loadGroups();
  } catch (error) {
    authError.textContent = error.message;
  } finally {
    authSubmit.disabled = false;
    authSubmit.textContent = isLoginMode ? 'Войти' : 'Создать аккаунт';
  }
}

async function loadUser() {
  try {
    const data = await api.getMe();
    currentUser = data.data.user;
    localStorage.setItem('antimat-user', JSON.stringify(currentUser));
    hideAuthModal();
    updateUserUI();
    loadStats();
    loadWords();
    loadGroups();
  } catch (error) {
    // Token invalid, show login
    api.logout();
    showAuthModal();
  }
}

function logout() {
  api.logout();
  currentUser = null;
  showAuthModal();
}

function showAuthModal() {
  authModal.style.display = 'flex';
  dashboard.style.display = 'none';
}

function hideAuthModal() {
  authModal.style.display = 'none';
  dashboard.style.display = 'grid';
}

function updateUserUI() {
  if (!currentUser) return;
  
  document.getElementById('userName').textContent = currentUser.name;
  document.getElementById('userDebt').textContent = currentUser.totalDebt.toLocaleString();
  document.getElementById('userAvatar').textContent = currentUser.name.charAt(0).toUpperCase();
  document.getElementById('userEmail').textContent = currentUser.email;
  document.getElementById('penaltyAmount').value = currentUser.penaltyAmount;
  document.getElementById('soundEnabled').checked = currentUser.settings?.soundEnabled ?? true;
  document.getElementById('notificationsEnabled').checked = currentUser.settings?.notificationsEnabled ?? true;
  
  // Show/hide premium banner
  const premiumBanner = document.getElementById('premiumBanner');
  if (premiumBanner) {
    premiumBanner.style.display = currentUser.isPremium ? 'none' : 'block';
  }
  
  // Update penalty change hint
  updatePenaltyHint();
}

function updatePenaltyHint() {
  if (!currentUser) return;
  
  const hint = document.getElementById('penaltyChangeHint');
  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  const lastUpdate = new Date(currentUser.penaltyAmountUpdatedAt || Date.now());
  const nextUpdate = new Date(lastUpdate.getTime() + oneWeek);
  
  if (Date.now() >= nextUpdate.getTime()) {
    hint.textContent = 'Можно изменить сейчас';
    hint.style.color = 'var(--success)';
  } else {
    hint.textContent = `Можно изменить после ${nextUpdate.toLocaleDateString('ru-RU')}`;
    hint.style.color = 'var(--text-muted)';
  }
}

// ============================================
// Navigation
// ============================================

function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const page = item.dataset.page;
      switchPage(page);
      
      // Update active state
      navItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
    });
  });
}

function switchPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
  
  // Hide group detail if showing groups list
  if (page === 'groups') {
    document.getElementById('groupDetail').style.display = 'none';
    document.querySelector('.groups-grid').style.display = 'grid';
  }
}

// ============================================
// Theme
// ============================================

function initTheme() {
  const savedTheme = localStorage.getItem('antimat-theme') || 'theme-dark';
  document.body.className = savedTheme;
  
  // Update theme buttons
  updateThemeButtons();
  
  // Theme button clicks
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = `theme-${btn.dataset.theme}`;
      document.body.className = theme;
      localStorage.setItem('antimat-theme', theme);
      updateThemeButtons();
    });
  });
}

function updateThemeButtons() {
  const currentTheme = document.body.classList.contains('theme-light') ? 'light' : 'dark';
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === currentTheme);
  });
}

// ============================================
// Statistics
// ============================================

async function loadStats() {
  const period = document.getElementById('statsPeriod').value;
  
  try {
    const data = await api.getStats(period);
    const stats = data.data;
    
    // Update cards
    document.getElementById('totalViolations').textContent = stats.totalCount;
    document.getElementById('totalAmount').textContent = stats.totalAmount.toLocaleString();
    document.getElementById('forgivenCount').textContent = stats.forgivenCount;
    document.getElementById('currentDebt').textContent = stats.currentDebt.toLocaleString();
    document.getElementById('userDebt').textContent = stats.currentDebt.toLocaleString();
    
    // Update top words
    renderTopWords(stats.topWords);
    
    // Update chart
    renderWeeklyChart(stats.dailyStats);
    
    // Load history
    loadHistory();
  } catch (error) {
    console.error('Failed to load stats:', error);
  }
}

function renderTopWords(words) {
  const container = document.getElementById('topWordsList');
  
  if (!words || words.length === 0) {
    container.innerHTML = '<div class="empty-state">Нет данных</div>';
    return;
  }
  
  container.innerHTML = words.map((w, i) => `
    <div class="top-word-item">
      <div class="top-word-rank">${i + 1}</div>
      <div class="top-word-text">${maskWord(w._id)}</div>
      <div class="top-word-count">${w.count} раз</div>
    </div>
  `).join('');
}

function maskWord(word) {
  if (word.length <= 2) return '*'.repeat(word.length);
  return word.charAt(0) + '*'.repeat(word.length - 2) + word.charAt(word.length - 1);
}

function renderWeeklyChart(dailyStats) {
  const ctx = document.getElementById('weeklyChart').getContext('2d');
  
  // Prepare data for last 7 days
  const labels = [];
  const data = [];
  const today = new Date();
  
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    
    labels.push(date.toLocaleDateString('ru-RU', { weekday: 'short' }));
    
    const stat = dailyStats?.find(s => s._id === dateStr);
    data.push(stat ? stat.count : 0);
  }
  
  if (weeklyChart) {
    weeklyChart.destroy();
  }
  
  const isDark = document.body.classList.contains('theme-dark');
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
  const textColor = isDark ? '#B0B0B0' : '#555555';
  
  weeklyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Нарушений',
        data,
        backgroundColor: 'rgba(230, 57, 70, 0.8)',
        borderRadius: 8,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1,
            color: textColor
          },
          grid: {
            color: gridColor
          }
        },
        x: {
          ticks: {
            color: textColor
          },
          grid: {
            display: false
          }
        }
      }
    }
  });
}

async function loadHistory() {
  try {
    const data = await api.getHistory();
    const penalties = data.data.penalties;
    
    const container = document.getElementById('historyList');
    
    if (!penalties || penalties.length === 0) {
      container.innerHTML = '<div class="empty-state">Нет штрафов</div>';
      return;
    }
    
    container.innerHTML = penalties.map(p => `
      <div class="history-item">
        <div class="history-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          </svg>
        </div>
        <div class="history-content">
          <div class="history-word">${maskWord(p.word)}</div>
          <div class="history-time">${formatTime(p.detectedAt)}</div>
        </div>
        <div class="history-amount">+${p.amount} ₸</div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Failed to load history:', error);
  }
}

function formatTime(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) return 'Только что';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} мин назад`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} ч назад`;
  
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Period change
document.getElementById('statsPeriod').addEventListener('change', loadStats);

// ============================================
// Words
// ============================================

function initWords() {
  document.getElementById('addWordBtn').addEventListener('click', addWord);
  document.getElementById('newWord').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addWord();
  });
}

async function loadWords() {
  try {
    const data = await api.getWords();
    const { words, limit, count } = data.data;
    
    document.getElementById('wordsCount').textContent = count;
    document.getElementById('wordsLimit').textContent = limit;
    
    renderWords(words);
  } catch (error) {
    console.error('Failed to load words:', error);
  }
}

function renderWords(words) {
  const container = document.getElementById('wordsList');
  
  if (!words || words.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>Список слов пуст</p>
        <p class="hint">Добавьте слова, которые хотите отслеживать</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = words.map(w => `
    <div class="word-item">
      <div>
        <div class="word-text">${w.word}</div>
        <div class="word-date">Добавлено ${new Date(w.addedAt).toLocaleDateString('ru-RU')}</div>
      </div>
      <button class="delete-word-btn" data-word="${w.word}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
      </button>
    </div>
  `).join('');
  
  // Add delete handlers
  container.querySelectorAll('.delete-word-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteWord(btn.dataset.word));
  });
}

async function addWord() {
  const input = document.getElementById('newWord');
  const word = input.value.trim().toLowerCase();
  
  if (!word) return;
  
  try {
    await api.addWord(word);
    input.value = '';
    loadWords();
  } catch (error) {
    alert(error.message);
  }
}

async function deleteWord(word) {
  if (!confirm(`Удалить слово "${word}"?`)) return;
  
  try {
    await api.deleteWord(word);
    loadWords();
  } catch (error) {
    alert(error.message);
  }
}

// ============================================
// Settings
// ============================================

function initSettings() {
  document.getElementById('savePenaltyBtn').addEventListener('click', savePenalty);
  
  // Save settings on toggle change
  document.getElementById('soundEnabled').addEventListener('change', saveSettings);
  document.getElementById('notificationsEnabled').addEventListener('change', saveSettings);
  
  // Premium button
  document.getElementById('getPremiumBtn').addEventListener('click', () => {
    alert('Покупка Premium скоро будет доступна!');
  });
}

async function savePenalty() {
  const amount = parseInt(document.getElementById('penaltyAmount').value);
  
  if (isNaN(amount) || amount < 1) {
    alert('Введите корректную сумму');
    return;
  }
  
  try {
    const data = await api.updateSettings({ penaltyAmount: amount });
    currentUser.penaltyAmount = data.data.penaltyAmount;
    currentUser.penaltyAmountUpdatedAt = data.data.penaltyAmountUpdatedAt;
    updatePenaltyHint();
    alert('Сумма штрафа сохранена');
  } catch (error) {
    alert(error.message);
  }
}

async function saveSettings() {
  const soundEnabled = document.getElementById('soundEnabled').checked;
  const notificationsEnabled = document.getElementById('notificationsEnabled').checked;
  
  try {
    await api.updateSettings({ soundEnabled, notificationsEnabled });
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}

// ============================================
// Groups
// ============================================

function initGroups() {
  document.getElementById('createGroupBtn').addEventListener('click', showCreateGroupModal);
  document.getElementById('createFirstGroup').addEventListener('click', showCreateGroupModal);
  document.getElementById('joinGroupBtn').addEventListener('click', showJoinGroupModal);
  document.getElementById('backToGroups').addEventListener('click', hideGroupDetail);
  document.getElementById('copyCode').addEventListener('click', copyInviteCode);
  
  // Create group form
  document.getElementById('createGroupForm').addEventListener('submit', handleCreateGroup);
  document.getElementById('closeCreateGroup').addEventListener('click', hideCreateGroupModal);
  
  // Join group form
  document.getElementById('joinGroupForm').addEventListener('submit', handleJoinGroup);
  document.getElementById('closeJoinGroup').addEventListener('click', hideJoinGroupModal);
  
  // Chat
  document.getElementById('sendMessage').addEventListener('click', sendMessage);
  document.getElementById('messageInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !isSendingMessage) {
      sendMessage();
    }
  });
  
  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      switchTab(tab);
    });
  });
}

async function loadGroups() {
  try {
    const data = await api.getGroups();
    renderGroups(data.data.groups);
  } catch (error) {
    console.error('Failed to load groups:', error);
  }
}

function renderGroups(groups) {
  const container = document.getElementById('groupsList');
  
  if (!groups || groups.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <p>У вас пока нет групп</p>
        <button class="btn btn-primary" onclick="showCreateGroupModal()">Создать первую группу</button>
      </div>
    `;
    return;
  }
  
  container.innerHTML = groups.map(g => `
    <div class="group-card" data-id="${g._id}">
      <div class="group-card-header">
        <div class="group-avatar">${g.name.charAt(0).toUpperCase()}</div>
        <div class="group-card-info">
          <div class="group-card-name">${g.name}</div>
          <div class="group-card-members">${g.members?.length || 1} участников</div>
        </div>
      </div>
      <div class="group-card-stats">
        <div class="group-stat">
          <div class="group-stat-value">${g.inviteCode}</div>
          <div class="group-stat-label">Код</div>
        </div>
        <div class="group-stat">
          <div class="group-stat-value">→</div>
          <div class="group-stat-label">Открыть</div>
        </div>
      </div>
    </div>
  `).join('');
  
  // Add click handlers
  container.querySelectorAll('.group-card').forEach(card => {
    card.addEventListener('click', () => openGroup(card.dataset.id));
  });
}

async function openGroup(groupId) {
  try {
    const data = await api.getGroup(groupId);
    currentGroup = data.data.group;
    
    document.getElementById('groupName').textContent = currentGroup.name;
    document.getElementById('groupCode').textContent = currentGroup.inviteCode;
    
    document.querySelector('.groups-grid').style.display = 'none';
    document.getElementById('groupDetail').style.display = 'block';
    
    // Load chat and members
    loadGroupChat();
    loadGroupMembers();
    loadGroupStats();
  } catch (error) {
    alert(error.message);
  }
}

function hideGroupDetail() {
  stopChatPolling();
  document.getElementById('groupDetail').style.display = 'none';
  document.querySelector('.groups-grid').style.display = 'grid';
  currentGroup = null;
}

function copyInviteCode() {
  const code = document.getElementById('groupCode').textContent;
  navigator.clipboard.writeText(code);
  alert('Код скопирован!');
}

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  document.querySelectorAll('.tab-content').forEach(c => {
    c.classList.toggle('active', c.id === `tab-${tab}`);
  });
}

// Chat
async function loadGroupChat() {
  if (!currentGroup) return;
  
  try {
    const data = await api.getGroupChat(currentGroup._id);
    renderChat(data.data.messages);
    
    // Start long polling for new messages
    startChatPolling();
  } catch (error) {
    console.error('Failed to load chat:', error);
  }
}

function stopChatPolling() {
  chatPollingActive = false;
  lastMessageId = null;
}

async function startChatPolling() {
  if (chatPollingActive) return;
  
  chatPollingActive = true;
  
  while (chatPollingActive && currentGroup) {
    try {
      const data = await api.pollChatMessages(currentGroup._id, lastMessageId);
      
      if (data.data.hasNewMessages && data.data.messages.length > 0) {
        appendNewMessages(data.data.messages);
        if (data.data.messages.length > 0) {
          lastMessageId = data.data.messages[data.data.messages.length - 1]._id;
        }
      }
      
      // Wait 2 seconds before next poll
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.error('Chat polling error:', error);
      // Wait before retry on error
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

function appendNewMessages(newMessages) {
  const container = document.getElementById('chatMessages');
  
  // Get existing message IDs to avoid duplicates
  const existingIds = new Set();
  container.querySelectorAll('.chat-message').forEach(msg => {
    const msgId = msg.dataset.messageId;
    if (msgId) existingIds.add(msgId);
  });
  
  newMessages.forEach(m => {
    // Skip if message already exists
    if (existingIds.has(m._id)) return;
    
    const senderId = m.sender?._id?.toString() || m.sender?.id?.toString();
    const currentUserIdStr = (currentUser._id || currentUser.id)?.toString();
    const isOwn = senderId === currentUserIdStr;
    const isSystem = m.type === 'system' || m.type === 'join' || m.type === 'leave';
    const isPenalty = m.type === 'penalty';
    
    let className = 'chat-message';
    if (isOwn) className += ' own';
    if (isSystem) className += ' system';
    if (isPenalty) className += ' penalty';
    
    let messageHtml = '';
    
    if (isSystem) {
      messageHtml = `
        <div class="${className}" data-message-id="${m._id}">
          <div class="message-content">
            <div class="message-text">${m.text}</div>
          </div>
        </div>
      `;
    } else {
      messageHtml = `
        <div class="${className}" data-message-id="${m._id}">
          <div class="message-avatar">${m.sender?.name?.charAt(0) || '?'}</div>
          <div class="message-content">
            <div class="message-sender">${m.sender?.name || 'Unknown'}</div>
            <div class="message-text">${m.text}</div>
            <div class="message-time">${formatTime(m.createdAt)}</div>
          </div>
        </div>
      `;
    }
    
    container.insertAdjacentHTML('beforeend', messageHtml);
    existingIds.add(m._id);
  });
  
  container.scrollTop = container.scrollHeight;
}

function renderChat(messages) {
  const container = document.getElementById('chatMessages');
  
  if (!messages || messages.length === 0) {
    container.innerHTML = '<div class="empty-state">Нет сообщений</div>';
    lastMessageId = null;
    return;
  }
  
  container.innerHTML = messages.map(m => {
    const senderId = m.sender?._id?.toString() || m.sender?.id?.toString();
    const currentUserIdStr = (currentUser._id || currentUser.id)?.toString();
    const isOwn = senderId === currentUserIdStr;
    const isSystem = m.type === 'system' || m.type === 'join' || m.type === 'leave';
    const isPenalty = m.type === 'penalty';
    
    let className = 'chat-message';
    if (isOwn) className += ' own';
    if (isSystem) className += ' system';
    if (isPenalty) className += ' penalty';
    
    if (isSystem) {
      return `
        <div class="${className}" data-message-id="${m._id}">
          <div class="message-content">
            <div class="message-text">${m.text}</div>
          </div>
        </div>
      `;
    }
    
    return `
      <div class="${className}" data-message-id="${m._id}">
        <div class="message-avatar">${m.sender?.name?.charAt(0) || '?'}</div>
        <div class="message-content">
          <div class="message-sender">${m.sender?.name || 'Unknown'}</div>
          <div class="message-text">${m.text}</div>
          <div class="message-time">${formatTime(m.createdAt)}</div>
        </div>
      </div>
    `;
  }).join('');
  
  // Update lastMessageId
  if (messages.length > 0) {
    lastMessageId = messages[messages.length - 1]._id;
  }
  
  container.scrollTop = container.scrollHeight;
}

let isSendingMessage = false;

async function sendMessage() {
  if (!currentGroup || isSendingMessage) return;
  
  const input = document.getElementById('messageInput');
  const text = input.value.trim();
  
  if (!text) return;
  
  isSendingMessage = true;
  const sendBtn = document.getElementById('sendMessage');
  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>';
  }
  
  try {
    const data = await api.sendMessage(currentGroup._id, text);
    input.value = '';
    
    // Update lastMessageId to the sent message
    if (data.data.message) {
      lastMessageId = data.data.message._id;
      // Append the message immediately (will be deduplicated by polling)
      appendNewMessages([data.data.message]);
    }
  } catch (error) {
    alert(error.message);
  } finally {
    isSendingMessage = false;
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
    }
  }
}

// Members
function loadGroupMembers() {
  if (!currentGroup) return;
  
  const container = document.getElementById('membersList');
  const members = currentGroup.members || [];
  
  if (members.length === 0) {
    container.innerHTML = '<div class="empty-state">Нет участников</div>';
    return;
  }
  
  container.innerHTML = members.map(m => `
    <div class="member-item">
      <div class="member-avatar">${m.user?.name?.charAt(0) || '?'}</div>
      <div class="member-info">
        <div class="member-name">${m.user?.name || 'Unknown'}</div>
        <div class="member-role">${getRoleName(m.role)}</div>
      </div>
      <div class="member-debt">${(m.user?.totalDebt || 0).toLocaleString()} ₸</div>
    </div>
  `).join('');
}

function getRoleName(role) {
  switch (role) {
    case 'owner': return 'Владелец';
    case 'admin': return 'Админ';
    default: return 'Участник';
  }
}

// Group Stats
async function loadGroupStats() {
  if (!currentGroup) return;
  
  try {
    const data = await api.getGroupStats(currentGroup._id);
    renderGroupStats(data.data.memberStats);
  } catch (error) {
    console.error('Failed to load group stats:', error);
  }
}

function renderGroupStats(stats) {
  const container = document.getElementById('groupStatsList');
  
  if (!stats || stats.length === 0) {
    container.innerHTML = '<div class="empty-state">Нет данных</div>';
    return;
  }
  
  container.innerHTML = stats.map((s, i) => `
    <div class="group-stats-item">
      <div class="stats-rank">${i + 1}</div>
      <div class="stats-user-info">
        <div class="stats-user-name">${s.name}</div>
        <div class="stats-user-count">${s.totalCount} нарушений</div>
      </div>
      <div class="stats-user-amount">${s.totalAmount.toLocaleString()} ₸</div>
    </div>
  `).join('');
}

// Modals
function showCreateGroupModal() {
  document.getElementById('createGroupModal').style.display = 'flex';
}

function hideCreateGroupModal() {
  document.getElementById('createGroupModal').style.display = 'none';
  document.getElementById('createGroupForm').reset();
}

function showJoinGroupModal() {
  document.getElementById('joinGroupModal').style.display = 'flex';
}

function hideJoinGroupModal() {
  document.getElementById('joinGroupModal').style.display = 'none';
  document.getElementById('joinGroupForm').reset();
}

async function handleCreateGroup(e) {
  e.preventDefault();
  
  const name = document.getElementById('groupNameInput').value.trim();
  const description = document.getElementById('groupDescription').value.trim();
  
  if (!name) {
    alert('Введите название группы');
    return;
  }
  
  try {
    const data = await api.createGroup(name, description);
    hideCreateGroupModal();
    loadGroups();
    alert(`Группа создана! Код: ${data.data.group.inviteCode}`);
  } catch (error) {
    alert(error.message);
  }
}

async function handleJoinGroup(e) {
  e.preventDefault();
  
  const code = document.getElementById('inviteCodeInput').value.trim().toUpperCase();
  
  if (!code || code.length !== 5) {
    alert('Введите 5-значный код');
    return;
  }
  
  try {
    await api.joinGroup(code);
    hideJoinGroupModal();
    loadGroups();
    alert('Вы присоединились к группе!');
  } catch (error) {
    alert(error.message);
  }
}

// ============================================
// Modals - Close on outside click
// ============================================

function initModals() {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay && overlay.id !== 'authModal') {
        overlay.style.display = 'none';
      }
    });
  });
  
  // Retry connection button
  const retryBtn = document.getElementById('retryConnection');
  if (retryBtn) {
    retryBtn.addEventListener('click', async () => {
      try {
        await api.getMe();
        api.hideOfflineOverlay();
        location.reload();
      } catch (error) {
        console.error('Retry failed:', error);
      }
    });
  }
}

