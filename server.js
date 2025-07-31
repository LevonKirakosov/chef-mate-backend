/*
 * Файл: server.js
 * Описание: Финальная версия v7.
 * Добавлены автоматические отчеты для руководителя.
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

// --- 3. База Данных и Конфигурация ---
let currentProductionPlan = {}; // "База данных" для хранения текущего плана

const menuData = {
    monday: { name: "Италия 🇮🇹", dishes: [
        { id: 'ita-sal', type: 'Салат', name: 'Панцанелла', desc: '(томаты, огурцы, хлеб, базилик)', cooking_process: '1. Нарезать крупно помидоры, огурцы, лук. 2. Подсушить хлеб. 3. Смешать овощи, хлеб, базилик и заправить оливковым маслом и винным уксусом. Дать настояться 5-10 минут.' },
        { id: 'ita-soup', type: 'Суп', name: 'Минестроне', desc: '(сезонные овощи, паста)', cooking_process: '1. Нарезать мелко картофель, морковь, лук, сельдерей, кабачок. 2. Пассеровать овощи, добавить томаты и бульон. Варить 15-20 минут. 3. Добавить пасту и зеленый горошек, варить до готовности.' },
        { id: 'ita-hot', type: 'Горячее', name: 'Лазанья Болоньезе', desc: '(соус Болоньезе, соус Бешамель, сыр)', cooking_process: '1. Приготовить соусы "Болоньезе" и "Бешамель". 2. В форме выложить слоями: соус Болоньезе, лист лазаньи, соус Бешамель, сыр. Повторить. 3. Запекать при 180°C 20-25 минут.' }
    ]},
    tuesday: { name: "Грузия 🇬🇪", dishes: [
        { id: 'geo-sal', type: 'Салат', name: 'Грузинский с ореховой заправкой', desc: '(томаты, огурцы, орехи, кинза)', cooking_process: '1. Крупно нарезать помидоры и огурцы. 2. Приготовить заправку: измельчить грецкие орехи и чеснок в пасту, смешать с уксусом, водой и специями. 3. Соединить овощи с заправкой.' },
        { id: 'geo-soup', type: 'Суп', name: 'Харчо', desc: '(говядина, рис, ткемали, орехи)', cooking_process: '1. Сварить говяжий бульон. 2. Пассеровать лук с томатной пастой. 3. В бульон добавить рис, ткемали, орехи и пассеровку. Варить до готовности риса. В конце добавить чеснок и кинзу.' },
        { id: 'geo-hot', type: 'Горячее', name: 'Чахохбили из курицы', desc: '(куриное бедро, томаты, специи)', cooking_process: '1. Обжарить куски курицы до золотистой корочки. 2. На вытопившемся жире обжарить лук, добавить помидоры. 3. Соединить курицу с овощами, добавить специи и тушить под крышкой 30-40 минут.' }
    ]},
    wednesday: { name: "Франция 🇫🇷", dishes: [
        { id: 'fra-sal', type: 'Салат', name: 'Лионский салат', desc: '(салатный микс, бекон, яйцо-пашот)', cooking_process: '1. Обжарить бекон, приготовить гренки. 2. Приготовить яйцо-пашот. 3. Выложить на салатные листья гренки и бекон, в центр поместить яйцо-пашот. Полить дижонской заправкой.' },
        { id: 'fra-soup', type: 'Суп', name: 'Грибной крем-суп', desc: '(шампиньоны, сливки, трюфельное масло)', cooking_process: '1. Обжарить грибы с луком. 2. Добавить картофель, бульон и варить до готовности. Пюрировать блендером. 3. Влить сливки, прогреть, не доводя до кипения.' },
        { id: 'fra-hot', type: 'Горячее', name: 'Куриное фрикасе', desc: '(куриное филе, грибы, сливочный соус)', cooking_process: '1. Обжарить кусочки курицы с луком и грибами. 2. Присыпать мукой, влить вино (по желанию) и сливки. 3. Тушить 10-15 минут до загустения соуса.' }
    ]},
    thursday: { name: "Россия 🇷🇺", dishes: [
        { id: 'rus-sal', type: 'Салат', name: 'Винегрет с килькой', desc: '(свекла, картофель, килька, гренки)', cooking_process: '1. Отварные овощи нарезать кубиком, смешать с квашеной капустой и горошком. 2. Заправить ароматным подсолнечным маслом. 3. Подавать с филе кильки и бородинскими гренками.' },
        { id: 'rus-soup', type: 'Суп', name: 'Борщ «Московский»', desc: '(говядина, свекла, копчености)', cooking_process: '1. Сварить бульон. Тушить свеклу с томатной пастой. 2. В бульон положить картофель и капусту, затем пассерованные овощи и свеклу. Варить до готовности. 3. Подавать с набором нарезанных копченостей и сметаной.' },
        { id: 'rus-hot', type: 'Горячее', name: 'Бефстроганов с картофельным гратеном', desc: '(говядина, сметанный соус, гратен)', cooking_process: '1. Тонко нарезанную говядину быстро обжарить с луком. 2. Добавить сметану, приправить и тушить 15-20 минут. 3. Картофель нарезать слайсами, залить сливками, посыпать сыром и запекать.' }
    ]},
    friday: { name: "Мексика 🇲🇽", dishes: [
        { id: 'mex-sal', type: 'Салат', name: 'Мексиканский салат', desc: '(фасоль, кукуруза, перец, лайм)', cooking_process: '1. Смешать консервированные фасоль и кукурузу. 2. Добавить мелко нарезанные болгарский перец, огурец и красный лук. 3. Заправить смесью оливкового масла и сока лайма.' },
        { id: 'mex-soup', type: 'Суп', name: 'Томатный крем-суп с чили', desc: '(томаты, чили, кинза)', cooking_process: '1. Пассеровать лук и чеснок, добавить консервированные томаты и бульон. Варить 15-20 минут. 2. Добавить кинзу и пюрировать блендером. 3. Прогреть, не доводя до кипения.' },
        { id: 'mex-hot', type: 'Горячее', name: 'Кесадилья с курицей', desc: '(тортилья, курица, сыр, овощи)', cooking_process: '1. Обжарить мелко нарезанное куриное филе с перцем и луком. 2. На половину лепешки выложить начинку, посыпать сыром, сложить пополам. 3. Обжарить на сухой сковороде до расплавления сыра.' }
    ]}
};
const dayNames = { monday: 'Понедельник', tuesday: 'Вторник', wednesday: 'Среда', thursday: 'Четверг', friday: 'Пятница' };
const KITCHEN_CHAT_ID = '-1002389108118'; // ID вашего группового чата
const MANAGER_TELEGRAM_ID = '2553122118'; // ВАЖНО: Замените на ID руководителя

let lineCheckState = { confirmed: false, messageId: null, confirmedBy: null, confirmedAt: null };

// --- 4. API для сайта KMS ---
app.post('/api/plan', (req, res) => {
    const { plan_data } = req.body;
    if (plan_data) {
        currentProductionPlan = plan_data;
        console.log(">>> [API] Получен и сохранен новый план производства:", currentProductionPlan);
        res.json({ success: true, message: "План успешно обновлен." });
    } else {
        res.status(400).json({ success: false, message: "Неверный формат данных." });
    }
});


// --- 5. Логика обработки сообщений от Telegram ---

app.post(webhookPath, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

const getReplyOptions = (msg) => {
    const options = { parse_mode: 'Markdown' };
    if (msg && msg.is_topic_message && msg.message_thread_id) {
        options.message_thread_id = msg.message_thread_id;
    }
    return options;
};

bot.onText(/^шеф/i, (msg) => {
  const chatId = msg.chat.id;
  const userName = msg.from.first_name || 'Повар';
  const welcomeMessage = `*Слушаю вас, ${userName}!* 👨‍🍳\n\nЯ ваш цифровой су-шеф "Chef-Mate". Готов помочь сделать нашу кухню самой организованной!\n\n🚀 *Быстрый старт:*`;
  const options = getReplyOptions(msg);
  options.reply_markup = {
      inline_keyboard: [
          [{ text: '🗓️ Показать полное меню', callback_data: 'show_full_menu' }],
          [{ text: '❓ Получить помощь', callback_data: 'show_help' }]
      ]
  };
  bot.sendMessage(chatId, welcomeMessage, options);
});

// ... (остальные команды /menu, /recipe, /fullmenu и обработка ключевых слов остаются без изменений) ...
bot.onText(/\/menu(?: (.+))?/, (msg, match) => {
    const chatId = msg.chat.id;
    const dayQuery = match[1] ? match[1].toLowerCase() : null;
    const options = getReplyOptions(msg);
    if (!dayQuery) {
        bot.sendMessage(chatId, "Пожалуйста, укажите день недели (например, /menu понедельник).", options);
        return;
    }
    let dayKey = Object.keys(dayNames).find(key => dayNames[key].toLowerCase().startsWith(dayQuery));
    if (dayKey && menuData[dayKey]) {
        const dayMenu = menuData[dayKey];
        let response = `*${dayNames[dayKey]} — ${dayMenu.name}*\n\n`;
        dayMenu.dishes.forEach(dish => {
            response += `• *${dish.type}:* ${dish.name}\n`;
        });
        bot.sendMessage(chatId, response, options);
    } else {
        bot.sendMessage(chatId, `Не могу найти меню на "${dayQuery}". Пожалуйста, проверьте день недели.`, options);
    }
});
bot.onText(/\/recipe (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const query = match[1].toLowerCase();
    const options = getReplyOptions(msg);
    let foundDish = null;
    for (const day in menuData) {
        const dish = menuData[day].dishes.find(d => d.name.toLowerCase().includes(query));
        if (dish) { foundDish = dish; break; }
    }
    if (foundDish) {
        const response = `*Краткая технология "${foundDish.name}":*\n\n${foundDish.cooking_process}\n\n_Полная ТТК, информация о хранении и подаче доступна на основном сайте KMS._`;
        bot.sendMessage(chatId, response, options);
    } else {
        bot.sendMessage(chatId, `Рецепт для "${query}" не найден. Пожалуйста, проверьте название.`, options);
    }
});
bot.onText(/\/fullmenu/, (msg) => {
    sendFullMenu(msg.chat.id, msg);
});
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text ? msg.text.toLowerCase() : '';
    if (text.startsWith('/') || msg.from.is_bot || text.startsWith('шеф')) return;
    if (text.includes('бот') || text.includes('помощь')) {
        sendHelpMessage(chatId, msg);
    }
});

bot.on('callback_query', (callbackQuery) => {
    const msg = callbackQuery.message;
    const data = callbackQuery.data;
    const chatId = msg.chat.id;
    const user = callbackQuery.from.first_name;
    const options = getReplyOptions(msg);

    if (data === 'show_full_menu') {
        sendFullMenu(chatId, msg);
        bot.answerCallbackQuery(callbackQuery.id);
    } else if (data === 'show_help') {
        sendHelpMessage(chatId, msg);
        bot.answerCallbackQuery(callbackQuery.id);
    } else if (data.startsWith('recipe_')) {
        const dishId = data.replace('recipe_', '');
        let foundDish = null;
        for (const day in menuData) {
            const dish = menuData[day].dishes.find(d => d.id === dishId);
            if (dish) { foundDish = dish; break; }
        }
        if (foundDish) {
            const response = `*Краткая технология "${foundDish.name}":*\n\n${foundDish.cooking_process}\n\n_Полная ТТК, информация о хранении и подаче доступна на основном сайте KMS._`;
            bot.sendMessage(chatId, response, options);
            bot.answerCallbackQuery(callbackQuery.id, { text: `Рецепт "${foundDish.name}" отправлен.` });
        }
    } else if (data === 'line_check_confirm') {
        lineCheckState.confirmed = true;
        lineCheckState.confirmedBy = user;
        lineCheckState.confirmedAt = new Date();
        bot.editMessageText(`*Утренний Лайн-чек (09:00)*\n\nСтанция готова к работе. ✅\n_Подтвердил(а): ${user} в ${lineCheckState.confirmedAt.toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow' })}_`, {
            chat_id: chatId,
            message_id: msg.message_id,
            parse_mode: 'Markdown'
        });
        bot.answerCallbackQuery(callbackQuery.id, { text: `Спасибо, ${user}! Статус подтвержден.` });
    }
});

// --- Вспомогательные функции ---
function sendFullMenu(chatId, originalMsg) {
    const options = getReplyOptions(originalMsg);
    let initialMessage = "🗓️ *Полное меню бизнес-ланча «Кухни Мира»*\n\n";
    bot.sendMessage(chatId, initialMessage, options);

    Object.keys(menuData).forEach((dayKey, index) => {
        const dayData = menuData[dayKey];
        let response = `*${dayNames[dayKey]} — ${dayData.name}*\n`;
        const buttons = [];
        
        dayData.dishes.forEach(dish => {
            const emoji = dish.type === 'Салат' ? '🥗' : dish.type === 'Суп' ? '🍲' : '🥘';
            response += `  ${emoji} *${dish.name}* ${dish.desc}\n`;
            buttons.push({ text: `📜 Рецепт "${dish.name}"`, callback_data: `recipe_${dish.id}` });
        });
        
        const keyboard = [];
        for (let i = 0; i < buttons.length; i++) {
            keyboard.push([buttons[i]]);
        }

        const dayOptions = getReplyOptions(originalMsg);
        dayOptions.reply_markup = { inline_keyboard: keyboard };

        setTimeout(() => {
            bot.sendMessage(chatId, response, dayOptions);
        }, (index + 1) * 500);
    });
}

function sendHelpMessage(chatId, originalMsg) {
    const options = getReplyOptions(originalMsg);
    const helpMessage = `Я к вашим услугам! 👨‍🍳\n\nЕсли вам нужна информация, воспользуйтесь командами:\n- **/menu [день]**\n- **/recipe [название]**\n- **/fullmenu**\n\nИли просто напишите "Шеф", чтобы вызвать главное меню.`;
    bot.sendMessage(chatId, helpMessage, options);
}


// --- 6. Проактивные уведомления (Планировщик) ---
const scheduleConfig = [
    {
        cronTime: '0 6 * * 1-5', // 09:00 МСК
        message: `*Утренний Лайн-чек (09:00)* ☀️\n\nДоброе утро, команда! Пора начинать проверку станции. Ответственный, пожалуйста, подтвердите готовность.\n\nТакже не забудьте *распечатать Лайн-чек* с заготовочным листом с основного сайта KMS.`,
        options: {
            reply_markup: {
                inline_keyboard: [[{ text: '✅ Подтвердить готовность', callback_data: 'line_check_confirm' }]]
            },
            parse_mode: 'Markdown'
        },
        action: (message) => {
            lineCheckState = { confirmed: false, messageId: message.message_id, confirmedBy: null, confirmedAt: null };
        }
    },
    {
        cronTime: '30 6 * * 1-5', // 09:30 МСК
        message: `*‼️ ВНИМАНИЕ: Лайн-чек не подтвержден! (09:30)*\n\nКоманда, утренний Лайн-чек все еще не подтвержден. Прошу ответственного немедленно выполнить проверку и нажать кнопку в предыдущем сообщении.`,
        options: { parse_mode: 'Markdown' },
        condition: () => !lineCheckState.confirmed
    },
    {
        cronTime: '0 12 * * 1-5', // 15:00 МСК
        message: `*Контроль HACCP (15:00)* 🌡️\n\nНапоминание: Время замерить температуру в холодильнике №2 (мясной). Внесите значение в журнал.`,
        options: { parse_mode: 'Markdown' }
    },
    {
        cronTime: '30 19 * * 1-5', // 22:30 МСК
        action: () => { // Это действие, а не просто сообщение
            const today = new Date();
            const dayIndex = today.getDay();
            const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            const currentDayKey = dayKeys[dayIndex];

            let report = `*📋 Вечерний отчет для руководителя*\n*Дата:* ${today.toLocaleDateString('ru-RU')}\n\n`;

            // 1. Статус Лайн-чека
            report += `*1. Утренний Лайн-чек:*\n`;
            if (lineCheckState.confirmed) {
                report += `   - ✅ Выполнен в ${lineCheckState.confirmedAt.toLocaleTimeString('ru-RU', {timeZone: 'Europe/Moscow'})}\n`;
                report += `   - Ответственный: ${lineCheckState.confirmedBy}\n\n`;
            } else {
                report += `   - ❌ *НЕ ВЫПОЛНЕН*\n\n`;
            }

            // 2. План на день
            report += `*2. План производства на сегодня:*\n`;
            if (currentProductionPlan[currentDayKey] && Object.keys(currentProductionPlan[currentDayKey]).length > 0) {
                const dailyPlan = currentProductionPlan[currentDayKey];
                menuData[currentDayKey].dishes.forEach(dish => {
                    const plannedQty = dailyPlan[dish.id] || 0;
                    if (plannedQty > 0) {
                        report += `   - ${dish.name}: ${plannedQty} порций\n`;
                    }
                });
            } else {
                report += `   - _План на сегодня не был загружен._\n`;
            }
            
            // 3. Симуляция аналитики
            report += `\n*3. Аналитика продаж (симуляция):*\n`;
            report += `   - _Функционал в разработке. Здесь будет сравнение плана и факта продаж._\n`;
            
            bot.sendMessage(MANAGER_TELEGRAM_ID, report, { parse_mode: 'Markdown' });
        }
    }
];

scheduleConfig.forEach(job => {
    cron.schedule(job.cronTime, async () => {
        if (job.condition && !job.condition()) {
            return;
        }
        try {
            if (job.action && !job.message) {
                job.action();
            } else {
                const sentMessage = await bot.sendMessage(KITCHEN_CHAT_ID, job.message, job.options);
                if (job.action) {
                    job.action(sentMessage);
                }
            }
        } catch (error) {
            console.error(`Ошибка при отправке запланированного сообщения: ${error.message}`);
        }
    }, {
        timezone: "Etc/UTC"
    });
});

console.log("Планировщик уведомлений запущен с обновленной конфигурацией.");

// --- 7. Запуск сервера ---
const listener = app.listen(process.env.PORT || 3000, () => {
  console.log("Сервер запущен и слушает порт " + listener.address().port);
});
