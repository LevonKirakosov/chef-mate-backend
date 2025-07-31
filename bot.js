/*
 * Файл: bot.js
 * Версия: v9 - Модульная структура
 * Описание: Вся логика Telegram-бота, включая команды, кнопки и уведомления.
 */

const TelegramBot = require("node-telegram-bot-api");
const cron = require("node-cron");
const fs = require("fs");

// --- Вспомогательные файлы ---
const LOG_FILE = "kitchen_log.txt";
const MENU_FILE = "menu.json";
const STATE_FILE = "state.json";

// --- Загрузка данных при старте ---
let dynamicMenu = {};
if (fs.existsSync(MENU_FILE)) {
    try {
        dynamicMenu = JSON.parse(fs.readFileSync(MENU_FILE));
        console.log(">>> [INFO] Динамическое меню успешно загружено.");
    } catch (error) {
        console.error(">>> [ERROR] Ошибка чтения menu.json:", error);
    }
}

let systemState = {
    lineCheck: { confirmed: false, confirmedBy: null, confirmedAt: null },
    shift: { open: false, openedBy: null, openedAt: null }
};
if (fs.existsSync(STATE_FILE)) {
    try {
        systemState = JSON.parse(fs.readFileSync(STATE_FILE));
        console.log(">>> [INFO] Состояние системы успешно загружено.");
    } catch (error) {
        console.error(">>> [ERROR] Ошибка чтения state.json:", error);
    }
}

// --- Конфигурация ---
const KITCHEN_CHAT_ID = '-1002389108118';
const MANAGER_TELEGRAM_ID = '2553122118';

// --- Вспомогательные функции ---
function saveState() {
    fs.writeFileSync(STATE_FILE, JSON.stringify(systemState, null, 2));
}

function logEvent(event) {
    const time = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    const logMessage = `[${time}] ${event}\n`;
    fs.appendFileSync(LOG_FILE, logMessage);
    console.log(logMessage.trim());
}

function getReplyOptions(msg) {
    const options = { parse_mode: 'Markdown' };
    if (msg?.is_topic_message && msg?.message_thread_id) {
        options.message_thread_id = msg.message_thread_id;
    }
    return options;
}

// --- Основная функция инициализации бота ---
function initializeBot(token) {
    const bot = new TelegramBot(token, { polling: false });

    // --- Обработка команд и сообщений ---

    bot.onText(/^шеф/i, (msg) => {
        const chatId = msg.chat.id;
        const userName = msg.from.first_name || 'Повар';
        const shiftStatus = systemState.shift.open 
            ? `*Смена открыта* ✅ (Ответственный: ${systemState.shift.openedBy})`
            : `*Смена закрыта* 🔒`;

        const welcomeMessage = `*Слушаю вас, ${userName}!* 👨‍🍳\n\n${shiftStatus}\n\n🚀 *Панель управления:*`;
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
                bot.sendMessage(chatId, "❌ Не удалось распознать блюда в PDF.");
                return;
            }
            const todayKey = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
            dynamicMenu[todayKey] = { name: `Импорт из PDF от ${new Date().toLocaleDateString('ru-RU')}`, dishes: dishes };
            fs.writeFileSync(MENU_FILE, JSON.stringify(dynamicMenu, null, 2));
            logEvent(`[MENU] Пользователь ${msg.from.first_name} импортировал ${dishes.length} блюд на ${todayKey} через PDF.`);
            bot.sendMessage(chatId, `✅ Импортировано *${dishes.length}* блюд на сегодня. Меню обновлено!`, {parse_mode: 'Markdown'});
        } catch (error) {
            console.error("Ошибка обработки PDF:", error);
            bot.sendMessage(chatId, "❗️ Произошла ошибка при обработке PDF файла.");
        }
    });

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
            systemState.shift = { open: true, openedBy: user, openedAt: new Date() };
            saveState();
            logEvent(`[SHIFT] Смена открыта пользователем ${user}.`);
            bot.sendMessage(chatId, `✅ Смена открыта в *${new Date(systemState.shift.openedAt).toLocaleTimeString('ru-RU')}*. Ответственный: ${user}.`, options);
        } else if (data === 'close_shift') {
            if (!systemState.shift.open) {
                bot.answerCallbackQuery(cb.id, { text: "Смена уже закрыта.", show_alert: true });
                return;
            }
            const duration = Math.round((new Date() - new Date(systemState.shift.openedAt)) / 1000 / 60);
            logEvent(`[SHIFT] Смена закрыта пользователем ${user}. Продолжительность: ${duration} мин.`);
            bot.sendMessage(chatId, `🔒 Смена закрыта. Всем спасибо за работу!`, options);
            systemState.shift.open = false;
            saveState();
        } else {
            bot.sendMessage(chatId, `Функция "${data}" находится в разработке.`, options);
        }
        bot.answerCallbackQuery(cb.id);
    });

    // --- Планировщик ---
    cron.schedule('0 6 * * 1-5', () => { // 09:00 МСК
        logEvent("[CRON] Запуск утреннего Лайн-чека.");
        systemState.lineCheck = { confirmed: false, confirmedBy: null, confirmedAt: null };
        saveState();
        const message = `*Утренний Лайн-чек (09:00)* ☀️\n\nДоброе утро, команда! Пора начинать проверку станции. Ответственный, пожалуйста, подтвердите готовность.`;
        bot.sendMessage(KITCHEN_CHAT_ID, message, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: '✅ Подтвердить готовность', callback_data: 'line_check_confirm' }]] }
        });
    }, { timezone: "Etc/UTC" });

    return bot;
}

module.exports = initializeBot;
