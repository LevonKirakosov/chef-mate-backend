/*
 * Файл: iiko-api.js
 * Описание: Модуль для взаимодействия с API IIKO.
 * Управляет аутентификацией, получением номенклатуры, остатков и рецептов.
 * ИСПРАВЛЕННАЯ ВЕРСИЯ: Код собирает номенклатуру со ВСЕХ терминальных групп.
 */

const axios = require('axios');

// --- 1. Конфигурация ---
const IIKO_API_LOGIN = process.env.IIKO_API_LOGIN;
const API_BASE_URL = 'https://api-ru.iiko.services/api/1';

let authToken = null;
let organizationId = null;
// Глобальная переменная для хранения объединенной номенклатуры
let nomenclature = {
    products: [],
    dishes: [],
    groups: [],
    sizes: [],
    revision: 0
};

if (!IIKO_API_LOGIN) {
    console.error("КРИТИЧЕСКАЯ ОШИБКА: Переменная окружения IIKO_API_LOGIN должна быть установлена!");
    process.exit(1); // Завершаем работу, если нет логина
}

// --- 2. Аутентификация и инициализация ---

/**
 * Шаг 1: Получает токен доступа к API IIKO.
 */
async function getAuthToken() {
    try {
        const response = await axios.post(`${API_BASE_URL}/access_token`, { apiLogin: IIKO_API_LOGIN });
        console.log("Токен IIKO успешно получен.");
        authToken = response.data.token;
    } catch (error) {
        const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error("Ошибка на Шаге 1 (Получение токена):", errorMessage);
        throw new Error(`Не удалось получить токен IIKO: ${errorMessage}`);
    }
}

/**
 * Шаг 2: Получает список организаций и сохраняет ID первой.
 */
async function getOrganizations() {
    if (!authToken) throw new Error("Нет токена для запроса организаций.");
    try {
        const response = await axios.post(`${API_BASE_URL}/organizations`, {}, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (response.data.organizations && response.data.organizations.length > 0) {
            // Используем первую организацию из списка
            organizationId = response.data.organizations[0].id;
            console.log(`Получен ID организации: ${organizationId}`);
        } else {
            throw new Error("Список организаций пуст.");
        }
    } catch (error) {
        const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error("Ошибка на Шаге 2 (Получение организаций):", errorMessage);
        throw new Error(`Не удалось получить организации: ${errorMessage}`);
    }
}

/**
 * Шаг 3: Получает ID ВСЕХ активных терминальных групп для организации.
 * @returns {Promise<string[]>} Массив с ID терминальных групп.
 */
async function getTerminalGroupIds() {
    if (!authToken || !organizationId) throw new Error("Нет токена или ID организации для запроса терминальных групп.");
    try {
        const response = await axios.post(`${API_BASE_URL}/terminal_groups`, {
            organizationIds: [organizationId],
            includeDisabled: false // Не включать отключенные
        }, { headers: { 'Authorization': `Bearer ${authToken}` } });

        const terminalGroupIds = [];
        if (response.data.terminalGroups && response.data.terminalGroups.length > 0) {
            response.data.terminalGroups.forEach(orgGroup => {
                orgGroup.items.forEach(terminal => {
                    terminalGroupIds.push(terminal.id);
                });
            });
        }

        if (terminalGroupIds.length === 0) {
            throw new Error("Активные терминальные группы не найдены.");
        }

        console.log(`Найдены ID терминальных групп: ${terminalGroupIds.join(', ')}`);
        return terminalGroupIds;
    } catch (error) {
        const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error("Ошибка на Шаге 3 (Получение терминальных групп):", errorMessage);
        throw new Error(`Не удалось получить терминальные группы: ${errorMessage}`);
    }
}

/**
 * Инициализирует модуль, выполняя всю цепочку запросов.
 */
async function initialize() {
    try {
        await getAuthToken();      // 1. Получаем токен
        await getOrganizations();  // 2. Получаем организации
        const terminalGroupIds = await getTerminalGroupIds(); // 3. Получаем ВСЕ ID терминалов
        await refreshNomenclature(terminalGroupIds); // 4. Получаем и объединяем номенклатуру

        // Настраиваем периодическое обновление токена и номенклатуры
        setInterval(getAuthToken, 55 * 60 * 1000); // Обновление токена каждые 55 минут
        setInterval(() => refreshNomenclature(terminalGroupIds), 60 * 60 * 1000); // Полное обновление номенклатуры каждый час

        console.log("Модуль iiko-api успешно инициализирован и готов к работе.");

    } catch (error) {
        console.error("КРИТИЧЕСКАЯ ОШИБКА при инициализации модуля:", error.message);
    }
}

// --- 3. Функции для работы с данными ---

/**
 * Шаг 4: Загружает и ОБЪЕДИНЯЕТ номенклатуру со всех терминальных групп.
 * @param {string[]} terminalGroupIds - Массив ID терминальных групп.
 */
async function refreshNomenclature(terminalGroupIds) {
    if (!authToken || !organizationId) {
        console.error("Пропуск обновления номенклатуры: отсутствует токен или ID организации.");
        return;
    }
    if (!terminalGroupIds || terminalGroupIds.length === 0) {
        console.error("Пропуск обновления номенклатуры: не переданы ID терминальных групп.");
        return;
    }

    console.log("Начало обновления номенклатуры...");

    try {
        // Создаем массив промисов для параллельного запроса номенклатуры
        const nomenclaturePromises = terminalGroupIds.map(tgId =>
            axios.post(`${API_BASE_URL}/nomenclature`, {
                organizationId: organizationId,
                terminalGroupId: tgId
            }, { headers: { 'Authorization': `Bearer ${authToken}` } })
        );

        // Дожидаемся выполнения всех запросов
        const responses = await Promise.all(nomenclaturePromises);

        // Используем Map для сборки уникальных позиций, чтобы избежать дублей
        const productMap = new Map();
        const dishMap = new Map();

        responses.forEach(response => {
            const data = response.data;
            if (data.products) {
                data.products.forEach(p => productMap.set(p.id, p));
            }
            if (data.dishes) {
                data.dishes.forEach(d => dishMap.set(d.id, d));
            }
        });

        // Обновляем глобальную переменную номенклатуры
        nomenclature.products = Array.from(productMap.values());
        nomenclature.dishes = Array.from(dishMap.values());
        // Можно также объединять группы, размеры и т.д., если это необходимо
        // nomenclature.groups = ...

        const productsCount = nomenclature.products.length;
        const dishesCount = nomenclature.dishes.length;
        console.log(`Номенклатура успешно обновлена: ${productsCount} уникальных продуктов, ${dishesCount} уникальных блюд.`);

    } catch (error) {
        const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error("Ошибка при загрузке номенклатуры:", errorMessage);
    }
}


/**
 * Находит блюдо в номенклатуре по части названия.
 */
function findDish(query) {
    if (!nomenclature || !nomenclature.dishes) return null;
    const lowerCaseQuery = query.toLowerCase();
    return nomenclature.dishes.find(d => d.name.toLowerCase().includes(lowerCaseQuery));
}

/**
 * Получает технологическую карту (рецепт) для блюда.
 */
function getRecipe(dishId) {
    if (!nomenclature || !nomenclature.products || !nomenclature.dishes) return "Номенклатура еще не загружена.";

    const dish = nomenclature.dishes.find(d => d.id === dishId);
    if (!dish) {
        return "Блюдо с таким ID не найдено в номенклатуре.";
    }
    if (!dish.assemblyCharts || dish.assemblyCharts.length === 0) {
        return `Технологическая карта для блюда "${dish.name}" не найдена или пуста.`;
    }

    // Предполагаем, что используем первую тех. карту
    const chart = dish.assemblyCharts[0];
    let recipeText = `*Тех. карта для "${dish.name}" (Выход: ${chart.yield} г):*\n\n`;

    chart.items.forEach(item => {
        const product = nomenclature.products.find(p => p.id === item.productId);
        const productName = product ? product.name : `Неизвестный продукт (ID: ${item.productId})`;
        recipeText += `• *${productName}:* ${item.amount} ${product ? product.mainUnit : ''} (нетто)\n`;
    });

    return recipeText;
}

/**
 * Получает остатки на складах.
 */
async function getStockReport() {
    if (!authToken || !organizationId) return "Ошибка: нет токена или ID организации.";
    try {
        const response = await axios.post(`${API_BASE_URL}/reports/rest_stops`, {
            organizationIds: [organizationId]
        }, { headers: { 'Authorization': `Bearer ${authToken}` } });

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
        const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error("Ошибка при получении отчета по остаткам:", errorMessage);
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
