// ===== EngLand CRM — Telegram Webhook =====
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

async function sendTelegramMessage(chatId, text) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
  return res.json();
}

async function supabaseQuery(table, params = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}${params}`;
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Supabase ${table}: ${await res.text()}`);
  return res.json();
}

async function supabaseUpdate(table, body, params) {
  const url = `${SUPABASE_URL}/rest/v1/${table}${params}`;
  await fetch(url, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(body),
  });
}

async function handleCommand(update) {
  const message = update.message;
  if (!message) return;
  const chatId = message.chat.id;
  const text = (message.text || '').trim();

  if (text === '/start') {
    await sendTelegramMessage(chatId,
      '👋 Привет! Я бот языковой школы EngLand.\n\n' +
      'Чтобы привязать аккаунт, напишите:\n' +
      '/bind КОД\n\n' +
      'КОД — это 6-значный код из карточки ребёнка в приложении EngLand.'
    );
    return;
  }

  if (text.startsWith('/bind ')) {
    const code = text.split(' ')[1]?.trim();
    if (!code || code.length !== 6) {
      await sendTelegramMessage(chatId, '❌ Неверный формат. Напишите /bind и 6-значный код.');
      return;
    }
    const students = await supabaseQuery('students', `?select=id,name,parent_login&bind_code=eq.${code}`);
    const student = students[0];
    if (!student) {
      await sendTelegramMessage(chatId, '❌ Ученик с таким кодом не найден.');
      return;
    }
    await supabaseUpdate('users', { telegram_chat_id: String(chatId) }, `?login=eq.${student.parent_login}`);
    await sendTelegramMessage(chatId,
      `✅ Привязка успешна!\n\nВы будете получать уведомления о занятиях <b>${student.name}</b>.\n\nКоманды:\n/status — статус абонемента\n/help — помощь`
    );
    return;
  }

  if (text === '/status') {
    const users = await supabaseQuery('users', `?select=student_ids&telegram_chat_id=eq.${chatId}`);
    const user = users[0];
    if (!user || !user.student_ids || user.student_ids.length === 0) {
      await sendTelegramMessage(chatId, '⚠️ Аккаунт не привязан. Напишите /bind КОД');
      return;
    }
    const ids = user.student_ids.map(id => `id=eq.${id}`).join('&or=');
    const students = await supabaseQuery('students', `?select=name,subscription_total,subscription_used,next_payment_date&${ids}`);
    let msg = '📊 <b>Статус абонементов:</b>\n\n';
    students.forEach(s => {
      const remaining = s.subscription_total - s.subscription_used;
      const days = Math.round((new Date(s.next_payment_date) - new Date()) / 86400000);
      msg += `👤 <b>${s.name}</b>\n   Осталось занятий: ${remaining} из ${s.subscription_total}\n   Следующая оплата: через ${days} дн.\n\n`;
    });
    await sendTelegramMessage(chatId, msg);
    return;
  }

  if (text === '/help') {
    await sendTelegramMessage(chatId,
      ' <b>Команды бота EngLand:</b>\n\n' +
      '/start — приветствие\n' +
      '/bind КОД — привязать аккаунт\n' +
      '/status — статус абонемента\n' +
      '/help — эта справка'
    );
    return;
  }

  await sendTelegramMessage(chatId, 'Неизвестная команда. Напишите /help');
}

async function sendAttendanceNotification(studentId, lessonId) {
  const students = await supabaseQuery('students', `?select=*,parent_login,group_id&id=eq.${studentId}`);
  const student = students[0];
  if (!student) return { ok: false };

  const users = await supabaseQuery('users', `?select=telegram_chat_id&login=eq.${student.parent_login}`);
  const user = users[0];
  if (!user?.telegram_chat_id) return { ok: false, error: 'not_bound' };

  const groups = await supabaseQuery('groups', `?select=name&id=eq.${student.group_id}`);
  const group = groups[0];
  const lessons = await supabaseQuery('lessons', `?select=topic,date,materials,teacher_comment&id=eq.${lessonId}`);
  const lesson = lessons[0];
  const attendance = await supabaseQuery('attendance', `?select=status&lesson_id=eq.${lessonId}&student_id=eq.${studentId}`);
  const status = attendance[0]?.status;
  const homework = await supabaseQuery('homework', `?select=text&student_id=eq.${studentId}&order=date.desc&limit=1`);
  const hw = homework[0];

  const statusText = status === 'present' ? '✅ была на занятии' : '❌ отсутствовала';
  const dateStr = lesson?.date ? new Date(lesson.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : '';

  let msg = ` <b>Занятие ${dateStr}</b>\n\n`;
  msg += `${student.name} ${statusText} в группе "${group?.name || ''}".\n`;
  msg += ` Тема: ${lesson?.topic || 'не указана'}`;
  if (lesson?.teacher_comment) msg += `\n\n <b>Комментарий учителя:</b>\n${lesson.teacher_comment}`;
  if (lesson?.materials) msg += `\n\n📎 <b>Материалы:</b>\n${lesson.materials}`;
  if (hw?.text) msg += `\n\n📝 <b>Домашнее задание:</b>\n${hw.text}`;

  const ok = await sendTelegramMessage(user.telegram_chat_id, msg);
  return { ok: ok.ok };
}

async function sendHomeworkNotification(homeworkId) {
  const homeworkList = await supabaseQuery('homework', `?select=*&id=eq.${homeworkId}`);
  const hw = homeworkList[0];
  if (!hw) return { ok: false };

  const students = await supabaseQuery('students', `?select=name,parent_login&id=eq.${hw.student_id}`);
  const student = students[0];
  if (!student) return { ok: false };

  const users = await supabaseQuery('users', `?select=telegram_chat_id&login=eq.${student.parent_login}`);
  const user = users[0];
  if (!user?.telegram_chat_id) return { ok: false, error: 'not_bound' };

  const msg = `📝 <b>Новое домашнее задание</b>\n\n${student.name}, вот твоё задание:\n\n${hw.text}`;
  const ok = await sendTelegramMessage(user.telegram_chat_id, msg);
  return { ok: ok.ok };
}

// 🔔 НОВОЕ: ручное уведомление от учителя
async function sendManualNotification(studentId, message) {
  const students = await supabaseQuery('students', `?select=name,parent_login&id=eq.${studentId}`);
  const student = students[0];
  if (!student) return { ok: false, error: 'student not found' };

  const users = await supabaseQuery('users', `?select=telegram_chat_id&login=eq.${student.parent_login}`);
  const user = users[0];
  if (!user?.telegram_chat_id) return { ok: false, error: 'parent not bound to Telegram' };

  const msg = ` <b>Сообщение от преподавателя</b>\n\n` +
              `Здравствуйте! Это сообщение касается <b>${student.name}</b>:\n\n${message}`;
  const ok = await sendTelegramMessage(user.telegram_chat_id, msg);
  return { ok: ok.ok };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  if (!BOT_TOKEN) { res.status(500).json({ error: 'Bot token not configured' }); return; }
  if (!SUPABASE_URL || !SUPABASE_KEY) { res.status(500).json({ error: 'Supabase not configured' }); return; }

  try {
    if (req.method === 'POST' && req.body?.update_id) {
      await handleCommand(req.body);
      res.status(200).json({ ok: true });
      return;
    }
    if (req.method === 'GET') {
      res.status(200).json({ ok: true, message: 'Webhook is working' });
      return;
    }
    if (req.method === 'POST' && req.body?.action) {
      let result;
      if (req.body.action === 'attendance') {
        result = await sendAttendanceNotification(req.body.studentId, req.body.lessonId);
      } else if (req.body.action === 'homework') {
        result = await sendHomeworkNotification(req.body.homeworkId);
      } else if (req.body.action === 'manual_notify') {
        result = await sendManualNotification(req.body.studentId, req.body.message);
      } else {
        result = { ok: false, error: 'unknown action' };
      }
      res.status(200).json(result);
      return;
    }
    res.status(400).json({ error: 'bad request' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}
