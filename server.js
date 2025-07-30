/*
 * Файл: server.js
 * Описание: Версия для отладки. Добавлены console.log для отслеживания ошибок.
 */

// --- 1. Подключение необходимых библиотек ---
const express = require("express");
const bodyParser = require("body-parser");
const TelegramBot = require("node-telegram-bot-api");
const cron = require("node-cron");

console.log(">>> [INFO] Сервер запускается...");

// --- 2. Инициализация ---
const app = express();
app.use(bodyParser.json());

const token = process.env.TELEGRAM_TOKEN;
if (!token) {
  console.error(">>> [ERROR] КРИТИЧЕСКАЯ ОШИБКА: TELEGRAM_TOKEN не найден в переменных окружения!");
  process.exit(1);
}
console.log(">>> [INFO] Токен успешно загружен.");

const bot = new TelegramBot(token);

const url = `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`;
const webhookPath = `/telegram/webhook/${token}`;

bot.setWebHook(`${url}${webhookPath}`)
  .then(() => {
    console.log(`>>> [SUCCESS] Webhook успешно установлен на: ${url}${webhookPath}`);
  })
  .catch((err) => {
    console.error(">>> [ERROR] Ошибка установки Webhook:", err.message);
  });


// --- 3. База данных (встроена в код для простоты) ---
const menuData = {
    monday: { name: "Италия", dishes: [{ type: 'Салат', name: 'Панцанелла' }, { type: 'Суп', name: 'Минестроне' }, { type: 'Горячее', name: 'Лазанья Болоньезе' }] },
    tuesday: { name: "Грузия", dishes: [{ type: 'Салат', name: 'Грузинский с ореховой заправкой' }, { type: 'Суп', name: 'Харчо' }, { type: 'Горячее', name: 'Чахохбили из курицы' }] },
    wednesday: { name: "Франция", dishes: [{ type: 'Салат', name: 'Лионский салат' }, { type: 'Суп', name: 'Грибной крем-суп' }, { type: 'Горячее', name: 'Куриное фрикасе' }] },
    thursday: { name: "Россия", dishes: [{ type: 'Салат', name: 'Винегрет с килькой' }, { type: 'Суп', name: 'Борщ «Московский»' }, { type: 'Горячее', name: 'Бефстроганов с картофельным гратеном' }] },
    friday: { name: "Мексика", dishes: [{ type: 'Салат', name: 'Мексиканский салат' }, { type: 'Суп', name: 'Томатный крем-суп с чили' }, { type: 'Горячее', name: 'Кесадилья с курицей' }] }
};
const dayNames = { monday: 'Понедельник', tuesday: 'Вторник', wednesday: 'Среда', thursday: 'Четверг', friday: 'Пятница' };
const KITCHEN_CHAT_ID = '-1002389108118'; 
console.log(`>>> [INFO] ID чата для уведомлений: ${KITCHEN_CHAT_ID}`);


// --- 4. Логика обработки сообщений от Telegram ---

app.post(webhookPath, (req, res) => {
  console.log(">>> [WEBHOOK] Получено новое сообщение от Telegram:", JSON.stringify(req.body, null, 2));
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

bot.on('message', (msg) => {
    console.log(`>>> [MESSAGE] Получено сообщение в чате ${msg.chat.id}: "${msg.text}"`);
});

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  console.log(`>>> [COMMAND] Пользователь ${msg.from.username} (${chatId}) выполнил команду /start`);
  const userName = msg.from.first_name || 'Повар';
  const welcomeMessage = `Добро пожаловать, ${userName}! Я ваш цифровой су-шеф "Chef-Mate".\n\nЯ готов помогать вам управлять кухней. Вот что я умею:\n- **/menu [день]**: Показать меню (например, /menu понедельник).\n- **/recipe [название]**: Показать рецепт (например, /recipe харчо).\n\nВсе важные уведомления будут приходить в чат кухни.`;
  bot.sendMessage(chatId, welcomeMessage);
});

bot.onText(/\/menu (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const dayQuery = match[1].toLowerCase();
    console.log(`>>> [COMMAND] Запрос меню на день: ${dayQuery}`);
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

// --- 5. Проактивные уведомления (Планировщик) ---
cron.schedule('0 6 * * 1-5', () => {
    console.log(">>> [CRON] Сработал планировщик: Утренний Лайн-чек (09:00 МСК)");
    const message = `*Утренний Лайн-чек (09:00)*\n\nДоброе утро, команда! Пора начинать проверку станции. Ответственный, пожалуйста, подтвердите готовность.`;
    bot.sendMessage(KITCHEN_CHAT_ID, message, { parse_mode: 'Markdown' });
}, {
    timezone: "Etc/UTC"
});

cron.schedule('0 12 * * 1-5', () => {
    console.log(">>> [CRON] Сработал планировщик: Контроль HACCP (15:00 МСК)");
    const message = `*Контроль HACCP (15:00)*\n\nНапоминание: Время замерить температуру в холодильнике №2 (мясной). Внесите значение в журнал.`;
    bot.sendMessage(KITCHEN_CHAT_ID, message, { parse_mode: 'Markdown' });
}, {
    timezone: "Etc/UTC"
});

console.log(">>> [INFO] Планировщик уведомлений запущен.");

// --- 6. Запуск сервера ---
const listener = app.listen(process.env.PORT || 3000, () => {
  console.log(">>> [SUCCESS] Сервер запущен и слушает порт " + listener.address().port);
});
