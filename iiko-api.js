/*
 * Файл: iiko-api.js
 * Описание: Модуль для взаимодействия с API IIKO.
 * Управляет аутентификацией, получением номенклатуры, остатков и рецептов.
 */

const axios = require('axios');

// --- 1. Конфигурация ---
const IIKO_API_LOGIN = process.env.IIKO_API_LOGIN;
const IIKO_ORGANIZATION_ID = process.env.IIKO_ORGANIZATION_ID;
const API_BASE_URL = 'https://api-ru.iiko.services/api/1';

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
