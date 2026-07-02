// ===== EngLand CRM — основная логика =====
let currentUser = null;
let currentTab = "dashboard";
let currentDetail = null;
let dataLoaded = false;
let studentSearchQuery = "";

// ---------- УТИЛИТЫ ДАТ ----------
function getCurrentMonthPrefix() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
function getCurrentMonthName() {
  return new Date().toLocaleString('ru-RU', { month: 'long' });
}

// ---------- ИНИЦИАЛИЗАЦИЯ ----------
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

// ---------- АВТОРИЗАЦИЯ ----------
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

// ---------- НАВИГАЦИЯ ----------
const NAV_CONFIG = {
  owner: [
    { id: "dashboard", label: "Главная", icon: "☉" },
    { id: "students", label: "Ученики", icon: "👤" },
    { id: "groups", label: "Группы", icon: "" },
    { id: "payments", label: "Оплаты", icon: "₽" },
  ],
  admin: [
    { id: "dashboard", label: "Главная", icon: "☉" },
    { id: "students", label: "Ученики", icon: "" },
    { id: "groups", label: "Группы", icon: "" },
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

// ---------- БАЗОВЫЕ УТИЛИТЫ ----------
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

// ---------- РЕНДЕР СТРАНИЦ ----------
function renderPage() {
  const