// ===== EngLand CRM — основная логика =====
let currentUser = null;
let currentTab = "dashboard";
let currentDetail = null;
let dataLoaded = false;
let studentSearchQuery = "";

function getCurrentMonthPrefix() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
function getCurrentMonthName() {
  return new Date().toLocaleString('ru-RU', { month: 'long' });
}

async function initData() {
  showLoadingOverlay(true);
  try {
    await loadAllFromSupabase();
    dataLoaded = true;
    subscribeToRealtimeUpdates(() => {
      if (currentUser) renderPage();
    });
  } catch (e) {
    console.error("Failed to load data", e);
    showToast("Не удалось подключиться к базе данных.");
  }
  showLoadingOverlay(false);
  dbReadyResolve();
}

function showLoadingOverlay(show) {
  let el = document.getElementById("loading-overlay");
  if (show) {
    if (!el) {
      el = document.createElement("div");
      el.id = "loading-overlay";
      el.style.cssText = "position:fixed;inset:0;background:rgba(30,45,78,0.92);color:#fff;display:flex;align-items:center;justify-content:center;z-index:300;font-size:14px;";
      el.textContent = "Загрузка данных...";
      document.body.appendChild(el);
    }
  } else if (el) {
    el.remove();
  }
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.style.display = "block";
  setTimeout(() => { t.style.display = "none"; }, 2200);
}

async function doLogin() {
  const login = document.getElementById("login-input").value.trim().toLowerCase();
  const password = document.getElementById("password-input").value;
  const errEl = document.getElementById("login-error");
  
  if (!dataLoaded) {
    showToast("Подождите, идёт загрузка...");
    await dbReady;
  }
  
  const user = DB.users[login];
  if (!user || user.password !== password) {
    errEl.style.display = "block";
    return;
  }
  
  errEl.style.display = "none";
  currentUser = { ...user, login };
  sessionStorage.setItem("england_crm_session", JSON.stringify(currentUser));
  enterApp();
}

function doLogout() {
  currentUser = null;
  sessionStorage.removeItem("england_crm_session");
  document.getElementById("app").style.display = "none";
  document.getElementById("login-screen").style.display = "flex";
  document.getElementById("login-input").value = "";
  document.getElementById("password-input").value = "";
}

async function tryRestoreSession() {
  try {
    const raw = sessionStorage.getItem("england_crm_session");
    if (raw) {
      if (!dataLoaded) await dbReady;
      currentUser = JSON.parse(raw);
      enterApp();
    }
  } catch (e) {}
}

function enterApp() {
  document.getElementById("login-screen").style.display = "none";
  document.getElementById("app").style.display = "block";
  document.getElementById("topbar-username").textContent = currentUser.name;
  currentTab = defaultTabForRole(currentUser.role);
  renderNav();
  renderPage();
}

function defaultTabForRole(role) {
  if (role === "owner" || role === "admin") return "dashboard";
  if (role === "teacher") return "groups";
  if (role === "parent") return "child";
  return "dashboard";
}

const NAV_CONFIG = {
  owner: [
    { id: "dashboard", label: "Главная", icon: "☉" },
    { id: "students", label: "Ученики", icon: "👤" },
    { id: "groups", label: "Группы", icon: "👥" },
    { id: "payments", label: "Оплаты", icon: "₽" },
  ],
  admin: [
    { id: "dashboard", label: "Главная", icon: "☉" },
    { id: "students", label: "Ученики", icon: "👤" },
    { id: "groups", label: "Группы", icon: "👥" },
    { id: "payments", label: "Оплаты", icon: "₽" },
  ],
  teacher: [
    { id: "groups", label: "Мои группы", icon: "👥" },
    { id: "homework", label: "ДЗ", icon: "📝" },
    { id: "feedback", label: "Фидбэк", icon: "💬" },
  ],
  parent: [
    { id: "child", label: "Мой ребёнок", icon: "👶" },
    { id: "homework", label: "ДЗ", icon: "📝" },
    { id: "payments", label: "Оплата", icon: "₽" },
  ],
};

function renderNav() {
  const nav = document.getElementById("bottom-nav");
  const items = NAV_CONFIG[currentUser.role] || [];
  nav.innerHTML = items.map(item => `
    <button class="nav-item ${currentTab === item.id ? 'active' : ''}" onclick="switchTab('${item.id}')">
      <span class="nav-icon">${navIconFor(item.id)}</span>
      <span>${item.label}</span>
    </button>
  `).join("");
}

function navIconFor(id) {
  const icons = { dashboard: "▲", students: "◎", groups: "■", payments: "₽", homework: "✎", feedback: "✉", child: "★" };
  return icons[id] || "●";
}

function switchTab(tab) {
  currentTab = tab;
  currentDetail = null;
  studentSearchQuery = "";
  renderNav();
  renderPage();
  window.scrollTo(0, 0);
}

function openDetail(type, id) {
  currentDetail = { type, id };
  renderPage();
  window.scrollTo(0, 0);
}

function closeDetail() {
  currentDetail = null;
  renderPage();
}

function getStudent(id) { return DB.students.find(s => s.id === id); }
function getGroup(id) { return DB.groups.find(g => g.id === id); }
function getTeacher(id) { return DB.teachers.find(t => t.id === id); }

function getInitials(name) {
  return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  const months = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

function daysUntil(dateStr) {
  const today = new Date();
  const target = new Date(dateStr);
  return Math.round((target - today) / 86400000);
}

function remainingLessons(student) { 
  return student.subscriptionTotal - student.subscriptionUsed;
}

function paymentStatusBadge(student) {
  const days = daysUntil(student.nextPaymentDate);
  const remaining = remainingLessons(student);
  
  if (remaining <= 0) return { cls: "badge-danger", text: "Абонемент закончен" };
  if (days <= 3) return { cls: "badge-warn", text: `Оплата через ${days} дн.` };
  if (remaining <= 2) return { cls: "badge-warn", text: `Осталось ${remaining} зан.` };
  return { cls: "badge-ok", text: `Осталось ${remaining} зан.` };
}

function studentsForTeacher(teacherId) {
  const groupIds = DB.groups.filter(g => g.teacherId === teacherId).map(g => g.id);
  return DB.students.filter(s => groupIds.includes(s.groupId));
}

function studentsForParent() {
  const ids = currentUser.studentIds || [];
  return DB.students.filter(s => ids.includes(s.id));
}

function renderPage() {
  const el = document.getElementById("page-content");
  if (currentDetail) {
    if (currentDetail.type === "student") { el.innerHTML = renderStudentDetail(currentDetail.id); return; }
    if (currentDetail.type === "group") { el.innerHTML = renderGroupDetail(currentDetail.id); return; }
  }
  
  const role = currentUser.role;
  if ((role === "owner" || role === "admin") && currentTab === "dashboard") { el.innerHTML = renderDashboard(); return; }
  if (currentTab === "students") { el.innerHTML = renderStudentsList(); return; }
  if (currentTab === "groups") { el.innerHTML = renderGroupsList(); return; }
  if (currentTab === "payments") { el.innerHTML = renderPaymentsPage(); return; }
  if (currentTab === "homework") { el.innerHTML = renderHomeworkPage(); return; }
  if (currentTab === "feedback") { el.innerHTML = renderFeedbackPage(); return; }
  if (currentTab === "child") { el.innerHTML = renderChildPage(); return; }
  
  el.innerHTML = `<div class="empty-state">Раздел не найден</div>`;
}

function renderDashboard() {
  const totalStudents = DB.students.length;
  const totalGroups = DB.groups.length;
  const monthPrefix = getCurrentMonthPrefix();
  
  const monthRevenue = DB.payments
    .filter(p => p.date.startsWith(monthPrefix))
    .reduce((sum, p) => sum + p.amount, 0);
    
  const expiringCount = DB.students.filter(s => daysUntil(s.nextPaymentDate) <= 3 || remainingLessons(s) <= 0).length;
  const expiring = DB.students
    .filter(s => daysUntil(s.nextPaymentDate) <= 5 || remainingLessons(s) <= 2)
    .sort((a, b) => daysUntil(a.nextPaymentDate) - daysUntil(b.nextPaymentDate));

  return `
    <div class="page-title">Главная</div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value">${totalStudents}</div><div class="stat-label">Учеников</div></div>
      <div class="stat-card"><div class="stat-value">${totalGroups}</div><div class="stat-label">Групп</div></div>
      <div class="stat-card"><div class="stat-value">${monthRevenue.toLocaleString('ru-RU')} ₽</div><div class="stat-label">Оплаты за ${getCurrentMonthName()}</div></div>
      <div class="stat-card"><div class="stat-value" style="color:${expiringCount > 0 ? 'var(--danger)' : 'var(--navy)'}">${expiringCount}</div><div class="stat-label">Истекает абонемент</div></div>
    </div>
    <div class="section-label">Требуют внимания</div>
    ${expiring.length === 0 ? 
      `<div class="empty-state"><div class="empty-state-icon">&#10003;</div>Все абонементы в порядке</div>` :
      expiring.map(s => {
        const badge = paymentStatusBadge(s);
        return `
          <div class="list-item"
