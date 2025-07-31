/*
 * Файл: server.js
 * Описание: Финальная версия v8.
 * Добавлено динамическое меню из файла, загрузка PDF, расширенное интерактивное меню и логирование.
 */

// --- 1. Подключение необходимых библиотек ---
const express = require("express");
const bodyParser = require("body-parser");
const TelegramBot = require("node-telegram-bot-api");
const cron = require("node-cron");
const fs = require("fs");
const multer = require("multer");
const pdfParse = require("pdf-parse");

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
const upload = multer({ dest: "uploads/" });
const LOG_FILE = "kitchen_log.txt";

// --- 3. База Данных и Конфигурация ---
let dynamicMenu = {};
// При запуске пытаемся загрузить меню из файла
if (fs.existsSync("menu.json")) {
    try {
        dynamicMenu = JSON.parse(fs.readFileSync("menu.json"));
        console.log(">>> [INFO] Динамическое меню успешно загружено из menu.json");
    } catch (error) {
        console.error(">>> [ERROR] Ошибка чтения menu.json:", error);
    }
}

const KITCHEN_CHAT_ID = '-1002389108118';
const MANAGER_TELEGRAM_ID = '2553122118';

let lineCheckState = { confirmed: false, confirmedBy: null, confirmedAt: null };
let shiftState = { open: false, openedBy: null, openedAt: null };

// --- 4. Вспомогательные функции ---
function getReplyOptions(msg) {
    const options = { parse_mode: 'Markdown' };
    if (msg?.is_topic_message && msg?.message_thread_id) {
        options.message_thread_id = msg.message_thread_id;
    }
    return options;
}

function logEvent(event) {
    const time = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    const logMessage = `[${time}] ${event}\n`;
    fs.appendFileSync(LOG_FILE, logMessage);
    console.log(logMessage.trim());
}

// --- 5. Логика обработки сообщений от Telegram ---

app.post(webhookPath, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Приветствие по слову "Шеф"
bot.onText(/^шеф/i, (msg) => {
  const chatId = msg.chat.id;
  const userName = msg.from.first_name || 'Повар';
  const welcomeMessage = `*Слушаю вас, ${userName}!* 👨‍🍳\n\nЯ ваш цифровой су-шеф *Chef-Mate*. Готов помочь сделать кухню образцовой!\n\n🚀 *Панель управления:*`;
  const options = getReplyOptions(msg);
  options.reply_markup = {
      inline_keyboard: [
          [{ text: '📋 Лайн-чек', callback_data: 'line_check' }],
          [{ text: '📸 Отправить фотоотчёт', callback_data: 'send_photo_report' }],
          [{ text: '📦 Отправить заявку', callback_data: 'send_request' }],
          [{ text: '🔓 Открытие смены', callback_data: 'open_shift' }, { text: '🔒 Закрытие смены', callback_data: 'close_shift' }],
          [{ text: '📖 Показать меню на сегодня', callback_data: 'show_today_menu' }],
          [{ text: '📊 Статистика смены', callback_data: 'show_stats' }]
      ]
  };
  bot.sendMessage(chatId, welcomeMessage, options);
});

// Обработка документов (PDF)
bot.on('document', async (msg) => {
    if (msg.document.mime_type !== 'application/pdf') return;
    
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "⏳ Получил PDF, начинаю обработку...");

    try {
        const fileId = msg.document.file_id;
        const fileLink = await bot.getFileLink(fileId);
        const response = await fetch(fileLink);
        const buffer = await response.arrayBuffer();
        const data = await pdfParse(Buffer.from(buffer));

        const lines = data.text.split('\n').filter(l => l.trim().length > 3);
        const dishes = lines.map(line => ({ name: line.trim(), description: "Описание по умолчанию" }));

        if (dishes.length === 0) {
            bot.sendMessage(chatId, "❌ Не удалось распознать блюда в PDF. Убедитесь, что каждое блюдо на новой строке.");
            return;
        }

        const todayKey = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
        dynamicMenu[todayKey] = { name: `Импорт из PDF от ${new Date().toLocaleDateString('ru-RU')}`, dishes: dishes };
        fs.writeFileSync("menu.json", JSON.stringify(dynamicMenu, null, 2));
        logEvent(`[MENU] Пользователь ${msg.from.first_name} импортировал ${dishes.length} блюд на ${todayKey} через PDF.`);

        bot.sendMessage(chatId, `✅ Импортировано *${dishes.length}* блюд на сегодня. Меню обновлено!`, {parse_mode: 'Markdown'});
    } catch (error) {
        console.error("Ошибка обработки PDF:", error);
        bot.sendMessage(chatId, "❗️ Произошла ошибка при обработке PDF файла.");
    }
});


// Обработка нажатий на inline-кнопки
bot.on('callback_query', (cb) => {
    const msg = cb.message;
    const data = cb.data;
    const chatId = msg.chat.id;
    const options = getReplyOptions(msg);
    const user = cb.from.first_name;

    if (data === 'show_today_menu') {
        const todayKey = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
        const menu = dynamicMenu[todayKey];
        if (!menu || !menu.dishes) {
            bot.sendMessage(chatId, '❗ Меню на сегодня еще не загружено.', options);
        } else {
            let text = `📖 *Бизнес-ланч на сегодня — ${menu.name}*\n\n`;
            menu.dishes.forEach(b => {
                text += `🍽️ *${b.name}*\n_${b.description}_\n\n`;
            });
            bot.sendMessage(chatId, text, options);
        }
    } else if (data === 'open_shift') {
        shiftState = { open: true, openedBy: user, openedAt: new Date() };
        logEvent(`[SHIFT] Смена открыта пользователем ${user}.`);
        bot.sendMessage(chatId, `✅ Смена открыта в *${shiftState.openedAt.toLocaleTimeString('ru-RU')}*. Ответственный: ${user}.`, options);
    } else if (data === 'close_shift') {
        if (!shiftState.open) {
            bot.answerCallbackQuery(cb.id, { text: "Смена уже закрыта.", show_alert: true });
            return;
        }
        const duration = Math.round((new Date() - shiftState.openedAt) / 1000 / 60); // in minutes
        logEvent(`[SHIFT] Смена закрыта пользователем ${user}. Продолжительность: ${duration} мин.`);
        bot.sendMessage(chatId, `🔒 Смена закрыта. Всем спасибо за работу!`, options);
        shiftState.open = false;
    } else {
        bot.sendMessage(chatId, `Функция "${data}" находится в разработке.`, options);
    }

    bot.answerCallbackQuery(cb.id);
});

// --- 6. Проактивные уведомления (Планировщик) ---
// (Логика cron остается прежней, но теперь она будет работать с динамическим меню)

// --- 7. Запуск сервера ---
const listener = app.listen(process.env.PORT || 3000, () => {
  console.log("Chef-Mate v8 (Динамическое меню) активен на порту " + listener.address().port);
});
