/*
 * Файл: server.js
 * Описание: Версия 2.2. Финальное исправление синтаксической ошибки.
 */

// --- 1. Подключение необходимых библиотек ---
const express = require("express");
const bodyParser = require("body-parser");
const TelegramBot = require("node-telegram-bot-api");
const cron = require("node-cron");
const iiko = require('./iiko-api');

// --- 2. Инициализация ---
const app = express();
app.use(bodyParser.json());

const token = process.env.TELEGRAM_TOKEN;
// ФИНАЛЬНОЕ ИСПРАВЛЕНИЕ: URL теперь является чистой строкой.
const url = process.env.RENDER_EXTERNAL_URL || 'https://chef-mate-backend.onrender.com';

if (!token) {
  console.error("КРИТИЧЕСКАЯ ОШИБКА: TELEGRAM_TOKEN не найден!");
  process.exit(1);
}

// Бот инициализируется без polling
const bot = new TelegramBot(token);

// Устанавливаем Webhook
const webhookPath = `/telegram/webhook/${token}`;
bot.setWebHook(`${url}${webhookPath}`);
console.log(`Webhook установлен на адрес: ${url}${webhookPath}`);

// --- 3. Инициализация модуля IIKO ---
iiko.initialize().then(() => {
    console.log("Модуль IIKO успешно инициализирован и готов к работе.");
}).catch(err => {
    console.error("КРИТИЧЕСКАЯ ОШИБКА ИНИЦИАЛИЗАЦИИ МОДУЛЯ IIKO:", err.message);
});

// --- 4. Логика обработки команд Telegram ---

// Мы должны слушать входящие запросы от Telegram на наш webhook
app.post(webhookPath, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Функция для добавления message_thread_id к опциям, если он есть
const getReplyOptions = (msg) => {
    const options = { parse_mode: 'Markdown' };
    if (msg.is_topic_message && msg.message_thread_id) {
        options.message_thread_id = msg.message_thread_id;
    }
    return options;
};

// Приветствие по слову "Шеф" или команде /start
bot.onText(/^(шеф|\/start)/i, (msg) => {
  const chatId = msg.chat.id;
  const userName = msg.from.first_name || 'Повар';
  const welcomeMessage = `*Слушаю вас, ${userName}!* 👨‍🍳\n\nЯ ваш цифровой су-шеф, подключенный к IIKO. Готов предоставить актуальные данные.\n\n*Доступные команды:*\n• \`/recipe [название]\` - Показать тех. карту.\n• \`/stock\` - Показать остатки на складах.\n• \`/help\` - Помощь.`;
  const options = getReplyOptions(msg);
  bot.sendMessage(chatId, welcomeMessage, options);
});

// Команда /recipe [название]
bot.onText(/\/recipe (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const query = match[1];
    const options = getReplyOptions(msg);

    const foundDish = iiko.findDish(query);
    
    if (foundDish) {
        const recipe = iiko.getRecipe(foundDish.id);
        bot.sendMessage(chatId, recipe, options);
    } else {
        bot.sendMessage(chatId, `Блюдо, содержащее "${query}", не найдено в номенклатуре IIKO.`, options);
    }
});

// Команда /stock
bot.onText(/\/stock/, async (msg) => {
    const chatId = msg.chat.id;
    const options = getReplyOptions(msg);
    bot.sendMessage(chatId, "Запрашиваю актуальные остатки из IIKO, пожалуйста, подождите...", options);
    
    const report = await iiko.getStockReport();
    bot.sendMessage(chatId, report, options);
});

// Команда /help
bot.onText(/\/help/, (msg) => {
    sendHelpMessage(msg.chat.id, msg);
});


// --- Вспомогательные функции ---
function sendHelpMessage(chatId, originalMsg) {
    const options = getReplyOptions(originalMsg);
    const helpMessage = `Я к вашим услугам! 👨‍🍳\n\n*Основные команды:*\n- \`/recipe [название блюда]\` - я найду блюдо в IIKO и пришлю его тех. карту.\n- \`/stock\` - я запрошу в IIKO и покажу актуальные остатки на складах.\n\n_Примечание: я ищу по частичному совпадению, например, \`/recipe лазанья\`._`;
    bot.sendMessage(chatId, helpMessage, options);
}


// --- 5. Проактивные уведомления (Планировщик) ---
const KITCHEN_CHAT_ID = process.env.KITCHEN_CHAT_ID || '-2389108118';
let lineCheckState = { confirmed: false, messageId: null };

const scheduleConfig = [
    {
        cronTime: '0 6 * * 1-5', // 09:00 МСК (UTC+3)
        message: `*Утренний Лайн-чек (09:00)* ☀️\n\nДоброе утро, команда! Пора начинать проверку станции. Ответственный, пожалуйста, подтвердите готовность.\n\nТакже не забудьте *распечатать Лайн-чек* с заготовочным листом с основного сайта KMS.`,
        options: {
            reply_markup: {
                inline_keyboard: [[{ text: '✅ Подтвердить готовность', callback_data: 'line_check_confirm' }]]
            },
            parse_mode: 'Markdown'
        },
        action: (message) => {
            lineCheckState.confirmed = false;
            lineCheckState.messageId = message.message_id;
        }
    },
];

scheduleConfig.forEach(job => {
    cron.schedule(job.cronTime, async () => {
        try {
            const sentMessage = await bot.sendMessage(KITCHEN_CHAT_ID, job.message, job.options);
            if (job.action) {
                job.action(sentMessage);
            }
        } catch (error) {
            console.error(`Ошибка при отправке запланированного сообщения: ${error.message}`);
        }
    }, {
        timezone: "Europe/Moscow"
    });
});

console.log("Планировщик уведомлений запущен.");


// --- 6. Запуск сервера ---
const listener = app.listen(process.env.PORT || 3000, () => {
  console.log("Сервер v2.2 (IIKO + Webhook) запущен и слушает порт " + listener.address().port);
});
