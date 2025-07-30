/*
 * Файл: iiko-api.js
 * Описание: Модуль для взаимодействия с API IIKO.
 * Управляет аутентификацией, получением номенклатуры, остатков и рецептов.
 * ДОБАВЛЕНО: Функция для поиска остатков по конкретному продукту.
 */

const axios = require('axios');

// --- 1. Конфигурация ---
const IIKO_API_LOGIN = process.env.IIKO_API_LOGIN;
const API_BASE_URL = 'https://api-ru.iiko.services/api/1';

let authToken = null;
let organizationId = null;
let terminalGroupId = null;
let nomenclature = null;

if (!IIKO_API_LOGIN) {
    console.error("КРИТИЧЕСКАЯ ОШИБКА: Переменная окружения IIKO_API_LOGIN должна быть установлена!");
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
 * Шаг 3: Получает список терминальных групп для организации.
 */
async function getTerminalGroups() {
    if (!authToken || !organizationId) throw new Error("Нет токена или ID организации для запроса терминальных групп.");
    try {
        const response = await axios.post(`${API_BASE_URL}/terminal_groups`,
            {
                organizationIds: [organizationId],
                includeDisabled: false
            },
            { headers: { 'Authorization': `Bearer ${authToken}` } }
        );

        if (response.data.terminalGroups && response.data.terminalGroups.length > 0 && response.data.terminalGroups[0].items.length > 0) {
            terminalGroupId = response.data.terminalGroups[0].items[0].id;
            console.log(`Получен ID терминальной группы: ${terminalGroupId}`);
        } else {
            throw new Error("Список терминальных групп пуст или не содержит активных терминалов.");
        }
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
    await getAuthToken();
    await getOrganizations();
    await getTerminalGroups();
    await refreshNomenclature();

    setInterval(getAuthToken, 55 * 60 * 1000);
}

// --- 3. Функции для работы с данными ---

/**
 * Шаг 4: Обновляет кэш номенклатуры.
 */
async function refreshNomenclature() {
    if (!authToken || !organizationId || !terminalGroupId) {
        console.error("Пропуск обновления номенклатуры: отсутствует токен, ID организации или ID терминальной группы.");
        return;
    }
    try {
        const response = await axios.post(`${API_BASE_URL}/nomenclature`,
            {
                organizationId: organizationId,
                terminalGroupId: terminalGroupId
            },
            { headers: { 'Authorization': `Bearer ${authToken}` } }
        );
        nomenclature = response.data;
        const productsCount = nomenclature.products ? nomenclature.products.length : 0;
        const dishesCount = nomenclature.dishes ? nomenclature.dishes.length : 0;
        console.log(`Номенклатура успешно загружена: ${productsCount} продуктов, ${dishesCount} блюд.`);
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
    if (!dish || !dish.assemblyCharts || dish.assemblyCharts.length === 0) {
        return "Технологическая карта для этого блюда не найдена.";
    }

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
 * Получает полный отчет по остаткам на складах.
 */
async function getStockReport() {
    if (!authToken || !organizationId) return "Ошибка: нет токена или ID организации.";
    try {
        const response = await axios.post(`${API_BASE_URL}/reports/rest_stops`,
            { organizationIds: [organizationId] },
            { headers: { 'Authorization': `Bearer ${authToken}` } }
        );

        const items = response.data.data;
        if (!items || items.length === 0) {
            return "Остатки не найдены или склады пусты.";
        }

        let reportText = "*Полный отчет по остаткам на складах:*\n\n";
        items.forEach(item => {
            reportText += `• *${item.name}:* ${item.amount} ${item.unit}\n`;
        });
        return reportText;

    } catch (error) {
        console.error("Ошибка при получении отчета по остаткам:", error.response ? error.response.data : error.message);
        return "Не удалось получить отчет по остаткам. Попробуйте позже.";
    }
}

/**
 * НОВАЯ ФУНКЦИЯ: Получает остатки по конкретному продукту.
 * @param {string} query - Часть названия продукта для поиска.
 * @returns {Promise<string>} Отформатированная строка с остатком.
 */
async function findProductStock(query) {
    if (!authToken || !organizationId) return "Ошибка: нет токена или ID организации.";
    try {
        const response = await axios.post(`${API_BASE_URL}/reports/rest_stops`,
            { organizationIds: [organizationId] },
            { headers: { 'Authorization': `Bearer ${authToken}` } }
        );

        const items = response.data.data;
        if (!items || items.length === 0) {
            return "Остатки не найдены или склады пусты.";
        }

        const lowerCaseQuery = query.toLowerCase();
        const foundItem = items.find(item => item.name.toLowerCase().includes(lowerCaseQuery));

        if (foundItem) {
            return `*Остаток для "${foundItem.name}":* ${foundItem.amount} ${foundItem.unit}`;
        } else {
            return `Продукт, содержащий "${query}", не найден на остатках.`;
        }

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
    getStockReport,
    findProductStock // Экспортируем новую функцию
};
