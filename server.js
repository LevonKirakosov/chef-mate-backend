/*
 * Файл: server.js
 * Версия: v9 - Модульная структура
 * Описание: Основной файл. Запускает сервер и подключает логику бота.
 */

const express = require("express");
const bodyParser = require("body-parser");
const initializeBot = require("./bot"); // Подключаем логику бота из отдельного файла

// --- Инициализация ---
const app = express();
app.use(bodyParser.json());

const token = process.env.TELEGRAM_TOKEN;
if (!token) {
  console.error("КРИТИЧЕСКАЯ ОШИБКА: TELEGRAM_TOKEN не найден!");
  process.exit(1);
}

// Инициализируем и запускаем бота
const bot = initializeBot(token);
const webhookPath = `/telegram/webhook/${token}`;

// --- Webhook ---
app.post(webhookPath, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// --- Запуск сервера ---
const listener = app.listen(process.env.PORT || 3000, () => {
  console.log("Chef-Mate v9 (Модульный) активен на порту " + listener.address().port);
});
