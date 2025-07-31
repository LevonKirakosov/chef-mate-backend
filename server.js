/*
 * Файл: server.js
 * Версия: v10 — Chef-Mate: контроль кухни с фото, сменами, логами и заявками.
 */

// --- 1. Подключение библиотек ---
const express = require("express");
const bodyParser = require("body-parser");
const TelegramBot = require("node-telegram-bot-api");
const cron = require("node-cron");
const multer = require("multer");
const fs = require("fs");
const xlsx = require("xlsx");
const menuData = require("./menuData.json");

// --- 2. Инициализация ---
const app = express();
app.use(bodyParser.json());
const token = process.env.TELEGRAM_TOKEN;
if (!token) {
  console.error("КРИТИЧЕСКАЯ ОШИБКА: TELEGRAM_TOKEN не найден!");
  process.exit(1);
}
const bot = new TelegramBot(token, { polling: false });
const webhookPath = `/telegram/webhook/${token}`;
const KITCHEN_CHAT_ID = '-2389108118';
const LOG_FILE = "kitchen_log.txt";

// --- 3. Вспомогательные ---
function getReplyOptions(msg) {
  const options = { parse_mode: 'Markdown' };
  if (msg?.is_topic_message && msg?.message_thread_id) {
    options.message_thread_id = msg.message_thread_id;
  }
  return options;
}

function logEvent(event) {
  const time = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
  fs.appendFileSync(LOG_FILE, `[${time}] ${event}\n`);
}

// --- 4. Webhook ---
app.post(webhookPath, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// --- 5. Команды ---
bot.onText(/^шеф/i, (msg) => {
  const chatId = msg.chat.id;
  const userName = msg.from.first_name || 'Повар';
  const welcome = `*Слушаю вас, ${userName}!* 👨‍🍳\n\nЯ ваш цифровой су-шеф *Chef-Mate*. Готов помочь сделать кухню образцовой!\n\n🚀 *Меню:*`;
  const options = getReplyOptions(msg);
  options.reply_markup = {
    inline_keyboard: [
      [{ text: '📋 Лайн-чек', callback_data: 'line_check' }],
      [{ text: '📸 Отправить фотоотчёт', callback_data: 'send_photo' }],
      [{ text: '📦 Отправить заявку', callback_data: 'send_request' }],
      [{ text: '🔓 Открытие смены', callback_data: 'open_shift' }, { text: '🔒 Закрытие смены', callback_data: 'close_shift' }],
      [{ text: '📖 Показать меню', callback_data: 'show_menu' }],
      [{ text: '📊 Статистика', callback_data: 'show_stats' }]
    ]
  };
  bot.sendMessage(chatId, welcome, options);
});

// --- 6. Callback-кнопки ---
bot.on('callback_query', cb => {
  const msg = cb.message;
  const data = cb.data;
  const chatId = msg.chat.id;
  const options = getReplyOptions(msg);
  const user = cb.from.first_name;

  if (data === 'line_check') {
    const text = `📋 *Лайн-чек (10:30)*\n\n☑️ Холодильники?\n🌡 Температура?\n🧼 Чистота?\n📦 Продукты?\n📸 Прикрепите фото.\n\nНажмите соответствующую кнопку:`;
    options.reply_markup = {
      inline_keyboard: [[
        { text: '✅ Выполнено', callback_data: 'check_done' },
        { text: '❌ Не выполнено', callback_data: 'check_failed' }
      ]]
    };
    bot.sendMessage(chatId, text, options);
  } else if (data === 'check_done') {
    bot.sendMessage(chatId, `✅ *Лайн-чек подтвержден* пользователем ${user}.`, options);
    logEvent(`Лайн-чек выполнен (${user})`);
  } else if (data === 'check_failed') {
    bot.sendMessage(chatId, `⚠️ *Лайн-чек не выполнен!* (${user})`, options);
    logEvent(`Лайн-чек НЕ выполнен (${user})`);
  } else if (data === 'open_shift') {
    bot.sendMessage(chatId, `🔓 *Смена открыта* — ${user}`, options);
    logEvent(`Открытие смены (${user})`);
  } else if (data === 'close_shift') {
    bot.sendMessage(chatId, `🔒 *Смена закрыта* — ${user}`, options);
    logEvent(`Закрытие смены (${user})`);
  } else if (data === 'send_request') {
    bot.sendMessage(chatId, '📦 Введите заявку в формате:\n\n`/заявка молоко 2л, яйца 10шт, мука 5кг`', options);
  } else if (data === 'show_stats') {
    const stats = fs.existsSync(LOG_FILE) ? fs.readFileSync(LOG_FILE, 'utf8') : 'Нет данных.';
    bot.sendMessage(chatId, `📊 *Логи:*\n\n\```${stats}\````, { parse_mode: 'Markdown' });
  } else if (data === 'send_photo') {
    bot.sendMessage(chatId, '📸 Пожалуйста, отправьте фото зоны или холодильника.', options);
  } else if (data === 'show_menu') {
    const day = "понедельник";
    const menu = menuData[day];
    if (!menu) {
      bot.sendMessage(chatId, "❗ Сегодняшнее меню не найдено.", options);
      return;
    }
    let text = `📖 *Полное меню бизнес-ланча «Кухни Мира»*\n\n`;
    text += `${day.charAt(0).toUpperCase() + day.slice(1)} — ${menu.название}\n\n`;
    menu.блюда.forEach(b => {
      text += `🍽 *${b.название}* (${b.описание})\n`;
    });
    bot.sendMessage(chatId, text, options);
  }
  bot.answerCallbackQuery(cb.id);
});

// --- 7. Приём заявки и фото ---
bot.onText(/\/заявка (.+)/, (msg, match) => {
  const user = msg.from.first_name;
  const request = match[1];
  logEvent(`Заявка от ${user}: ${request}`);
  bot.sendMessage(KITCHEN_CHAT_ID, `📦 *Заявка от ${user}:*\n${request}`, getReplyOptions(msg));
});

bot.on('photo', (msg) => {
  const user = msg.from.first_name;
  logEvent(`Фото от ${user}`);
  bot.sendMessage(KITCHEN_CHAT_ID, `📸 Фотоотчет от ${user}.`, getReplyOptions(msg));
});

// --- 8. Планировщик по расписанию ---
cron.schedule('30 7 * * 1-5', () => { // 10:30
  bot.sendMessage(KITCHEN_CHAT_ID, '📋 *Лайн-чек: пора выполнять!*', { parse_mode: 'Markdown' });
}, { timezone: 'Europe/Moscow' });

cron.schedule('5 8 * * 1-5', () => { // 11:05 напоминание
  bot.sendMessage(KITCHEN_CHAT_ID, '❗ *Напоминание: Лайн-чек не подтвержден!*', { parse_mode: 'Markdown' });
}, { timezone: 'Europe/Moscow' });

cron.schedule('0 11 * * 1-5', () => { // 14:00 температурный режим
  bot.sendMessage(KITCHEN_CHAT_ID, '🌡 *Проверьте температурные режимы холодильников!*', { parse_mode: 'Markdown' });
}, { timezone: 'Europe/Moscow' });

cron.schedule('0 14 * * 1-5', () => { // 17:00 подготовка к вечернему сервису
  bot.sendMessage(KITCHEN_CHAT_ID, '🍽 *Подготовка к вечернему сервису: проверьте наличие продуктов, чистоту и готовность.*', { parse_mode: 'Markdown' });
}, { timezone: 'Europe/Moscow' });

cron.schedule('0 8 * * 1-5', () => { // 11:00 открытие смены
  bot.sendMessage(KITCHEN_CHAT_ID, '🔓 *Открытие смены: подтвердите, что всё готово к работе.*', { parse_mode: 'Markdown' });
}, { timezone: 'Europe/Moscow' });

cron.schedule('0 20 * * 1-5', () => { // 23:00 закрытие смены
  bot.sendMessage(KITCHEN_CHAT_ID, '🔒 *Закрытие смены: проверьте чек-лист, сдайте смену, прикрепите фотоотчет.*', { parse_mode: 'Markdown' });
}, { timezone: 'Europe/Moscow' });

// --- 9. Запуск ---
const listener = app.listen(process.env.PORT || 3000, () => {
  console.log("Chef-Mate активен на порту " + listener.address().port);
});
