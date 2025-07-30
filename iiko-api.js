{
  "name": "chef-mate-backend",
  "version": "2.0.0",
  "description": "Backend server for the Chef-Mate kitchen management system with IIKO integration.",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.17.1",
    "body-parser": "^1.19.0",
    "node-telegram-bot-api": "^0.61.0",
    "node-cron": "^3.0.2",
    "axios": "^1.6.0"
  },
  "engines": {
    "node": "16.x"
  }
}
```javascript:iiko-api.js
/*
 * Файл: iiko-api.js
 * Описание: Модуль для взаимодействия с API IIKO.
 * Управляет аутентификацией, получением номенклатуры, остатков и рецептов.
 */

const axios = require('axios');

// --- 1. Конфигурация ---
const IIKO_API_LOGIN = process.env.IIKO_API_LOGIN;
const IIKO_ORGANIZATION_ID = process.env.IIKO_ORGANIZATION_ID;
// ИСПРАВЛЕНО: Убраны лишние символы Markdown из URL
const API_BASE_URL = '[https://api-ru.iiko.services/api/1](https://api-ru.iiko.services/api/1)';

let authToken = null;
let nomenclature = null; // Кэш номенклатуры

if (!IIKO_API_LOGIN || !IIKO_ORGANIZATION_ID) {
    console.error("КРИТИЧЕСКАЯ ОШИБКА: Переменные окружения IIKO_API_LOGIN и IIKO_ORGANIZATION_ID должны быть установлены!");
    // В реальном приложении лучше остановить процесс, но для Render оставим так
    // process.exit(1); 
}

// --- 2. Аутентификация ---

/**
 * Получает токен доступа к API IIKO.
 * @returns {Promise<string|null>} Возвращает токен или null в случае ошибки.
 */
async function getAuthToken() {
    try {
        const response = await axios.get(`${API_BASE_URL}/access_token`, {
            params: { user_id: IIKO_API_LOGIN }
        });
        console.log("Токен IIKO успешно получен.");
        return response.data;
    } catch (error) {
        console.error("Ошибка при получении токена IIKO:", error.response ? error.response.data : error.message);
        return null;
    }
}

/**
 * Инициализирует модуль: получает токен и запускает таймер его обновления.
 */
async function initialize() {
    authToken = await getAuthToken();
    if (!authToken) {
        console.error("Не удалось инициализировать модуль IIKO API из-за ошибки получения токена.");
        return;
    }
    // Токен IIKO живет 60 минут, обновляем каждые 55 минут.
    setInterval(async () => {
        authToken = await getAuthToken();
    }, 55 * 60 * 1000);

    // Также загрузим и закэшируем номенклатуру при старте
    await refreshNomenclature();
}

// --- 3. Функции для работы с данными ---

/**
 * Обновляет кэш номенклатуры (товары, блюда, заготовки).
 */
async function refreshNomenclature() {
    if (!authToken) return;
    try {
        const response = await axios.post(`${API_BASE_URL}/nomenclature`, 
            { organizationIds: [IIKO_ORGANIZATION_ID] },
            { headers: { 'Authorization': `Bearer ${authToken}` } }
        );
        nomenclature = response.data;
        console.log(`Номенклатура успешно загружена: ${nomenclature.products.length} продуктов, ${nomenclature.dishes.length} блюд.`);
    } catch (error) {
        console.error("Ошибка при загрузке номенклатуры:", error.response ? error.response.data : error.message);
    }
}

/**
 * Находит блюдо в номенклатуре по части названия.
 * @param {string} query - Часть названия блюда для поиска.
 * @returns {object|null} Найденный объект блюда или null.
 */
function findDish(query) {
    if (!nomenclature) return null;
    const lowerCaseQuery = query.toLowerCase();
    return nomenclature.dishes.find(d => d.name.toLowerCase().includes(lowerCaseQuery));
}

/**
 * Получает технологическую карту (рецепт) для блюда.
 * @param {string} dishId - ID блюда.
 * @returns {string} Отформатированная строка с рецептом.
 */
function getRecipe(dishId) {
    if (!nomenclature) return "Номенклатура еще не загружена.";
    
    const dish = nomenclature.dishes.find(d => d.id === dishId);
    if (!dish || !dish.assemblyCharts || dish.assemblyCharts.length === 0) {
        return "Технологическая карта для этого блюда не найдена.";
    }

    // Берем первую технологическую карту
    const chart = dish.assemblyCharts[0];
    let recipeText = `*Тех. карта для "${dish.name}" (Выход: ${chart.yield} г):*\n\n`;

    chart.items.forEach(item => {
        const product = nomenclature.products.find(p => p.id === item.productId);
        const productName = product ? product.name : "Неизвестный продукт";
        recipeText += `• *${productName}:* ${item.amount} ${product ? product.mainUnit : ''} (нетто)\n`;
    });

    return recipeText;
}

/**
 * Получает остатки на складах.
 * @returns {Promise<string>} Отформатированная строка с остатками.
 */
async function getStockReport() {
    if (!authToken) return "Ошибка: нет токена для авторизации.";
    try {
        const response = await axios.post(`${API_BASE_URL}/reports/rest_stops`, 
            { organizationIds: [IIKO_ORGANIZATION_ID] },
            { headers: { 'Authorization': `Bearer ${authToken}` } }
        );
        
        const items = response.data.data;
        if (!items || items.length === 0) {
            return "Остатки не найдены или склады пусты.";
        }

        let reportText = "*Отчет по остаткам на складах:*\n\n";
        items.forEach(item => {
            reportText += `• *${item.name}:* ${item.amount} ${item.unit}\n`;
        });
        return reportText;

    } catch (error) {
        console.error("Ошибка при получении отчета по остаткам:", error.response ? error.response.data : error.message);
        return "Не удалось получить отчет по остаткам. Попробуйте позже.";
    }
}


// --- 4. Экспорт ---
module.exports = {
    initialize,
    findDish,
    getRecipe,
    getStockReport
};
```javascript:server.js
/*
 * Файл: server.js
 * Описание: Версия 2.0 с интеграцией IIKO.
 * Данные о меню и рецептах теперь запрашиваются из IIKO API.
 */

// --- 1. Подключение необходимых библиотек ---
const express = require("express");
const bodyParser = require("body-parser");
const TelegramBot = require("node-telegram-bot-api");
const cron = require("node-cron");
const iiko = require('./iiko-api'); // Наш новый модуль для IIKO

// --- 2. Инициализация ---
const app = express();
app.use(bodyParser.json());

const token = process.env.TELEGRAM_TOKEN;
if (!token) {
  console.error("КРИТИЧЕСКАЯ ОШИБКА: TELEGRAM_TOKEN не найден!");
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true }); // Включаем polling для простоты
const KITCHEN_CHAT_ID = process.env.KITCHEN_CHAT_ID || '-2389108118';

// --- 3. Инициализация модуля IIKO ---
iiko.initialize().then(() => {
    console.log("Модуль IIKO успешно инициализирован и готов к работе.");
}).catch(err => {
    console.error("Ошибка при инициализации модуля IIKO:", err);
});


// --- 4. Логика обработки команд Telegram ---

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
// Логика планировщика остается прежней, но теперь она может быть расширена данными из IIKO
let lineCheckState = { confirmed: false, messageId: null };

const scheduleConfig = [
    // ... (Ваши существующие задачи из cron)
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
        // ... (логика выполнения)
    }, {
        timezone: "Europe/Moscow" // Устанавливаем таймзону для корректной работы
    });
});

console.log("Планировщик уведомлений запущен.");


// --- 6. Запуск сервера ---
const listener = app.listen(process.env.PORT || 3000, () => {
  console.log("Сервер v2.0 (IIKO) запущен и слушает порт " + listener.address().port);
});
