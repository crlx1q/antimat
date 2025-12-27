// ============================================
// ANTIMAT - Landing Page JavaScript
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle();
  initMobileMenu();
  initSmoothScroll();
  initScrollAnimations();
});

// ============================================
// Theme Toggle
// ============================================

function initThemeToggle() {
  const toggle = document.getElementById('themeToggle');
  const body = document.body;
  
  // Check saved theme or system preference
  const savedTheme = localStorage.getItem('antimat-theme');
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  if (savedTheme) {
    body.className = savedTheme;
  } else if (!systemPrefersDark) {
    body.className = 'theme-light';
  }
  
  toggle.addEventListener('click', () => {
    const isDark = body.classList.contains('theme-dark');
    body.className = isDark ? 'theme-light' : 'theme-dark';
    localStorage.setItem('antimat-theme', body.className);
  });
}

// ============================================
// Mobile Menu
// ============================================

function initMobileMenu() {
  const toggle = document.getElementById('mobileMenuToggle');
  const menu = document.getElementById('mobileMenu');
  
  if (!toggle || !menu) return;
  
  toggle.addEventListener('click', () => {
    toggle.classList.toggle('active');
    menu.classList.toggle('active');
  });
  
  // Close menu on link click
  menu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      toggle.classList.remove('active');
      menu.classList.remove('active');
    });
  });
  
  // Close menu on outside click
  document.addEventListener('click', (e) => {
    if (!toggle.contains(e.target) && !menu.contains(e.target)) {
      toggle.classList.remove('active');
      menu.classList.remove('active');
    }
  });
}

// ============================================
// Smooth Scroll
// ============================================

function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      e.preventDefault();
      const targetId = this.getAttribute('href');
      
      if (targetId === '#') return;
      
      const target = document.querySelector(targetId);
      if (target) {
        const headerHeight = document.querySelector('.header').offsetHeight;
        const targetPosition = target.offsetTop - headerHeight - 20;
        
        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
      }
    });
  });
}

// ============================================
// Scroll Animations
// ============================================

function initScrollAnimations() {
  const observerOptions = {
    root: null,
    rootMargin: '0px',
    threshold: 0.1
  };
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-in');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);
  
  // Observe elements
  document.querySelectorAll('.feature-card, .step, .section-header').forEach(el => {
    el.classList.add('animate-target');
    observer.observe(el);
  });
}

// Add animation styles dynamically
const style = document.createElement('style');
style.textContent = `
  .animate-target {
    opacity: 0;
    transform: translateY(30px);
    transition: opacity 0.6s ease, transform 0.6s ease;
  }
  
  .animate-target.animate-in {
    opacity: 1;
    transform: translateY(0);
  }
  
  .feature-card.animate-target {
    transition-delay: calc(var(--index, 0) * 0.1s);
  }
`;
document.head.appendChild(style);

// Add index to feature cards for staggered animation
document.querySelectorAll('.feature-card').forEach((card, index) => {
  card.style.setProperty('--index', index);
});

