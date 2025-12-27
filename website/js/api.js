// ============================================
// ANTIMAT - API Client
// ============================================

// Бьем в прод API на домене (предполагается прокси /api -> API_PORT)
const API_BASE = 'https://antimat.reflexai.pro/api';

class AntimatAPI {
  constructor() {
    this.token = localStorage.getItem('antimat-token');
  }

  // Set auth token
  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('antimat-token', token);
    } else {
      localStorage.removeItem('antimat-token');
    }
  }

  // Get headers
  getHeaders() {
    const headers = {
      'Content-Type': 'application/json'
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  // Make API request
  async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        ...options,
        headers: this.getHeaders()
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Ошибка сервера');
      }
      
      // Hide offline overlay if it was shown
      this.hideOfflineOverlay();
      
      return data;
    } catch (error) {
      if (error.message === 'Failed to fetch' || error.name === 'TypeError') {
        this.showOfflineOverlay();
        throw new Error('Не удалось подключиться к серверу');
      }
      throw error;
    }
  }
  
  showOfflineOverlay() {
    const overlay = document.getElementById('offlineOverlay');
    if (overlay) {
      overlay.style.display = 'flex';
    }
  }
  
  hideOfflineOverlay() {
    const overlay = document.getElementById('offlineOverlay');
    if (overlay) {
      overlay.style.display = 'none';
    }
  }

  // ============================================
  // Auth
  // ============================================

  async register(email, password, name) {
    const data = await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name })
    });
    
    if (data.success && data.data.token) {
      this.setToken(data.data.token);
    }
    
    return data;
  }

  async login(email, password) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    
    if (data.success && data.data.token) {
      this.setToken(data.data.token);
    }
    
    return data;
  }

  async getMe() {
    return await this.request('/auth/me');
  }

  logout() {
    this.setToken(null);
    localStorage.removeItem('antimat-user');
  }

  // ============================================
  // User
  // ============================================

  async getProfile() {
    return await this.request('/user/profile');
  }

  async updateSettings(settings) {
    return await this.request('/user/settings', {
      method: 'PUT',
      body: JSON.stringify(settings)
    });
  }

  async updateProfile(profile) {
    return await this.request('/user/profile', {
      method: 'PUT',
      body: JSON.stringify(profile)
    });
  }

  // ============================================
  // Words
  // ============================================

  async getWords() {
    return await this.request('/words');
  }

  async addWord(word) {
    return await this.request('/words', {
      method: 'POST',
      body: JSON.stringify({ word })
    });
  }

  async deleteWord(word) {
    return await this.request(`/words/${encodeURIComponent(word)}`, {
      method: 'DELETE'
    });
  }

  // ============================================
  // Penalties
  // ============================================

  async addPenalty(word, groupId = null, context = null) {
    return await this.request('/penalties/add', {
      method: 'POST',
      body: JSON.stringify({ word, groupId, context })
    });
  }

  async getStats(period = 'all') {
    return await this.request(`/penalties/stats?period=${period}`);
  }

  async getHistory(page = 1, limit = 20, groupId = null) {
    let url = `/penalties/history?page=${page}&limit=${limit}`;
    if (groupId) url += `&groupId=${groupId}`;
    return await this.request(url);
  }

  async forgivePenalty(penaltyId) {
    return await this.request(`/penalties/${penaltyId}/forgive`, {
      method: 'POST'
    });
  }

  // ============================================
  // Groups
  // ============================================

  async getGroups() {
    return await this.request('/groups');
  }

  async createGroup(name, description = '') {
    return await this.request('/groups/create', {
      method: 'POST',
      body: JSON.stringify({ name, description })
    });
  }

  async joinGroup(code) {
    return await this.request('/groups/join', {
      method: 'POST',
      body: JSON.stringify({ code })
    });
  }

  async getGroup(groupId) {
    return await this.request(`/groups/${groupId}`);
  }

  async getGroupStats(groupId) {
    return await this.request(`/groups/${groupId}/stats`);
  }

  async getGroupChat(groupId, page = 1) {
    return await this.request(`/groups/${groupId}/chat?page=${page}`);
  }

  async pollChatMessages(groupId, lastMessageId = null) {
    let url = `/groups/${groupId}/chat/poll`;
    if (lastMessageId) {
      url += `?lastMessageId=${lastMessageId}`;
    }
    return await this.request(url);
  }

  async sendMessage(groupId, text) {
    return await this.request(`/groups/${groupId}/chat`, {
      method: 'POST',
      body: JSON.stringify({ text })
    });
  }

  async leaveGroup(groupId) {
    return await this.request(`/groups/${groupId}/leave`, {
      method: 'DELETE'
    });
  }
}

// Export singleton instance
window.api = new AntimatAPI();

