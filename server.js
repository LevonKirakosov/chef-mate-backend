/*
 * Файл: server.js
 * Описание: Финальная версия сервера для Chef-Mate.
 * Включает в себя полную логику меню и проактивные уведомления.
 */

// --- 1. Подключение необходимых библиотек ---
const express = require("express");
const bodyParser = require("body-parser");
const TelegramBot = require("node-telegram-bot-api");
const cron = require("node-cron");

// --- 2. Инициализация ---
const app = express();
app.use(bodyParser.json());

// ВАЖНО: Токен берется из переменных окружения на Render.com
const token = process.env.TELEGRAM_TOKEN;
if (!token) {
  console.error("Ошибка: TELEGRAM_TOKEN не найден. Убедитесь, что он добавлен в Environment на Render.com");
  process.exit(1);
}

const bot = new TelegramBot(token);

const url = `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`;
const webhookPath = `/telegram/webhook/${token}`;
bot.setWebHook(`${url}${webhookPath}`);

console.log(`Сервер запущен. Webhook установлен на: ${url}${webhookPath}`);

// --- 3. База данных (встроена в код для простоты) ---
// В реальном проекте эти данные будут храниться в базе данных MongoDB или Firestore.
const menuData = {
    monday: { name: "Италия", dishes: [{ type: 'Салат', name: 'Панцанелла' }, { type: 'Суп', name: 'Минестроне' }, { type: 'Горячее', name: 'Лазанья Болоньезе' }] },
    tuesday: { name: "Грузия", dishes: [{ type: 'Салат', name: 'Грузинский с ореховой заправкой' }, { type: 'Суп', name: 'Харчо' }, { type: 'Горячее', name: 'Чахохбили из курицы' }] },
    wednesday: { name: "Франция", dishes: [{ type: 'Салат', name: 'Лионский салат' }, { type: 'Суп', name: 'Грибной крем-суп' }, { type: 'Горячее', name: 'Куриное фрикасе' }] },
    thursday: { name: "Россия", dishes: [{ type: 'Салат', name: 'Винегрет с килькой' }, { type: 'Суп', name: 'Борщ «Московский»' }, { type: 'Горячее', name: 'Бефстроганов с картофельным гратеном' }] },
    friday: { name: "Мексика", dishes: [{ type: 'Салат', name: 'Мексиканский салат' }, { type: 'Суп', name: 'Томатный крем-суп с чили' }, { type: 'Горячее', name: 'Кесадилья с курицей' }] }
};
const dayNames = { monday: 'Понедельник', tuesday: 'Вторник', wednesday: 'Среда', thursday: 'Четверг', friday: 'Пятница' };
// ID чата шеф-повара для отправки уведомлений. Замените на реальный ID.
const CHEF_TELEGRAM_ID = '2553122118'; // ВАЖНО: Замените это на ваш реальный Telegram User ID

// --- 4. Логика обработки сообщений от Telegram ---

app.post(webhookPath, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userName = msg.from.first_name || 'Повар';
  const welcomeMessage = `Добро пожаловать, ${userName}! Я ваш цифровой су-шеф "Chef-Mate".\n\nЯ готов помогать вам управлять кухней. Вот что я умею:\n- **/menu [день]**: Показать меню на указанный день (например, /menu понедельник).\n\nВсе важные уведомления будут приходить сюда автоматически.`;
  bot.sendMessage(chatId, welcomeMessage);
});

bot.onText(/\/menu (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const dayQuery = match[1].toLowerCase();
    let dayKey = Object.keys(dayNames).find(key => dayNames[key].toLowerCase().startsWith(dayQuery));

    if (dayKey && menuData[dayKey]) {
        const dayMenu = menuData[dayKey];
        let response = `*Меню на ${dayNames[dayKey]} (${dayMenu.name}):*\n\n`;
        dayMenu.dishes.forEach(dish => {
            response += `• *${dish.type}:* ${dish.name}\n`;
        });
        bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
    } else {
        bot.sendMessage(chatId, "Пожалуйста, укажите день недели (например, /menu понедельник).");
    }
});

// Обработка нажатий на inline-кнопки
bot.on('callback_query', (callbackQuery) => {
    const msg = callbackQuery.message;
    const data = callbackQuery.data;
    const chatId = msg.chat.id;

    if (data === 'line_check_confirm') {
        bot.editMessageText(`*Утренний Лайн-чек (09:00)*\n\nСтанция готова к работе. ✅\n_${new Date().toLocaleTimeString()}_`, {
            chat_id: chatId,
            message_id: msg.message_id,
            parse_mode: 'Markdown'
        });
        bot.answerCallbackQuery(callbackQuery.id, { text: "Статус подтвержден!" });
    }
});


// --- 5. Проактивные уведомления (Планировщик) ---

// Важно: Render использует UTC время. Московское время = UTC+3.
// '0 6 * * 1-5' означает "в 6:00 UTC (9:00 МСК) каждый день с понедельника по пятницу".
cron.schedule('0 6 * * 1-5', () => {
    const message = `*Утренний Лайн-чек (09:00)*\n\nДоброе утро! Пора начинать проверку станции. Подтвердите готовность.`;
    const options = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '✅ Подтвердить готовность', callback_data: 'line_check_confirm' }]
            ]
        },
        parse_mode: 'Markdown'
    };
    // Отправляем всем пользователям (в реальной системе будет цикл по пользователям из БД)
    bot.sendMessage(CHEF_TELEGRAM_ID, message, options);
}, {
    timezone: "Etc/UTC"
});

// '0 12 * * 1-5' означает "в 12:00 UTC (15:00 МСК) каждый день с понедельника по пятницу".
cron.schedule('0 12 * * 1-5', () => {
    const message = `*Контроль HACCP (15:00)*\n\nВремя замерить температуру в холодильнике №2 (мясной). Внесите значение в журнал.`;
    bot.sendMessage(CHEF_TELEGRAM_ID, message, { parse_mode: 'Markdown' });
}, {
    timezone: "Etc/UTC"
});

console.log("Планировщик уведомлений запущен.");

// --- 6. Запуск сервера ---
const listener = app.listen(process.env.PORT || 3000, () => {
  console.log("Ваше приложение слушает порт " + listener.address().port);
});
