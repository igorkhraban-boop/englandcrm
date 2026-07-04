// ===== EngLand CRM — Telegram Webhook (Vercel Serverless Function) =====
// Обрабатывает команды от бота и отправляет уведомления родителям

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BOT_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Вспомогательная функция: отправить сообщение
async function sendMessage(chatId, text) {
  const res = await fetch(`${BOT_API}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
    }),
  });
  const data = await res.json();
  if (!data.ok) console.error('Telegram error:', data);
  return data.ok;
}

// Вспомогательная функция: подключиться к Supabase напрямую
async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );
}

// ===== ОБРАБОТКА КОМАНД ОТ БОТА =====
async function handleCommand(update) {
  const message = update.message;
  if (!message) return;
  
  const chatId = message.chat.id;
  const text = message.text || '';
  const supabase = await getSupabase();

  // Команда /start
  if (text === '/start') {
    await sendMessage(chatId, 
      ' Привет! Я бот языковой школы EngLand.\n\n' +
      'Чтобы привязать аккаунт, напишите:\n' +
      '/bind КОД\n\n' +
      'КОД — это 6-значный код из карточки ребёнка в приложении EngLand.'
    );
    return;
  }

  // Команда /bind КОД
  if (text.startsWith('/bind ')) {
    const code = text.split(' ')[1]?.trim();
    if (!code || code.length !== 6) {
      await sendMessage(chatId, '❌ Неверный формат. Напишите /bind и 6-значный код.');
      return;
    }

    // Ищем ученика по коду
    const { data: student } = await supabase
      .from('students')
      .select('*, parent_login')
      .eq('bind_code', code)
      .single();

    if (!student) {
      await sendMessage(chatId, '❌ Ученик с таким кодом не найден. Проверьте код в приложении.');
      return;
    }

    // Сохраняем chat_id в таблицу users
    const { error } = await supabase
      .from('users')
      .update({ telegram_chat_id: String(chatId) })
      .eq('login', student.parent_login);

    if (error) {
      await sendMessage(chatId, ' Ошибка привязки. Попробуйте позже.');
      return;
    }

    await sendMessage(chatId, 
      `✅ Привязка успешна!\n\n` +
      `Вы будете получать уведомления о занятиях ${student.name}.\n\n` +
      `Команды:\n/status — статус абонемента\n/help — помощь`
    );
    return;
  }

  // Команда /status
  if (text === '/status') {
    const { data: user } = await supabase
      .from('users')
      .select('student_ids')
      .eq('telegram_chat_id', String(chatId))
      .single();

    if (!user) {
      await sendMessage(chatId, '⚠️ Аккаунт не привязан. Напишите /bind КОД');
      return;
    }

    const { data: students } = await supabase
      .from('students')
      .select('name, subscription_total, subscription_used, next_payment_date')
      .in('id', user.student_ids);

    let msg = '📊 <b>Статус абонементов:</b>\n\n';
    students.forEach(s => {
      const remaining = s.subscription_total - s.subscription_used;
      const days = Math.round((new Date(s.next_payment_date) - new Date()) / 86400000);
      msg += `👤 <b>${s.name}</b>\n`;
      msg += `   Осталось занятий: ${remaining} из ${s.subscription_total}\n`;
      msg += `   Следующая оплата: через ${days} дн.\n\n`;
    });

    await sendMessage(chatId, msg);
    return;
  }

  // Команда /help
  if (text === '/help') {
    await sendMessage(chatId,
      '📚 <b>Команды бота EngLand:</b>\n\n' +
      '/start — приветствие\n' +
      '/bind КОД — привязать аккаунт\n' +
      '/status — статус абонемента\n' +
      '/help — эта справка'
    );
    return;
  }
}

// ===== ОТПРАВКА УВЕДОМЛЕНИЯ (вызывается из CRM) =====
async function sendNotification(req) {
  const { action, studentId, lessonId, homeworkId } = req.body || {};
  const supabase = await getSupabase();

  if (action === 'attendance') {
    // Уведомление о посещаемости
    const { data: student } = await supabase
      .from('students')
      .select('*, parent_login, group_id')
      .eq('id', studentId)
      .single();

    if (!student) return { ok: false, error: 'student not found' };

    const { data: user } = await supabase
      .from('users')
      .select('telegram_chat_id')
      .eq('login', student.parent_login)
      .single();

    if (!user?.telegram_chat_id) {
      return { ok: false, error: 'parent not bound' };
    }

    const { data: group } = await supabase
      .from('groups')
      .select('name')
      .eq('id', student.group_id)
      .single();

    const { data: lesson } = await supabase
      .from('lessons')
      .select('topic, date')
      .eq('id', lessonId)
      .single();

    const { data: attendance } = await supabase
      .from('attendance')
      .select('status')
      .eq('lesson_id', lessonId)
      .eq('student_id', studentId)
      .single();

    const statusText = attendance?.status === 'present' ? '✅ была' : '❌ отсутствовала';
    const dateStr = new Date(lesson?.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

    // Ищем последнее ДЗ для этого ученика
    const { data: hw } = await supabase
      .from('homework')
      .select('text')
      .eq('student_id', studentId)
      .order('date', { ascending: false })
      .limit(1)
      .single();

    const hwText = hw?.text ? `\n\n📝 <b>Домашнее задание:</b>\n${hw.text}` : '';

    const msg = 
      `📚 <b>Занятие ${dateStr}</b>\n\n` +
      `${student.name} ${statusText} на занятии группы "${group?.name}".\n` +
      `Тема: ${lesson?.topic || 'не указана'}${hwText}`;

    const ok = await sendMessage(user.telegram_chat_id, msg);
    return { ok };
  }

  if (action === 'homework') {
    // Уведомление о новом ДЗ
    const { data: hw } = await supabase
      .from('homework')
      .select('*, student_id')
      .eq('id', homeworkId)
      .single();

    if (!hw) return { ok: false, error: 'hw not found' };

    const { data: student } = await supabase
      .from('students')
      .select('name, parent_login')
      .eq('id', hw.student_id)
      .single();

    if (!student) return { ok: false, error: 'student not found' };

    const { data: user } = await supabase
      .from('users')
      .select('telegram_chat_id')
      .eq('login', student.parent_login)
      .single();

    if (!user?.telegram_chat_id) return { ok: false, error: 'not bound' };

    const msg = 
      `📝 <b>Новое домашнее задание</b>\n\n` +
      `${student.name}, вот твоё задание:\n\n${hw.text}`;

    const ok = await sendMessage(user.telegram_chat_id, msg);
    return { ok };
  }

  return { ok: false, error: 'unknown action' };
}

// ===== ГЛАВНЫЙ ОБРАБОТЧИК (Vercel Serverless Function) =====
export default async function handler(req, res) {
  // Разрешаем CORS только для своего домена
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // Webhook от Telegram (GET или POST с update_id)
    if (req.method === 'GET' || (req.method === 'POST' && req.body?.update_id)) {
      const update = req.method === 'GET' 
        ? JSON.parse(req.query.update || '{}')
        : req.body;
      
      if (update.message) {
        await handleCommand(update);
      }
      res.status(200).json({ ok: true });
      return;
    }

    // Вызов из CRM (POST с action)
    if (req.method === 'POST' && req.body?.action) {
      const result = await sendNotification(req);
      res.status(200).json(result);
      return;
    }

    res.status(400).json({ error: 'bad request' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}
