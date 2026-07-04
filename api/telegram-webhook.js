// ===== EngLand CRM — Telegram Webhook (Vercel Serverless) =====
// Работает БЕЗ npm-пакетов, только через fetch

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

// ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====

// Отправка сообщения в Telegram
async function sendTelegramMessage(chatId, text) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
    }),
  });
  const data = await res.json();
  console.log('Telegram response:', data);
  return data.ok;
}

// Запрос к Supabase REST API
async function supabaseQuery(table, params = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}${params}`;
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('Supabase error:', err);
    throw new Error(`Supabase ${table}: ${err}`);
  }
  return res.json();
}

// Обновление в Supabase
async function supabaseUpdate(table, body, params) {
  const url = `${SUPABASE_URL}/rest/v1/${table}${params}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('Supabase update error:', err);
  }
}

// ===== ОБРАБОТКА КОМАНД ОТ БОТА =====
async function handleCommand(update) {
  const message = update.message;
  if (!message) return;

  const chatId = message.chat.id;
  const text = (message.text || '').trim();

  console.log('Command from chat', chatId, ':', text);

  // /start
  if (text === '/start') {
    await sendTelegramMessage(chatId,
      '👋 Привет! Я бот языковой школы EngLand.\n\n' +
      'Чтобы привязать аккаунт, напишите:\n' +
      '/bind КОД\n\n' +
      'КОД — это 6-значный код из карточки ребёнка в приложении EngLand.'
    );
    return;
  }

  // /bind КОД
  if (text.startsWith('/bind ')) {
    const code = text.split(' ')[1]?.trim();
    if (!code || code.length !== 6) {
      await sendTelegramMessage(chatId, '❌ Неверный формат. Напишите /bind и 6-значный код.');
      return;
    }

    // Ищем ученика по bind_code
    const students = await supabaseQuery('students', `?select=id,name,parent_login&bind_code=eq.${code}`);
    const student = students[0];

    if (!student) {
      await sendTelegramMessage(chatId, '❌ Ученик с таким кодом не найден. Проверьте код в приложении.');
      return;
    }

    // Сохраняем chat_id в таблицу users
    await supabaseUpdate('users',
      { telegram_chat_id: String(chatId) },
      `?login=eq.${student.parent_login}`
    );

    await sendTelegramMessage(chatId,
      `✅ Привязка успешна!\n\n` +
      `Вы будете получать уведомления о занятиях <b>${student.name}</b>.\n\n` +
      `Команды:\n/status — статус абонемента\n/help — помощь`
    );
    return;
  }

  // /status
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
      msg += `👤 <b>${s.name}</b>\n`;
      msg += `   Осталось занятий: ${remaining} из ${s.subscription_total}\n`;
      msg += `   Следующая оплата: через ${days} дн.\n\n`;
    });

    await sendTelegramMessage(chatId, msg);
    return;
  }

  // /help
  if (text === '/help') {
    await sendTelegramMessage(chatId,
      '📚 <b>Команды бота EngLand:</b>\n\n' +
      '/start — приветствие\n' +
      '/bind КОД — привязать аккаунт\n' +
      '/status — статус абонемента\n' +
      '/help — эта справка'
    );
    return;
  }

  // Неизвестная команда
  await sendTelegramMessage(chatId, 'Неизвестная команда. Напишите /help для списка команд.');
}

// ===== ОТПРАВКА УВЕДОМЛЕНИЯ О ПОСЕЩАЕМОСТИ =====
async function sendAttendanceNotification(studentId, lessonId) {
  console.log('Sending attendance notification:', studentId, lessonId);

  // Получаем данные ученика
  const students = await supabaseQuery('students', `?select=*,parent_login,group_id&id=eq.${studentId}`);
  const student = students[0];
  if (!student) { console.error('Student not found'); return { ok: false }; }

  // Получаем chat_id родителя
  const users = await supabaseQuery('users', `?select=telegram_chat_id&login=eq.${student.parent_login}`);
  const user = users[0];
  if (!user?.telegram_chat_id) {
    console.log('Parent not bound to Telegram');
    return { ok: false, error: 'not_bound' };
  }

  // Получаем данные группы
  const groups = await supabaseQuery('groups', `?select=name&id=eq.${student.group_id}`);
  const group = groups[0];

  // Получаем данные занятия
  const lessons = await supabaseQuery('lessons', `?select=topic,date&id=eq.${lessonId}`);
  const lesson = lessons[0];

  // Получаем статус посещаемости
  const attendance = await supabaseQuery('attendance', `?select=status&lesson_id=eq.${lessonId}&student_id=eq.${studentId}`);
  const status = attendance[0]?.status;

  // Ищем последнее ДЗ
  const homework = await supabaseQuery('homework', `?select=text&student_id=eq.${studentId}&order=date.desc&limit=1`);
  const hw = homework[0];

  const statusText = status === 'present' ? '✅ была' : '❌ отсутствовала';
  const dateStr = lesson?.date ? new Date(lesson.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : '';

  let msg = `📚 <b>Занятие ${dateStr}</b>\n\n`;
  msg += `${student.name} ${statusText} на занятии группы "${group?.name || ''}".\n`;
  msg += `Тема: ${lesson?.topic || 'не указана'}`;
  if (hw?.text) msg += `\n\n📝 <b>Домашнее задание:</b>\n${hw.text}`;

  const ok = await sendTelegramMessage(user.telegram_chat_id, msg);
  return { ok };
}

// ===== ОТПРАВКА УВЕДОМЛЕНИЯ О ДЗ =====
async function sendHomeworkNotification(homeworkId) {
  console.log('Sending homework notification:', homeworkId);

  const homeworkList = await supabaseQuery('homework', `?select=*&id=eq.${homeworkId}`);
  const hw = homeworkList[0];
  if (!hw) { console.error('Homework not found'); return { ok: false }; }

  const students = await supabaseQuery('students', `?select=name,parent_login&id=eq.${hw.student_id}`);
  const student = students[0];
  if (!student) { console.error('Student not found'); return { ok: false }; }

  const users = await supabaseQuery('users', `?select=telegram_chat_id&login=eq.${student.parent_login}`);
  const user = users[0];
  if (!user?.telegram_chat_id) {
    console.log('Parent not bound to Telegram');
    return { ok: false, error: 'not_bound' };
  }

  const msg = `📝 <b>Новое домашнее задание</b>\n\n${student.name}, вот твоё задание:\n\n${hw.text}`;
  const ok = await sendTelegramMessage(user.telegram_chat_id, msg);
  return { ok };
}

// ===== ГЛАВНЫЙ ОБРАБОТЧИК =====
export default async function handler(req, res) {
  console.log('=== Webhook called ===');
  console.log('Method:', req.method);
  console.log('Has TELEGRAM_BOT_TOKEN:', !!BOT_TOKEN);
  console.log('Has SUPABASE_URL:', !!SUPABASE_URL);

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Проверка переменных окружения
  if (!BOT_TOKEN) {
    console.error('TELEGRAM_BOT_TOKEN is missing!');
    res.status(500).json({ error: 'Bot token not configured' });
    return;
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Supabase credentials missing!');
    res.status(500).json({ error: 'Supabase not configured' });
    return;
  }

  try {
    // Webhook от Telegram
    if (req.method === 'POST' && req.body?.update_id) {
      console.log('Telegram update received');
      await handleCommand(req.body);
      res.status(200).json({ ok: true });
      return;
    }

    // GET — проверка работоспособности
    if (req.method === 'GET') {
      res.status(200).json({ ok: true, message: 'Webhook is working' });
      return;
    }

    // Вызов из CRM
    if (req.method === 'POST' && req.body?.action) {
      console.log('CRM action:', req.body.action);
      let result;
      if (req.body.action === 'attendance') {
        result = await sendAttendanceNotification(req.body.studentId, req.body.lessonId);
      } else if (req.body.action === 'homework') {
        result = await sendHomeworkNotification(req.body.homeworkId);
      } else {
        result = { ok: false, error: 'unknown action' };
      }
      res.status(200).json(result);
      return;
    }

    res.status(400).json({ error: 'bad request' });
  } catch (e) {
    console.error('=== Webhook ERROR ===');
    console.error(e);
    res.status(500).json({ error: e.message, stack: e.stack });
  }
}
