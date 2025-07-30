/*
 * Файл: server.js
 * Описание: Это основной файл нашего сервера. Он использует фреймворк Express для создания веб-сервера
 * и библиотеку node-telegram-bot-api для общения с Telegram.
 */

// --- 1. Подключение необходимых библиотек ---
const express = require("express");
const bodyParser = require("body-parser");
const TelegramBot = require("node-telegram-bot-api");

// --- 2. Инициализация ---
const app = express();
app.use(bodyParser.json());

// ВАЖНО: Возьмите ваш токен, который вы получили от BotFather
const token = process.env.TELEGRAM_TOKEN;
if (!token) {
  console.error("Ошибка: TELEGRAM_TOKEN не найден. Добавьте его в файл .env");
  process.exit(1);
}

const bot = new TelegramBot(token);

// URL вашего сервера на Glitch. Glitch автоматически предоставит его.
const url = process.env.PROJECT_DOMAIN ? `https://${process.env.PROJECT_DOMAIN}.glitch.me` : 'http://localhost:3000';
const webhookPath = `/telegram/webhook/${token}`;

// Устанавливаем Webhook, чтобы Telegram знал, куда отправлять сообщения
bot.setWebHook(`${url}${webhookPath}`);

console.log(`Сервер запущен. Webhook установлен на: ${url}${webhookPath}`);

// --- 3. Логика обработки сообщений от Telegram ---

// Этот маршрут будет принимать все сообщения от Telegram
app.post(webhookPath, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Обработка команды /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userName = msg.from.first_name || 'Повар';
  const welcomeMessage = `
Добро пожаловать, ${userName}! Я ваш цифровой су-шеф "Chef-Mate".

Я готов помогать вам управлять кухней. Вот что я умею:
- **/menu [день]**: Показать меню на указанный день (например, /menu понедельник).
- **/plan**: Запустить диалог планирования (в разработке).
- **/linecheck**: Начать проверку станции (в разработке).

Все важные уведомления будут приходить сюда автоматически.
  `;
  bot.sendMessage(chatId, welcomeMessage);
});

// Обработка команды /menu
bot.onText(/\/menu (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const day = match[1].toLowerCase();
    // Здесь должна быть логика получения меню из базы данных.
    // Пока что мы используем заглушку.
    const menuResponse = `Меню на ${day} в разработке. Скоро я научусь это делать!`;
    bot.sendMessage(chatId, menuResponse);
});


// --- 4. API для взаимодействия с веб-интерфейсом (KMS) ---
// Этот раздел нужен, чтобы ваш сайт мог общаться с сервером.

// Пример маршрута для получения плана
app.get("/api/plan/latest", (req, res) => {
  // Здесь будет логика получения данных из БД
  res.json({ message: "API для планов работает. Данные пока не реализованы." });
});

// --- 5. Запуск сервера ---
const listener = app.listen(process.env.PORT || 3000, () => {
  console.log("Ваше приложение слушает порт " + listener.address().port);
});


/*
 * Файл: package.json
 * Описание: Этот файл говорит Glitch, какие библиотеки нужно установить для нашего сервера.
 * Его содержимое нужно просто скопировать в файл package.json на Glitch.
 */
/*
{
  "name": "chef-mate-backend",
  "version": "1.0.0",
  "description": "Backend server for the Chef-Mate kitchen management system.",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.17.1",
    "body-parser": "^1.19.0",
    "node-telegram-bot-api": "^0.61.0"
  },
  "engines": {
    "node": "16.x"
  }
}
*/
