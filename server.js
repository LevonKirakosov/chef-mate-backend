/*
 * Файл: server.js
 * Версия: v8 — Полноценный интерфейс Chef-Mate: команды, рецепты, меню, PDF- и Excel-TTK, и интерактивное приветствие.
 */

// --- 1. Подключение библиотек ---
const express = require("express");
const bodyParser = require("body-parser");
const TelegramBot = require("node-telegram-bot-api");
const cron = require("node-cron");
const multer = require("multer");
const xlsx = require("xlsx");
const path = require("path");
const fs = require("fs");
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

const KITCHEN_CHAT_ID = '-2389108118';
let lineCheckState = { confirmed: false, messageId: null };

// --- 3. Меню и данные ---
const menuData = require("./menuData.json");
const dayNames = {
  monday: 'Понедельник', tuesday: 'Вторник',
  wednesday: 'Среда', thursday: 'Четверг', friday: 'Пятница'
};

// --- 4. Вебхук ---
app.post(webhookPath, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

function getReplyOptions(msg) {
  const options = { parse_mode: 'Markdown' };
  if (msg.is_topic_message && msg.message_thread_id) {
    options.message_thread_id = msg.message_thread_id;
  }
  return options;
}

// --- 5. Интерактивное приветствие ---
bot.onText(/^шеф/i, (msg) => {
  const chatId = msg.chat.id;
  const userName = msg.from.first_name || 'Повар';
  const welcomeMessage = `*Слушаю вас, ${userName}!* 👨‍🍳\n\nЯ ваш цифровой су-шеф "Chef-Mate". Готов помочь сделать нашу кухню самой организованной!\n\n🚀 *Быстрый старт:*`;
  const options = getReplyOptions(msg);
  options.reply_markup = {
    inline_keyboard: [
      [{ text: '🗓️ Показать полное меню', callback_data: 'show_full_menu' }],
      [{ text: '📖 Команды', callback_data: 'show_help' }]
    ]
  };
  bot.sendMessage(chatId, welcomeMessage, options);
});

bot.onText(/\/start/, (msg) => {
  bot.emit('text', Object.assign(msg, { text: 'шеф' }));
});

// --- 6. Меню ---
bot.onText(/\/menu (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const dayQuery = match[1].toLowerCase();
  const dayKey = Object.keys(dayNames).find(k => dayNames[k].toLowerCase().startsWith(dayQuery));
  const options = getReplyOptions(msg);

  if (!dayKey || !menuData[dayKey]) {
    bot.sendMessage(chatId, `❌ Меню на "${dayQuery}" не найдено.`, options);
    return;
  }

  const menu = menuData[dayKey];
  let response = `*${dayNames[dayKey]} — ${menu.name}*\n\n`;
  menu.dishes.forEach(d => {
    const emoji = d.type === 'Салат' ? '🥗' : d.type === 'Суп' ? '🍲' : '🥘';
    response += `${emoji} *${d.name}* ${d.desc}\n`;
  });
  bot.sendMessage(chatId, response, options);
});

// --- 7. Полное меню ---
bot.onText(/\/fullmenu/, (msg) => {
  sendFullMenu(msg.chat.id, msg);
});

function sendFullMenu(chatId, originalMsg) {
  const options = getReplyOptions(originalMsg);
  bot.sendMessage(chatId, "🗓️ *Полное меню бизнес-ланча «Кухни Мира»*\n", options);

  Object.entries(menuData).forEach(([dayKey, dayData], idx) => {
    let text = `*${dayNames[dayKey]} — ${dayData.name}*\n`;
    const buttons = [];
    dayData.dishes.forEach(dish => {
      const emoji = dish.type === 'Салат' ? '🥗' : dish.type === 'Суп' ? '🍲' : '🥘';
      text += `  ${emoji} *${dish.name}* ${dish.desc}\n`;
      buttons.push([{ text: `📜 Рецепт "${dish.name}"`, callback_data: `recipe_${dish.id}` }]);
    });
    const opts = getReplyOptions(originalMsg);
    opts.reply_markup = { inline_keyboard: buttons };
    setTimeout(() => bot.sendMessage(chatId, text, opts), (idx + 1) * 300);
  });
}

// --- 8. Помощь ---
function sendHelp(chatId, msg) {
  const options = getReplyOptions(msg);
  const help = `*Chef-Mate команды:*\n\n` +
    `• /menu [день] — Меню по дню\n` +
    `• /fullmenu — Всё меню\n` +
    `• /ttk [блюдо] — Найти ТТК\n` +
    `• Загрузить ТТК: POST /upload или /upload-pdf`;
  bot.sendMessage(chatId, help, options);
}

bot.onText(/\/help/, (msg) => sendHelp(msg.chat.id, msg));
bot.on('callback_query', cb => {
  const msg = cb.message;
  const data = cb.data;
  const options = getReplyOptions(msg);
  if (data === 'show_full_menu') sendFullMenu(msg.chat.id, msg);
  else if (data === 'show_help') sendHelp(msg.chat.id, msg);
  else if (data.startsWith('recipe_')) {
    const id = data.replace('recipe_', '');
    const found = Object.values(menuData).flatMap(d => d.dishes).find(x => x.id === id);
    if (found) {
      const text = `*${found.name}*\n\n${found.cooking_process}`;
      bot.sendMessage(msg.chat.id, text, options);
    }
  }
  bot.answerCallbackQuery(cb.id);
});

// --- 9. Загрузка TTK (Excel/PDF) ---
const upload = multer({ dest: "uploads/" });
app.post("/upload", upload.single("file"), (req, res) => {
  try {
    const workbook = xlsx.readFile(req.file.path);
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
    global.recipeBook = data;
    fs.unlinkSync(req.file.path);
    res.send("✅ Excel успешно обработан!");
  } catch (e) {
    res.status(500).send("❌ Ошибка Excel файла.");
  }
});

app.post("/upload-pdf", upload.single("file"), async (req, res) => {
  try {
    const buffer = fs.readFileSync(req.file.path);
    const text = (await pdfParse(buffer)).text;
    global.recipeBook = parseTTKFromPDF(text);
    fs.unlinkSync(req.file.path);
    res.send("✅ PDF загружен и разобран!");
  } catch (e) {
    res.status(500).send("❌ Ошибка PDF.");
  }
});

function parseTTKFromPDF(text) {
  return text.split(/Технологическая карта №|КАЛЬКУЛЯЦИОННАЯ КАРТА/gi).slice(1).map(raw => {
    const name = (raw.match(/\n([^\n]+)\n/) || [])[1]?.trim() || "Без названия";
    const ingredients = (raw.match(/\n(.+?\d+гр.*?)\n/gi) || []).join(', ');
    const yieldMatch = raw.match(/выход.*?(\d+[.,]?\d*)/i);
    const costMatch = raw.match(/себестоимость.*?(\d+[.,]?\d*)/i);
    return {
      name,
      ingredients,
      yield: yieldMatch ? yieldMatch[1].replace(',', '.') : 'N/A',
      cost: costMatch ? costMatch[1].replace(',', '.') : 'N/A'
    };
  });
}

// --- 10. TTK Команда ---
bot.onText(/\/ttk (.+)/, (msg, match) => {
  const query = match[1].toLowerCase();
  const recipe = global.recipeBook?.find(r => r.name.toLowerCase().includes(query));
  const options = getReplyOptions(msg);
  if (recipe) {
    bot.sendMessage(msg.chat.id, `*${recipe.name}*\n\n🍴 *Ингредиенты:* ${recipe.ingredients}\n📦 *Выход:* ${recipe.yield}\n💰 *Себестоимость:* ${recipe.cost}`, options);
  } else {
    bot.sendMessage(msg.chat.id, `❌ Блюдо "${query}" не найдено.`, options);
  }
});

// --- 11. Планировщик ---
const scheduleConfig = [ /* оставить как было */ ];
scheduleConfig.forEach(job => {
  cron.schedule(job.cronTime, async () => {
    if (job.condition && !job.condition()) return;
    try {
      const sentMessage = await bot.sendMessage(KITCHEN_CHAT_ID, job.message, job.options);
      if (job.action) job.action(sentMessage);
    } catch (e) {
      console.error("Ошибка при плановой отправке:", e.message);
    }
  }, { timezone: "Etc/UTC" });
});

// --- 12. Запуск сервера ---
const listener = app.listen(process.env.PORT || 3000, () => {
  console.log("Chef-Mate активен на порту " + listener.address().port);
});
