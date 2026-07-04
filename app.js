// ===== EngLand CRM — основная логика =====
let currentUser = null;
let currentTab = "dashboard";
let currentDetail = null;
let dataLoaded = false;
let studentSearchQuery = "";
let calendarView = "week";
let calendarDate = new Date();

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
    subscribeToRealtimeUpdates(() => { if (currentUser) renderPage(); });
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
  } else if (el) { el.remove(); }
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
  if (!dataLoaded) { showToast("Подождите, идёт загрузка..."); await dbReady; }
  const user = DB.users[login];
  if (!user || user.password !== password) { errEl.style.display = "block"; return; }
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
    { id: "dashboard", label: "Главная" },
    { id: "calendar", label: "Календарь" },
    { id: "students", label: "Ученики" },
    { id: "groups", label: "Группы" },
    { id: "payments", label: "Оплаты" },
  ],
  admin: [
    { id: "dashboard", label: "Главная" },
    { id: "calendar", label: "Календарь" },
    { id: "students", label: "Ученики" },
    { id: "groups", label: "Группы" },
    { id: "payments", label: "Оплаты" },
  ],
  teacher: [
    { id: "groups", label: "Мои группы" },
    { id: "calendar", label: "Календарь" },
    { id: "homework", label: "ДЗ" },
    { id: "feedback", label: "Фидбэк" },
  ],
  parent: [
    { id: "child", label: "Мой ребёнок" },
    { id: "calendar", label: "Календарь" },
    { id: "homework", label: "ДЗ" },
    { id: "payments", label: "Оплата" },
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
  const icons = {
    dashboard: "▲", calendar: "📅", students: "◎", groups: "■",
    payments: "₽", homework: "✎", feedback: "💬", child: "★"
  };
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

function formatDateLong(dateStr) {
  const d = new Date(dateStr);
  const months = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  const weekdays = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
  return `${weekdays[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
}

function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
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

function getPaymentNotifications() {
  const notifications = [];
  DB.students.forEach(s => {
    const days = daysUntil(s.nextPaymentDate);
    const remaining = remainingLessons(s);
    if (remaining <= 0) {
      notifications.push({ type: "danger", student: s, text: `Абонемент закончился`, days });
    } else if (days <= 3 && days >= 0) {
      notifications.push({ type: "warn", student: s, text: `Оплата через ${days} дн. (${remaining} зан. осталось)`, days });
    } else if (days < 0) {
      notifications.push({ type: "danger", student: s, text: `Просрочено на ${Math.abs(days)} дн.`, days });
    }
  });
  return notifications.sort((a, b) => a.days - b.days);
}

function renderPage() {
  const el = document.getElementById("page-content");
  if (currentDetail) {
    if (currentDetail.type === "student") { el.innerHTML = renderStudentDetail(currentDetail.id); return; }
    if (currentDetail.type === "group") { el.innerHTML = renderGroupDetail(currentDetail.id); return; }
  }
  const role = currentUser.role;
  if ((role === "owner" || role === "admin") && currentTab === "dashboard") { el.innerHTML = renderDashboard(); return; }
  if (currentTab === "calendar") { el.innerHTML = renderCalendar(); return; }
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
  const notifications = getPaymentNotifications();

  return `
    <div class="page-title">Главная</div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value">${totalStudents}</div><div class="stat-label">Учеников</div></div>
      <div class="stat-card"><div class="stat-value">${totalGroups}</div><div class="stat-label">Групп</div></div>
      <div class="stat-card"><div class="stat-value">${monthRevenue.toLocaleString('ru-RU')} ₽</div><div class="stat-label">Оплаты за ${getCurrentMonthName()}</div></div>
      <div class="stat-card"><div class="stat-value" style="color:${notifications.length > 0 ? 'var(--danger)' : 'var(--navy)'}">${notifications.length}</div><div class="stat-label">Уведомлений</div></div>
    </div>
    <div class="section-label">🔔 Уведомления об оплате</div>
    ${notifications.length === 0 ?
      `<div class="empty-state"><div class="empty-state-icon">✓</div>Все абонементы в порядке</div>` :
      notifications.map(n => {
        const s = n.student;
        const badge = paymentStatusBadge(s);
        return `
          <div class="list-item" onclick="openDetail('student','${s.id}')" style="background:${n.type === 'danger' ? 'rgba(220,53,69,0.08)' : 'rgba(255,193,7,0.08)'}">
            <div class="list-item-main">
              <div class="list-item-title">${s.name}</div>
              <div class="list-item-sub">${getGroup(s.groupId)?.name || ''} · ${n.text}</div>
            </div>
            <div class="list-item-right"><span class="badge ${badge.cls}">${badge.text}</span></div>
          </div>`;
      }).join("")
    }
  `;
}

function renderCalendar() {
  const isTeacher = currentUser.role === "teacher";
  const isParent = currentUser.role === "parent";
  let lessons = [...DB.lessons];
  if (isTeacher) {
    const myGroups = DB.groups.filter(g => g.teacherId === currentUser.id).map(g => g.id);
    lessons = lessons.filter(l => myGroups.includes(l.groupId));
  }
  if (isParent) {
    const myStudents = studentsForParent();
    const myGroups = [...new Set(myStudents.map(s => s.groupId))];
    lessons = lessons.filter(l => myGroups.includes(l.groupId));
  }
  return `
    <div class="page-title">Расписание</div>
    <div style="display:flex;gap:8px;margin-bottom:16px;">
      <button class="${calendarView === 'week' ? 'btn-primary' : 'btn-secondary'}" onclick="setCalendarView('week')" style="flex:1">Неделя</button>
      <button class="${calendarView === 'month' ? 'btn-primary' : 'btn-secondary'}" onclick="setCalendarView('month')" style="flex:1">Месяц</button>
    </div>
    ${calendarView === 'week' ? renderWeekView(lessons) : renderMonthView(lessons)}
  `;
}

function setCalendarView(view) { calendarView = view; renderPage(); }

function getWeekDays(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  const days = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    days.push(day);
  }
  return days;
}

function renderWeekView(lessons) {
  const weekDays = getWeekDays(calendarDate);
  const weekStart = weekDays[0];
  const weekEnd = weekDays[6];
  const months = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <button class="btn-secondary" onclick="changeWeek(-1)" style="padding:6px 12px;">←</button>
      <div style="font-weight:600;font-size:14px;">${weekStart.getDate()} ${months[weekStart.getMonth()]} — ${weekEnd.getDate()} ${months[weekEnd.getMonth()]} ${weekEnd.getFullYear()}</div>
      <button class="btn-secondary" onclick="changeWeek(1)" style="padding:6px 12px;">→</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;">
      ${weekDays.map((day, i) => {
        const dateStr = day.toISOString().slice(0, 10);
        const dayLessons = lessons.filter(l => l.date === dateStr);
        const isToday = dateStr === new Date().toISOString().slice(0, 10);
        return `
          <div style="background:${isToday ? 'var(--navy)' : 'var(--card-bg)'};border-radius:10px;padding:10px;min-height:120px;">
            <div style="font-size:11px;color:${isToday ? '#fff' : 'var(--text-muted)'};margin-bottom:4px;">${weekdays[i]}</div>
            <div style="font-size:18px;font-weight:700;color:${isToday ? '#fff' : 'var(--text)'};margin-bottom:8px;">${day.getDate()}</div>
            ${dayLessons.map(l => {
              const g = getGroup(l.groupId);
              return `
                <div style="background:${isToday ? 'rgba(255,255,255,0.2)' : 'var(--accent-light)'};border-radius:6px;padding:6px;margin-bottom:4px;font-size:11px;">
                  <div style="font-weight:600;color:${isToday ? '#fff' : 'var(--navy)'};">${g ? g.name : 'Группа'}</div>
                  <div style="color:${isToday ? 'rgba(255,255,255,0.8)' : 'var(--text-secondary)'};margin-top:2px;">${l.topic || 'Занятие'}</div>
                </div>
              `;
            }).join("")}
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function changeWeek(delta) {
  const d = new Date(calendarDate);
  d.setDate(d.getDate() + delta * 7);
  calendarDate = d;
  renderPage();
}

function renderMonthView(lessons) {
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const months = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
  const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDayOfWeek = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
  const totalDays = lastDay.getDate();
  const cells = [];
  for (let i = 0; i < startDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(new Date(year, month, d));

  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <button class="btn-secondary" onclick="changeMonth(-1)" style="padding:6px 12px;">←</button>
      <div style="font-weight:600;font-size:14px;">${months[month]} ${year}</div>
      <button class="btn-secondary" onclick="changeMonth(1)" style="padding:6px 12px;">→</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;">
      ${weekdays.map(w => `<div style="text-align:center;font-size:11px;color:var(--text-muted);font-weight:600;padding:4px;">${w}</div>`).join("")}
      ${cells.map(cell => {
        if (!cell) return `<div></div>`;
        const dateStr = cell.toISOString().slice(0, 10);
        const dayLessons = lessons.filter(l => l.date === dateStr);
        const isToday = dateStr === new Date().toISOString().slice(0, 10);
        return `
          <div style="background:${isToday ? 'var(--navy)' : 'var(--card-bg)'};border-radius:8px;padding:6px;min-height:60px;">
            <div style="font-size:13px;font-weight:700;color:${isToday ? '#fff' : 'var(--text)'};margin-bottom:4px;">${cell.getDate()}</div>
            ${dayLessons.slice(0, 2).map(l => {
              const g = getGroup(l.groupId);
              return `<div style="font-size:10px;color:${isToday ? '#fff' : 'var(--navy)'};font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${g ? g.name : ''}</div>`;
            }).join("")}
            ${dayLessons.length > 2 ? `<div style="font-size:10px;color:var(--text-muted);">+${dayLessons.length - 2}</div>` : ''}
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function changeMonth(delta) {
  const d = new Date(calendarDate);
  d.setMonth(d.getMonth() + delta);
  calendarDate = d;
  renderPage();
}

function renderStudentsList() {
  const query = studentSearchQuery.toLowerCase().trim();
  let students = [...DB.students];
  if (query) {
    students = students.filter(s => {
      const group = getGroup(s.groupId);
      return s.name.toLowerCase().includes(query) ||
             (group && group.name.toLowerCase().includes(query));
    });
  }
  students.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const canEdit = currentUser.role === "owner" || currentUser.role === "admin";

  return `
    <div class="page-title">Ученики</div>
    ${canEdit ? `<button class="btn-primary" onclick="openAddStudentModal()" style="margin-bottom:16px">+ Добавить ученика</button>` : ''}
    <div style="margin-bottom:16px;">
      <input type="text" class="form-input" placeholder="🔍 Поиск по имени или группе..."
             value="${studentSearchQuery}"
             oninput="studentSearchQuery = this.value; renderPage();">
    </div>
    ${students.length === 0 ?
      `<div class="empty-state">Ничего не найдено</div>` :
      students.map(s => {
        const badge = paymentStatusBadge(s);
        const group = getGroup(s.groupId);
        return `
          <div class="list-item" onclick="openDetail('student','${s.id}')">
            <div class="list-item-main">
              <div class="list-item-title">${s.name}</div>
              <div class="list-item-sub">${group ? group.name : 'Без группы'} · ${s.age} лет</div>
            </div>
            <div class="list-item-right"><span class="badge ${badge.cls}">${badge.text}</span></div>
          </div>`;
      }).join("")
    }
  `;
}

// ===== ДЕТАЛЬ УЧЕНИКА (С КОНТАКТАМИ РОДИТЕЛЯ И УВЕДОМЛЕНИЕМ) =====
function renderStudentDetail(id) {
  const s = getStudent(id);
  if (!s) return `<div class="empty-state">Ученик не найден</div>`;
  const group = getGroup(s.groupId);
  const teacher = group ? getTeacher(group.teacherId) : null;
  const badge = paymentStatusBadge(s);
  const progressPct = Math.round((s.subscriptionUsed / s.subscriptionTotal) * 100);
  const studentPayments = DB.payments.filter(p => p.studentId === id).sort((a, b) => b.date.localeCompare(a.date));
  const studentHomework = DB.homework.filter(h => h.studentId === id).sort((a, b) => b.date.localeCompare(a.date));
  const studentFeedback = DB.feedback.filter(f => f.studentId === id).sort((a, b) => b.date.localeCompare(a.date));
  const canEdit = currentUser.role === "owner" || currentUser.role === "admin";
  const isTeacher = currentUser.role === "teacher";
  const bindCode = s.bindCode || s.id.slice(-6);

  return `
    <button class="back-btn" onclick="closeDetail()">← Назад</button>
    <div class="detail-header">
      <div class="avatar">${getInitials(s.name)}</div>
      <div>
        <div class="detail-name">${s.name}</div>
        <div class="detail-sub">${s.age} лет · ${group ? group.name : 'Без группы'}</div>
      </div>
    </div>
    <div class="card">
      <div class="row-between">
        <span style="font-size:13px;font-weight:600;color:var(--text-secondary)">Абонемент</span>
        <span class="badge ${badge.cls}">${badge.text}</span>
      </div>
      <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${progressPct}%"></div></div>
      <div style="font-size:12px;color:var(--text-muted)">Использовано ${s.subscriptionUsed} из ${s.subscriptionTotal} занятий</div>
      <div class="divider"></div>
      <div class="row-between" style="font-size:13px;margin-bottom:6px">
        <span style="color:var(--text-secondary)">Преподаватель</span>
        <span style="font-weight:600">${teacher ? teacher.name : '—'}</span>
      </div>
      <div class="row-between" style="font-size:13px;margin-bottom:6px">
        <span style="color:var(--text-secondary)">Расписание</span>
        <span style="font-weight:600">${group ? group.schedule : '—'}</span>
      </div>
      <div class="row-between" style="font-size:13px">
        <span style="color:var(--text-secondary)">Следующая оплата</span>
        <span style="font-weight:600">${formatDate(s.nextPaymentDate)}</span>
      </div>
      ${canEdit ? `<button class="btn-primary" style="margin-top:14px" onclick="openRenewModal('${id}')">Продлить абонемент</button>` : ''}
    </div>

    ${canEdit ? `
      <div class="card" style="margin-top:16px;background:linear-gradient(135deg, var(--accent-light), rgba(0,136,204,0.08));">
        <div style="font-size:13px;font-weight:600;color:var(--navy);margin-bottom:8px;">🔗 Привязка Telegram-бота</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;">
          Родитель пишет боту <b>@england_crm_bot</b> команду:
        </div>
        <div style="background:#fff;padding:12px;border-radius:8px;text-align:center;font-size:22px;font-weight:700;letter-spacing:4px;color:var(--navy);font-family:monospace;border:2px dashed var(--accent);">
          /bind ${bindCode}
        </div>
      </div>
    ` : ''}

    ${isTeacher ? `
      <div class="card" style="margin-top:16px;">
        <div style="font-size:13px;font-weight:600;color:var(--navy);margin-bottom:10px;">📞 Контакты родителя</div>
        ${s.parentPhone ? `
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
            <span style="font-size:18px;">📱</span>
            <div>
              <div style="font-size:11px;color:var(--text-muted);">Телефон</div>
              <a href="tel:${s.parentPhone}" style="font-size:14px;font-weight:600;color:var(--accent);text-decoration:none;">${s.parentPhone}</a>
            </div>
          </div>
        ` : `<div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;"> Телефон не указан</div>`}
        ${s.parentEmail ? `
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:18px;">✉️</span>
            <div>
              <div style="font-size:11px;color:var(--text-muted);">Email</div>
              <a href="mailto:${s.parentEmail}" style="font-size:14px;font-weight:600;color:var(--accent);text-decoration:none;">${s.parentEmail}</a>
            </div>
          </div>
        ` : `<div style="font-size:12px;color:var(--text-muted);">✉️ Email не указан</div>`}
        <button class="btn-primary" style="margin-top:14px" onclick="openNotifyModal('${id}')"> Написать родителю</button>
      </div>
    ` : ''}

    ${s.notes ? `<div class="section-label">Заметки преподавателя</div><div class="card"><div style="font-size:14px;line-height:1.5">${s.notes}</div></div>` : ''}
    <div class="section-label">Домашние задания</div>
    ${studentHomework.length === 0 ? `<div class="card"><div style="font-size:13px;color:var(--text-muted)">Заданий пока нет</div></div>` :
      studentHomework.map(hw => `
        <div class="card">
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">${formatDate(hw.date)}</div>
          <div style="font-size:14px;line-height:1.5">${hw.text}</div>
        </div>
      `).join("")
    }
    <div class="section-label">Фидбэк от преподавателя</div>
    ${studentFeedback.length === 0 ? `<div class="card"><div style="font-size:13px;color:var(--text-muted)">Фидбэка пока нет</div></div>` :
      studentFeedback.filter(f => !f.text.startsWith('[УВЕДОМЛЕНИЕ')).map(f => `
        <div class="card">
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">${formatDate(f.date)} · ${getTeacher(f.teacherId)?.name || ''}</div>
          <div style="font-size:14px;line-height:1.5">${f.text}</div>
        </div>
      `).join("")
    }
    <div class="section-label">История оплат</div>
    ${studentPayments.length === 0 ? `<div class="card"><div style="font-size:13px;color:var(--text-muted)">Оплат пока нет</div></div>` :
      studentPayments.map(p => `
        <div class="list-item" style="cursor:default">
          <div class="list-item-main">
            <div class="list-item-title">${p.amount.toLocaleString('ru-RU')} ₽</div>
            <div class="list-item-sub">${p.lessons} занятий</div>
          </div>
          <div class="list-item-right" style="font-size:13px;color:var(--text-secondary)">${formatDate(p.date)}</div>
        </div>
      `).join("")
    }
  `;
}

function openRenewModal(studentId) {
  const s = getStudent(studentId);
  const sheet = document.getElementById("modal-sheet");
  sheet.innerHTML = `
    <div class="modal-title">Продлить абонемент</div>
    <div class="form-group"><label class="form-label">Ученик</label><input class="form-input" value="${s.name}" disabled style="background:var(--bg)"></div>
    <div class="form-group"><label class="form-label">Количество занятий</label><input class="form-input" type="number" id="renew-lessons" value="8"></div>
    <div class="form-group"><label class="form-label">Сумма оплаты (₽)</label><input class="form-input" type="number" id="renew-amount" value="${s.paymentAmount}"></div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Отмена</button>
      <button class="btn-primary flex" onclick="confirmRenew('${studentId}')">Подтвердить</button>
    </div>
  `;
  document.getElementById("modal-overlay").classList.add("open");
}

async function confirmRenew(studentId) {
  const lessons = parseInt(document.getElementById("renew-lessons").value) || 8;
  const amount = parseInt(document.getElementById("renew-amount").value) || 0;
  closeModal();
  showToast("Сохраняем...");
  try {
    await dbRenewSubscription(studentId, lessons, amount);
    showToast("Абонемент продлён");
    renderPage();
  } catch (e) {
    console.error(e);
    showToast("Ошибка сохранения.");
  }
}

function closeModal() {
  document.getElementById("modal-overlay").classList.remove("open");
}

// 🔔 МОДАЛКА: НАПИСАТЬ РОДИТЕЛЮ
function openNotifyModal(studentId) {
  const s = getStudent(studentId);
  const sheet = document.getElementById("modal-sheet");
  sheet.innerHTML = `
    <div class="modal-title">🔔 Написать родителю</div>
    <div class="form-group">
      <label class="form-label">Ученик</label>
      <input class="form-input" value="${s.name}" disabled style="background:var(--bg)">
    </div>
    <div class="form-group">
      <label class="form-label">Сообщение родителю</label>
      <textarea class="form-input" id="notify-message" placeholder="Например: Ариана сегодня отлично поработала! На следующем занятии повторим Past Simple."></textarea>
    </div>
    <div style="font-size:11px;color:var(--text-muted);margin-bottom:12px;">
      ⚠️ Сообщение будет отправлено через Telegram-бот. Если родитель не привязан — придёт ошибка.
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Отмена</button>
      <button class="btn-primary flex" onclick="confirmSendNotify('${studentId}')">Отправить</button>
    </div>
  `;
  document.getElementById("modal-overlay").classList.add("open");
}

async function confirmSendNotify(studentId) {
  const message = document.getElementById("notify-message").value.trim();
  if (!message) { showToast("Введите сообщение"); return; }
  closeModal();
  showToast("Отправляем...");
  try {
    await dbSendManualNotification(studentId, message);
    showToast("✅ Сообщение отправлено родителю!");
    renderPage();
  } catch (e) {
    console.error(e);
    showToast("❌ Ошибка: " + e.message);
  }
}

function renderGroupsList() {
  let groups = DB.groups;
  const canEdit = currentUser.role === "owner" || currentUser.role === "admin";
  if (currentUser.role === "teacher") {
    groups = DB.groups.filter(g => g.teacherId === currentUser.id);
  }
  return `
    <div class="page-title">${currentUser.role === 'teacher' ? 'Мои группы' : 'Группы'}</div>
    ${canEdit ? `
      <div style="display:flex;gap:8px;margin-bottom:16px;">
        <button class="btn-primary" onclick="openAddGroupModal()" style="flex:1">+ Добавить группу</button>
        <button class="btn-secondary" onclick="openAddTeacherModal()" style="flex:1">+ Добавить учителя</button>
      </div>
    ` : ''}
    ${groups.map(g => {
      const teacher = getTeacher(g.teacherId);
      const studentCount = DB.students.filter(s => s.groupId === g.id).length;
      return `
        <div class="list-item" onclick="openDetail('group','${g.id}')">
          <div class="list-item-main">
            <div class="list-item-title">${g.name}</div>
            <div class="list-item-sub">${g.schedule}${currentUser.role !== 'teacher' ? ' · ' + (teacher ? teacher.name : '') : ''}</div>
          </div>
          <div class="list-item-right"><span class="badge badge-navy">${studentCount} чел.</span></div>
        </div>`;
    }).join("")}
  `;
}

function renderGroupDetail(id) {
  const g = getGroup(id);
  if (!g) return `<div class="empty-state">Группа не найдена</div>`;
  const teacher = getTeacher(g.teacherId);
  const students = DB.students.filter(s => s.groupId === id);
  const lessons = DB.lessons.filter(l => l.groupId === id).sort((a, b) => b.date.localeCompare(a.date));
  const isTeacher = currentUser.role === "teacher";

  return `
    <button class="back-btn" onclick="closeDetail()">← Назад</button>
    <div class="page-title" style="margin-bottom:4px">${g.name}</div>
    <div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">${g.schedule} · ${g.level} · ${teacher ? teacher.name : ''}</div>
    <div class="section-label">Ученики (${students.length})</div>
    ${students.map(s => {
      const badge = paymentStatusBadge(s);
      return `
        <div class="list-item" onclick="openDetail('student','${s.id}')">
          <div class="list-item-main">
            <div class="list-item-title">${s.name}</div>
            <div class="list-item-sub">${s.age} лет</div>
          </div>
          <div class="list-item-right"><span class="badge ${badge.cls}">${badge.text}</span></div>
        </div>`;
    }).join("")}
    <div class="section-label">Занятия</div>
    ${lessons.length === 0 ? `<div class="card"><div style="font-size:13px;color:var(--text-muted)">Занятий пока нет</div></div>` :
      lessons.map(l => `
        <div class="card">
          <div class="row-between" style="margin-bottom:6px">
            <span style="font-weight:600;font-size:14px">${formatDateLong(l.date)}</span>
            <span class="badge ${l.status === 'completed' ? 'badge-ok' : 'badge-navy'}">${l.status === 'completed' ? 'Проведено' : 'Запланировано'}</span>
          </div>
          <div style="font-size:13px;color:var(--text-secondary);margin-bottom:6px">📖 ${l.topic || 'Тема не указана'}</div>
          ${l.teacherComment ? `
            <div style="background:var(--accent-light);border-left:3px solid var(--accent);padding:8px 10px;border-radius:6px;margin-bottom:6px;">
              <div style="font-size:11px;color:var(--accent);font-weight:600;margin-bottom:2px;">💬 Комментарий учителя</div>
              <div style="font-size:13px;line-height:1.4;color:var(--text);">${l.teacherComment}</div>
            </div>
          ` : ''}
          ${l.materials ? `
            <div style="background:#f0f0f0;padding:8px 10px;border-radius:6px;margin-bottom:6px;">
              <div style="font-size:11px;color:var(--text-muted);font-weight:600;margin-bottom:2px;">📎 Материалы</div>
              <div style="font-size:13px;line-height:1.5;color:var(--text);white-space:pre-wrap;">${l.materials}</div>
            </div>
          ` : ''}
          ${isTeacher ? `
            <div style="margin-top:8px">
              ${students.map(s => {
                const att = DB.attendance[l.id] && DB.attendance[l.id][s.id];
                return `
                  <div class="lesson-row">
                    <div class="check-circle ${att === 'present' ? 'done' : ''}" onclick="markAttendance('${l.id}','${s.id}','present')">${att === 'present' ? '✓' : ''}</div>
                    <div class="check-circle absent ${att === 'absent' ? 'absent' : ''}" onclick="markAttendance('${l.id}','${s.id}','absent')">${att === 'absent' ? '×' : ''}</div>
                    <div style="font-size:13px;flex:1">${s.name}</div>
                  </div>`;
              }).join("")}
            </div>
          ` : ''}
        </div>
      `).join("")
    }
    ${isTeacher ? `<button class="btn-primary" onclick="openAddLessonModal('${id}')">+ Добавить занятие</button>` : ''}
  `;
}

async function markAttendance(lessonId, studentId, status) {
  try {
    await dbMarkAttendance(lessonId, studentId, status);
    renderPage();
    showToast("Посещаемость обновлена");
  } catch (e) {
    console.error(e);
    showToast("Ошибка сохранения.");
  }
}

function openAddLessonModal(groupId) {
  const today = new Date().toISOString().slice(0, 10);
  const sheet = document.getElementById("modal-sheet");
  sheet.innerHTML = `
    <div class="modal-title">Новое занятие</div>
    <div class="form-group"><label class="form-label">Дата</label><input class="form-input" type="date" id="lesson-date" value="${today}"></div>
    <div class="form-group"><label class="form-label">Тема занятия</label><input class="form-input" id="lesson-topic" placeholder="Например: Past Simple — практика"></div>
    <div class="form-group">
      <label class="form-label">💬 Комментарий (что прошли / что повторить)</label>
      <textarea class="form-input" id="lesson-comment" placeholder="Например: Прошли Present Perfect. На следующем занятии — повторить неправильные глаголы."></textarea>
    </div>
    <div class="form-group">
      <label class="form-label"> Материалы (ссылки, PDF, видео)</label>
      <textarea class="form-input" id="lesson-materials" placeholder="Например:&#10;• https://example.com/worksheet.pdf&#10;• Видео: https://youtube.com/...&#10;• Учебник: стр. 45-47"></textarea>
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Отмена</button>
      <button class="btn-primary flex" onclick="confirmAddLesson('${groupId}')">Создать</button>
    </div>
  `;
  document.getElementById("modal-overlay").classList.add("open");
}

async function confirmAddLesson(groupId) {
  const date = document.getElementById("lesson-date").value;
  const topic = document.getElementById("lesson-topic").value.trim() || "Занятие";
  const comment = document.getElementById("lesson-comment").value.trim();
  const materials = document.getElementById("lesson-materials").value.trim();
  closeModal();
  showToast("Сохраняем...");
  try {
    await dbAddLesson(groupId, date, topic, materials, comment);
    showToast("Занятие добавлено");
    renderPage();
  } catch (e) {
    console.error(e);
    showToast("Ошибка сохранения.");
  }
}

function renderPaymentsPage() {
  if (currentUser.role === "parent") return renderParentPayments();
  const allPayments = [...DB.payments].sort((a, b) => b.date.localeCompare(a.date));
  const monthPrefix = getCurrentMonthPrefix();
  const monthTotal = DB.payments.filter(p => p.date.startsWith(monthPrefix)).reduce((s, p) => s + p.amount, 0);
  const expiring = DB.students.filter(s => daysUntil(s.nextPaymentDate) <= 5 || remainingLessons(s) <= 2);

  return `
    <div class="page-title">Оплаты</div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <div style="font-size:14px;color:var(--text-secondary);">Всего оплат: ${allPayments.length}</div>
      <button class="btn-secondary" onclick="exportPaymentsToCSV()" style="padding:8px 12px;font-size:13px;">⬇ Экспорт в CSV</button>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value">${monthTotal.toLocaleString('ru-RU')} ₽</div><div class="stat-label">Поступления за ${getCurrentMonthName()}</div></div>
      <div class="stat-card"><div class="stat-value" style="color:${expiring.length ? 'var(--danger)' : 'var(--navy)'}">${expiring.length}</div><div class="stat-label">Нужно продлить</div></div>
    </div>
    <div class="section-label"> Требуют оплаты</div>
    ${expiring.length === 0 ? `<div class="empty-state" style="padding:20px"><div class="empty-state-icon">✓</div>Все оплачено</div>` :
      expiring.map(s => {
        const badge = paymentStatusBadge(s);
        return `
          <div class="list-item" onclick="openDetail('student','${s.id}')">
            <div class="list-item-main">
              <div class="list-item-title">${s.name}</div>
              <div class="list-item-sub">${getGroup(s.groupId)?.name || ''}</div>
            </div>
            <div class="list-item-right"><span class="badge ${badge.cls}">${badge.text}</span></div>
          </div>`;
      }).join("")
    }
    <div class="section-label">Последние оплаты</div>
    ${allPayments.slice(0, 10).map(p => {
      const s = getStudent(p.studentId);
      return `
        <div class="list-item" style="cursor:default">
          <div class="list-item-main">
            <div class="list-item-title">${s ? s.name : '—'}</div>
            <div class="list-item-sub">${p.lessons} занятий</div>
          </div>
          <div class="list-item-right">
            <div style="font-weight:700">${p.amount.toLocaleString('ru-RU')} ₽</div>
            <div style="font-size:11px;color:var(--text-muted)">${formatDate(p.date)}</div>
          </div>
        </div>`;
    }).join("")}
  `;
}

function exportPaymentsToCSV() {
  const payments = [...DB.payments].sort((a, b) => b.date.localeCompare(a.date));
  if (payments.length === 0) { showToast("Нет оплат для экспорта"); return; }
  let csv = "Дата;Ученик;Сумма (₽);Кол-во занятий\n";
  payments.forEach(p => {
    const student = getStudent(p.studentId);
    const name = student ? student.name.replace(/;/g, ',') : 'Неизвестный';
    csv += `${p.date};${name};${p.amount};${p.lessons}\n`;
  });
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `payments_${new Date().toISOString().slice(0,10)}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("Файл скачан");
}

function renderParentPayments() {
  const students = studentsForParent();
  return `<div class="page-title">Оплата</div> ${students.map(s => {
    const badge = paymentStatusBadge(s);
    const remaining = remainingLessons(s);
    const progressPct = Math.round((s.subscriptionUsed / s.subscriptionTotal) * 100);
    const payments = DB.payments.filter(p => p.studentId === s.id).sort((a, b) => b.date.localeCompare(a.date));
    return `
      <div class="card">
        <div class="row-between">
          <span style="font-weight:700;font-size:16px">${s.name}</span>
          <span class="badge ${badge.cls}">${badge.text}</span>
        </div>
        <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${progressPct}%"></div></div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px">Осталось ${remaining} из ${s.subscriptionTotal} занятий</div>
        <div class="divider"></div>
        <div class="row-between" style="font-size:13px">
          <span style="color:var(--text-secondary)">Следующая оплата</span>
          <span style="font-weight:600">${formatDate(s.nextPaymentDate)} · ${s.paymentAmount.toLocaleString('ru-RU')} ₽</span>
        </div>
      </div>
      <div class="section-label">История оплат — ${s.name}</div>
      ${payments.map(p => `
        <div class="list-item" style="cursor:default">
          <div class="list-item-main">
            <div class="list-item-title">${p.amount.toLocaleString('ru-RU')} ₽</div>
            <div class="list-item-sub">${p.lessons} занятий</div>
          </div>
          <div class="list-item-right" style="font-size:13px;color:var(--text-secondary)">${formatDate(p.date)}</div>
        </div>
      `).join("")}
    `;
  }).join("")}`;
}

function renderHomeworkPage() {
  if (currentUser.role === "teacher") return renderTeacherHomework();
  if (currentUser.role === "parent") return renderParentHomework();
  return `<div class="empty-state">Недоступно</div>`;
}

function renderTeacherHomework() {
  const myStudents = studentsForTeacher(currentUser.id);
  const myHomework = DB.homework.filter(h => myStudents.some(s => s.id === h.studentId)).sort((a, b) => b.date.localeCompare(a.date));
  return `
    <div class="page-title">Домашние задания</div>
    <button class="btn-primary" onclick="openAddHomeworkModal()">+ Задать ДЗ</button>
    <div style="height:14px"></div>
    ${myHomework.length === 0 ? `<div class="empty-state">Заданий пока нет</div>` :
      myHomework.map(hw => {
        const s = getStudent(hw.studentId);
        return `
          <div class="card">
            <div class="row-between" style="margin-bottom:6px">
              <span style="font-weight:600;font-size:14px">${s ? s.name : '—'}</span>
              <span style="font-size:12px;color:var(--text-muted)">${formatDate(hw.date)}</span>
            </div>
            <div style="font-size:14px;line-height:1.5">${hw.text}</div>
          </div>`;
      }).join("")
    }
  `;
}

function openAddHomeworkModal() {
  const myStudents = studentsForTeacher(currentUser.id);
  const sheet = document.getElementById("modal-sheet");
  sheet.innerHTML = `
    <div class="modal-title">Задать домашнее задание</div>
    <div class="form-group">
      <label class="form-label">Ученик</label>
      <select class="form-input" id="hw-student">
        ${myStudents.map(s => `<option value="${s.id}">${s.name}</option>`).join("")}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Задание</label>
      <textarea class="form-input" id="hw-text" placeholder="Опишите задание"></textarea>
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Отмена</button>
      <button class="btn-primary flex" onclick="confirmAddHomework()">Сохранить</button>
    </div>
  `;
  document.getElementById("modal-overlay").classList.add("open");
}

async function confirmAddHomework() {
  const studentId = document.getElementById("hw-student").value;
  const text = document.getElementById("hw-text").value.trim();
  if (!text) { showToast("Введите текст задания"); return; }
  const student = getStudent(studentId);
  closeModal();
  showToast("Сохраняем...");
  try {
    await dbAddHomework(studentId, student.groupId, text);
    showToast("Задание добавлено");
    renderPage();
  } catch (e) {
    console.error(e);
    showToast("Ошибка сохранения.");
  }
}

function renderParentHomework() {
  const students = studentsForParent();
  const ids = students.map(s => s.id);
  const homework = DB.homework.filter(h => ids.includes(h.studentId)).sort((a, b) => b.date.localeCompare(a.date));
  return `
    <div class="page-title">Домашние задания</div>
    ${homework.length === 0 ? `<div class="empty-state">Заданий пока нет</div>` :
      homework.map(hw => {
        const s = getStudent(hw.studentId);
        return `
          <div class="card">
            <div class="row-between" style="margin-bottom:6px">
              <span style="font-weight:600;font-size:14px">${s ? s.name : ''}</span>
              <span style="font-size:12px;color:var(--text-muted)">${formatDate(hw.date)}</span>
            </div>
            <div style="font-size:14px;line-height:1.5">${hw.text}</div>
          </div>`;
      }).join("")
    }
  `;
}

function renderFeedbackPage() {
  const myStudents = studentsForTeacher(currentUser.id);
  const myFeedback = DB.feedback.filter(f => myStudents.some(s => s.id === f.studentId) && !f.text.startsWith('[УВЕДОМЛЕНИЕ')).sort((a, b) => b.date.localeCompare(a.date));
  return `
    <div class="page-title">Фидбэк ученикам</div>
    <button class="btn-primary" onclick="openAddFeedbackModal()">+ Оставить фидбэк</button>
    <div style="height:14px"></div>
    ${myFeedback.length === 0 ? `<div class="empty-state">Фидбэка пока нет</div>` :
      myFeedback.map(f => {
        const s = getStudent(f.studentId);
        return `
          <div class="card">
            <div class="row-between" style="margin-bottom:6px">
              <span style="font-weight:600;font-size:14px">${s ? s.name : '—'}</span>
              <span style="font-size:12px;color:var(--text-muted)">${formatDate(f.date)}</span>
            </div>
            <div style="font-size:14px;line-height:1.5">${f.text}</div>
          </div>`;
      }).join("")
    }
  `;
}

function openAddFeedbackModal() {
  const myStudents = studentsForTeacher(currentUser.id);
  const sheet = document.getElementById("modal-sheet");
  sheet.innerHTML = `
    <div class="modal-title">Оставить фидбэк</div>
    <div class="form-group">
      <label class="form-label">Ученик</label>
      <select class="form-input" id="fb-student">
        ${myStudents.map(s => `<option value="${s.id}">${s.name}</option>`).join("")}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Фидбэк</label>
      <textarea class="form-input" id="fb-text" placeholder="Как прошло занятие, над чем работать"></textarea>
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Отмена</button>
      <button class="btn-primary flex" onclick="confirmAddFeedback()">Сохранить</button>
    </div>
  `;
  document.getElementById("modal-overlay").classList.add("open");
}

async function confirmAddFeedback() {
  const studentId = document.getElementById("fb-student").value;
  const text = document.getElementById("fb-text").value.trim();
  if (!text) { showToast("Введите текст фидбэка"); return; }
  closeModal();
  showToast("Сохраняем...");
  try {
    await dbAddFeedback(studentId, currentUser.id, text);
    showToast("Фидбэк сохранён");
    renderPage();
  } catch (e) {
    console.error(e);
    showToast("Ошибка сохранения.");
  }
}

function renderChildPage() {
  const students = studentsForParent();
  if (students.length === 0) return `<div class="empty-state">Нет привязанных учеников</div>`;
  return students.map(s => {
    const group = getGroup(s.groupId);
    const teacher = group ? getTeacher(group.teacherId) : null;
    const badge = paymentStatusBadge(s);
    const progressPct = Math.round((s.subscriptionUsed / s.subscriptionTotal) * 100);
    const feedback = DB.feedback.filter(f => f.studentId === s.id && !f.text.startsWith('[УВЕДОМЛЕНИЕ')).sort((a, b) => b.date.localeCompare(a.date));
    return `
      <div class="detail-header">
        <div class="avatar">${getInitials(s.name)}</div>
        <div>
          <div class="detail-name">${s.name}</div>
          <div class="detail-sub">${group ? group.name : ''}</div>
        </div>
      </div>
      <div class="card">
        <div class="row-between">
          <span style="font-size:13px;font-weight:600;color:var(--text-secondary)">Абонемент</span>
          <span class="badge ${badge.cls}">${badge.text}</span>
        </div>
        <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${progressPct}%"></div></div>
        <div style="font-size:12px;color:var(--text-muted)">Использовано ${s.subscriptionUsed} из ${s.subscriptionTotal} занятий</div>
        <div class="divider"></div>
        <div class="row-between" style="font-size:13px;margin-bottom:6px">
          <span style="color:var(--text-secondary)">Преподаватель</span>
          <span style="font-weight:600">${teacher ? teacher.name : '—'}</span>
        </div>
        <div class="row-between" style="font-size:13px">
          <span style="color:var(--text-secondary)">Расписание</span>
          <span style="font-weight:600">${group ? group.schedule : '—'}</span>
        </div>
      </div>
      <div class="section-label">Фидбэк от преподавателя</div>
      ${feedback.length === 0 ? `<div class="card"><div style="font-size:13px;color:var(--text-muted)">Фидбэка пока нет</div></div>` :
        feedback.map(f => `
          <div class="card">
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">${formatDate(f.date)}</div>
            <div style="font-size:14px;line-height:1.5">${f.text}</div>
          </div>
        `).join("")
      }
    `;
  }).join("<div style='height:24px'></div>");
}

function openAddStudentModal() {
  const groups = DB.groups;
  const sheet = document.getElementById("modal-sheet");
  sheet.innerHTML = `
    <div class="modal-title">Новый ученик</div>
    <div class="form-group"><label class="form-label">ФИО ученика</label><input class="form-input" id="st-name" placeholder="Иванов Иван"></div>
    <div class="form-group"><label class="form-label">Возраст</label><input class="form-input" type="number" id="st-age" value="10"></div>
    <div class="form-group"><label class="form-label">Группа</label><select class="form-input" id="st-group">${groups.map(g => `<option value="${g.id}">${g.name} (${g.schedule})</option>`).join("")}</select></div>
    <div class="divider"></div>
    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">Данные родителя (создаётся автоматически)</div>
    <div class="form-group"><label class="form-label">ФИО родителя</label><input class="form-input" id="st-parent" placeholder="Иванова Мария"></div>
    <div class="form-group"><label class="form-label">📱 Телефон родителя</label><input class="form-input" id="st-phone" placeholder="+7 900 123 45 67"></div>
    <div class="form-group"><label class="form-label">✉️ Email родителя</label><input class="form-input" id="st-email" placeholder="parent@example.com"></div>
    <div class="divider"></div>
    <div class="form-group"><label class="form-label">Кол-во занятий в абонементе</label><input class="form-input" type="number" id="st-lessons" value="8"></div>
    <div class="form-group"><label class="form-label">Сумма оплаты (₽)</label><input class="form-input" type="number" id="st-amount" value="4000"></div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Отмена</button>
      <button class="btn-primary flex" onclick="confirmAddStudent()">Создать</button>
    </div>
  `;
  document.getElementById("modal-overlay").classList.add("open");
}

async function confirmAddStudent() {
  const name = document.getElementById("st-name").value.trim();
  const age = document.getElementById("st-age").value;
  const groupId = document.getElementById("st-group").value;
  const parentName = document.getElementById("st-parent").value.trim();
  const parentPhone = document.getElementById("st-phone").value.trim();
  const parentEmail = document.getElementById("st-email").value.trim();
  const lessons = document.getElementById("st-lessons").value;
  const amount = document.getElementById("st-amount").value;
  if (!name || !parentName) { showToast("Заполните имя ученика и родителя"); return; }
  closeModal();
  showToast("Создаём ученика...");
  try {
    const result = await dbAddStudent({ name, age, groupId, parentName, parentPhone, parentEmail, lessons, amount });
    showToast(`Ученик добавлен! Логин: ${result.parentLogin}, пароль: ${result.parentPassword}, код Telegram: ${result.bindCode}`);
    renderPage();
  } catch (e) {
    console.error(e);
    showToast("Ошибка: " + e.message);
  }
}

function openAddTeacherModal() {
  const sheet = document.getElementById("modal-sheet");
  sheet.innerHTML = `
    <div class="modal-title">Новый учитель</div>
    <div class="form-group"><label class="form-label">ФИО учителя</label><input class="form-input" id="t-name" placeholder="Петрова Анна Сергеевна"></div>
    <div class="form-group"><label class="form-label">Логин для входа</label><input class="form-input" id="t-login" placeholder="petrova"></div>
    <div class="form-group"><label class="form-label">Пароль</label><input class="form-input" id="t-password" value="teacher123"></div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Отмена</button>
      <button class="btn-primary flex" onclick="confirmAddTeacher()">Создать</button>
    </div>
  `;
  document.getElementById("modal-overlay").classList.add("open");
}

async function confirmAddTeacher() {
  const name = document.getElementById("t-name").value.trim();
  const login = document.getElementById("t-login").value.trim();
  const password = document.getElementById("t-password").value;
  if (!name || !login) { showToast("Заполните имя и логин"); return; }
  closeModal();
  showToast("Создаём учителя...");
  try {
    await dbAddTeacher({ name, login, password });
    showToast(`Учитель добавлен! Логин: ${login}, пароль: ${password}`);
    renderPage();
  } catch (e) {
    console.error(e);
    showToast("Ошибка: " + e.message);
  }
}

function openAddGroupModal() {
  const teachers = DB.teachers;
  const sheet = document.getElementById("modal-sheet");
  sheet.innerHTML = `
    <div class="modal-title">Новая группа</div>
    <div class="form-group"><label class="form-label">Название группы</label><input class="form-input" id="gr-name" placeholder="Beginners Mon-Wed"></div>
    <div class="form-group"><label class="form-label">Преподаватель</label><select class="form-input" id="gr-teacher">${teachers.map(t => `<option value="${t.id}">${t.name}</option>`).join("")}</select></div>
    <div class="form-group"><label class="form-label">Расписание</label><input class="form-input" id="gr-schedule" placeholder="Пн/Ср/Пт 16:00"></div>
    <div class="form-group"><label class="form-label">Уровень</label><input class="form-input" id="gr-level" placeholder="A1 Beginner"></div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Отмена</button>
      <button class="btn-primary flex" onclick="confirmAddGroup()">Создать</button>
    </div>
  `;
  document.getElementById("modal-overlay").classList.add("open");
}

async function confirmAddGroup() {
  const name = document.getElementById("gr-name").value.trim();
  const teacherId = document.getElementById("gr-teacher").value;
  const schedule = document.getElementById("gr-schedule").value.trim();
  const level = document.getElementById("gr-level").value.trim();
  if (!name || !schedule) { showToast("Заполните название и расписание"); return; }
  closeModal();
  showToast("Создаём группу...");
  try {
    await dbAddGroup({ name, teacherId, schedule, level });
    showToast("Группа создана!");
    renderPage();
  } catch (e) {
    console.error(e);
    showToast("Ошибка: " + e.message);
  }
}

document.getElementById("password-input").addEventListener("keydown", e => {
  if (e.key === "Enter") doLogin();
});
document.getElementById("modal-overlay").addEventListener("click", e => {
  if (e.target.id === "modal-overlay") closeModal();
});

initData().then(() => {
  tryRestoreSession();
});
