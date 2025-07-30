/*
 * Файл: server.js
 * Описание: Финальная, полнофункциональная версия сервера для Chef-Mate.
 * Включает в себя полную базу данных с сайта (рецепты, технологии) и проактивные уведомления.
 */

// --- 1. Подключение необходимых библиотек ---
const express = require("express");
const bodyParser = require("body-parser");
const TelegramBot = require("node-telegram-bot-api");
const cron = require("node-cron");

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

// --- 3. Полная База Данных (интегрирована с сайта) ---
const menuData = {
    monday: { name: "Италия", dishes: [
        { id: 'ita-sal', type: 'Салат', name: 'Панцанелла', cooking_process: '1. Нарезать крупно помидоры, огурцы, лук. 2. Подсушить хлеб. 3. Смешать овощи, хлеб, базилик и заправить оливковым маслом и винным уксусом. Дать настояться 5-10 минут.' },
        { id: 'ita-soup', type: 'Суп', name: 'Минестроне', cooking_process: '1. Нарезать мелко картофель, морковь, лук, сельдерей, кабачок. 2. Пассеровать овощи, добавить томаты и бульон. Варить 15-20 минут. 3. Добавить пасту и зеленый горошек, варить до готовности.' },
        { id: 'ita-hot', type: 'Горячее', name: 'Лазанья Болоньезе', cooking_process: '1. Приготовить соусы "Болоньезе" и "Бешамель". 2. В форме выложить слоями: соус Болоньезе, лист лазаньи, соус Бешамель, сыр. Повторить. 3. Запекать при 180°C 20-25 минут.' }
    ]},
    tuesday: { name: "Грузия", dishes: [
        { id: 'geo-sal', type: 'Салат', name: 'Грузинский с ореховой заправкой', cooking_process: '1. Крупно нарезать помидоры и огурцы. 2. Приготовить заправку: измельчить грецкие орехи и чеснок в пасту, смешать с уксусом, водой и специями. 3. Соединить овощи с заправкой.' },
        { id: 'geo-soup', type: 'Суп', name: 'Харчо', cooking_process: '1. Сварить говяжий бульон. 2. Пассеровать лук с томатной пастой. 3. В бульон добавить рис, ткемали, орехи и пассеровку. Варить до готовности риса. В конце добавить чеснок и кинзу.' },
        { id: 'geo-hot', type: 'Горячее', name: 'Чахохбили из курицы', cooking_process: '1. Обжарить куски курицы до золотистой корочки. 2. На вытопившемся жире обжарить лук, добавить помидоры. 3. Соединить курицу с овощами, добавить специи и тушить под крышкой 30-40 минут.' }
    ]},
    wednesday: { name: "Франция", dishes: [
        { id: 'fra-sal', type: 'Салат', name: 'Лионский салат', cooking_process: '1. Обжарить бекон, приготовить гренки. 2. Приготовить яйцо-пашот. 3. Выложить на салатные листья гренки и бекон, в центр поместить яйцо-пашот. Полить дижонской заправкой.' },
        { id: 'fra-soup', type: 'Суп', name: 'Грибной крем-суп', cooking_process: '1. Обжарить грибы с луком. 2. Добавить картофель, бульон и варить до готовности. Пюрировать блендером. 3. Влить сливки, прогреть, не доводя до кипения.' },
        { id: 'fra-hot', type: 'Горячее', name: 'Куриное фрикасе', cooking_process: '1. Обжарить кусочки курицы с луком и грибами. 2. Присыпать мукой, влить вино (по желанию) и сливки. 3. Тушить 10-15 минут до загустения соуса.' }
    ]},
    thursday: { name: "Россия", dishes: [
        { id: 'rus-sal', type: 'Салат', name: 'Винегрет с килькой', cooking_process: '1. Отварные овощи нарезать кубиком, смешать с квашеной капустой и горошком. 2. Заправить ароматным подсолнечным маслом. 3. Подавать с филе кильки и бородинскими гренками.' },
        { id: 'rus-soup', type: 'Суп', name: 'Борщ «Московский»', cooking_process: '1. Сварить бульон. Тушить свеклу с томатной пастой. 2. В бульон положить картофель и капусту, затем пассерованные овощи и свеклу. Варить до готовности. 3. Подавать с набором нарезанных копченостей и сметаной.' },
        { id: 'rus-hot', type: 'Горячее', name: 'Бефстроганов с картофельным гратеном', cooking_process: '1. Тонко нарезанную говядину быстро обжарить с луком. 2. Добавить сметану, приправить и тушить 15-20 минут. 3. Картофель нарезать слайсами, залить сливками, посыпать сыром и запекать.' }
    ]},
    friday: { name: "Мексика", dishes: [
        { id: 'mex-sal', type: 'Салат', name: 'Мексиканский салат', cooking_process: '1. Смешать консервированные фасоль и кукурузу. 2. Добавить мелко нарезанные болгарский перец, огурец и красный лук. 3. Заправить смесью оливкового масла и сока лайма.' },
        { id: 'mex-soup', type: 'Суп', name: 'Томатный крем-суп с чили', cooking_process: '1. Пассеровать лук и чеснок, добавить консервированные томаты и бульон. Варить 15-20 минут. 2. Добавить кинзу и пюрировать блендером. 3. Прогреть, не доводя до кипения.' },
        { id: 'mex-hot', type: 'Горячее', name: 'Кесадилья с курицей', cooking_process: '1. Обжарить мелко нарезанное куриное филе с перцем и луком. 2. На половину лепешки выложить начинку, посыпать сыром, сложить пополам. 3. Обжарить на сухой сковороде до расплавления сыра.' }
    ]}
};
const dayNames = { monday: 'Понедельник', tuesday: 'Вторник', wednesday: 'Среда', thursday: 'Четверг', friday: 'Пятница' };
const KITCHEN_CHAT_ID = '-2389108118'; // ID вашего группового чата

// --- 4. Логика обработки сообщений от Telegram ---

app.post(webhookPath, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userName = msg.from.first_name || 'Повар';
  const welcomeMessage = `Добро пожаловать, ${userName}! Я ваш цифровой су-шеф "Chef-Mate".\n\nЯ готов помогать вам управлять кухней. Вот что я умею:\n- **/menu [день]**: Показать меню (например, /menu понедельник).\n- **/recipe [название]**: Показать рецепт (например, /recipe харчо).\n\nВсе важные уведомления будут приходить в чат кухни.`;
  bot.sendMessage(chatId, welcomeMessage);
});

bot.onText(/\/menu(?: (.+))?/, (msg, match) => {
    const chatId = msg.chat.id;
    const dayQuery = match[1] ? match[1].toLowerCase() : null;
    
    if (!dayQuery) {
        bot.sendMessage(chatId, "Пожалуйста, укажите день недели (например, /menu понедельник).");
        return;
    }

    let dayKey = Object.keys(dayNames).find(key => dayNames[key].toLowerCase().startsWith(dayQuery));

    if (dayKey && menuData[dayKey]) {
        const dayMenu = menuData[dayKey];
        let response = `*Меню на ${dayNames[dayKey]} (${dayMenu.name}):*\n\n`;
        dayMenu.dishes.forEach(dish => {
            response += `• *${dish.type}:* ${dish.name}\n`;
        });
        bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
    } else {
        bot.sendMessage(chatId, `Не могу найти меню на "${dayQuery}". Пожалуйста, проверьте день недели.`);
    }
});

bot.onText(/\/recipe (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const query = match[1].toLowerCase();
    let foundDish = null;

    for (const day in menuData) {
        const dish = menuData[day].dishes.find(d => d.name.toLowerCase().includes(query));
        if (dish) {
            foundDish = dish;
            break;
        }
    }

    if (foundDish) {
        const response = `*Краткая технология "${foundDish.name}":*\n\n${foundDish.cooking_process}`;
        bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
    } else {
        bot.sendMessage(chatId, `Рецепт для "${query}" не найден. Пожалуйста, проверьте название.`);
    }
});

bot.on('callback_query', (callbackQuery) => {
    const msg = callbackQuery.message;
    const data = callbackQuery.data;
    const chatId = msg.chat.id;
    const user = callbackQuery.from.first_name;

    if (data === 'line_check_confirm') {
        bot.editMessageText(`*Утренний Лайн-чек (09:00)*\n\nСтанция готова к работе. ✅\n_Подтвердил(а): ${user} в ${new Date().toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow' })}_`, {
            chat_id: chatId,
            message_id: msg.message_id,
            parse_mode: 'Markdown'
        });
        bot.answerCallbackQuery(callbackQuery.id, { text: `Спасибо, ${user}! Статус подтвержден.` });
    }
});

// --- 5. Проактивные уведомления (Планировщик) ---
cron.schedule('0 6 * * 1-5', () => {
    const message = `*Утренний Лайн-чек (09:00)*\n\nДоброе утро, команда! Пора начинать проверку станции. Ответственный, пожалуйста, подтвердите готовность.`;
    const options = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '✅ Подтвердить готовность', callback_data: 'line_check_confirm' }]
            ]
        },
        parse_mode: 'Markdown'
    };
    bot.sendMessage(KITCHEN_CHAT_ID, message, options);
}, {
    timezone: "Etc/UTC"
});

cron.schedule('0 12 * * 1-5', () => {
    const message = `*Контроль HACCP (15:00)*\n\nНапоминание: Время замерить температуру в холодильнике №2 (мясной). Внесите значение в журнал.`;
    bot.sendMessage(KITCHEN_CHAT_ID, message, { parse_mode: 'Markdown' });
}, {
    timezone: "Etc/UTC"
});

// --- 6. Запуск сервера ---
const listener = app.listen(process.env.PORT || 3000, () => {
  console.log("Сервер запущен и слушает порт " + listener.address().port);
});
