/*
 * Файл: iiko-api.js
 * Описание: Модуль для взаимодействия с API IIKO.
 * Управляет аутентификацией, получением номенклатуры, остатков и рецептов.
 */

const axios = require('axios');

// --- 1. Конфигурация ---
const IIKO_API_LOGIN = process.env.IIKO_API_LOGIN;
const API_BASE_URL = 'https://api-ru.iiko.services/api/1';

let authToken = null;
let organizationId = null; // Будем хранить ID организации
let nomenclature = null; // Кэш номенклатуры

if (!IIKO_API_LOGIN) {
    console.error("КРИТИЧЕСКАЯ ОШИБКА: Переменная окружения IIKO_API_LOGIN должна быть установлена!");
}

// --- 2. Аутентификация и инициализация ---

/**
 * Получает токен доступа к API IIKO.
 */
async function getAuthToken() {
    try {
        const response = await axios.post(`${API_BASE_URL}/access_token`, { apiLogin: IIKO_API_LOGIN });
        console.log("Токен IIKO успешно получен.");
        authToken = response.data.token;
    } catch (error) {
        const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error("Ошибка при получении токена IIKO:", errorMessage);
        throw new Error(`Не удалось получить токен IIKO: ${errorMessage}`);
    }
}

/**
 * Получает список организаций и сохраняет ID первой.
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
        console.error("Ошибка при получении организаций:", errorMessage);
        throw new Error(`Не удалось получить организации: ${errorMessage}`);
    }
}


/**
 * Инициализирует модуль: получает токен, ID организации и номенклатуру.
 */
async function initialize() {
    await getAuthToken(); // 1. Получаем токен
    await getOrganizations(); // 2. Получаем организации
    await refreshNomenclature(); // 3. Получаем номенклатуру

    // Настраиваем периодическое обновление токена
    setInterval(getAuthToken, 55 * 60 * 1000);
}

// --- 3. Функции для работы с данными ---

/**
 * Обновляет кэш номенклатуры (товары, блюда, заготовки).
 * ИСПРАВЛЕНО: Теперь запрашивается с ID организации.
 */
async function refreshNomenclature() {
    if (!authToken || !organizationId) {
        console.error("Пропуск обновления номенклатуры: отсутствует токен или ID организации.");
        return;
    }
    try {
        const response = await axios.post(`${API_BASE_URL}/nomenclature`, 
            { organizationId: organizationId },
            { headers: { 'Authorization': `Bearer ${authToken}` } }
        );
        nomenclature = response.data;
        console.log(`Номенклатура успешно загружена: ${nomenclature.products.length} продуктов, ${nomenclature.dishes.length} блюд.`);
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
    if (!nomenclature || !nomenclature.products) return "Номенклатура еще не загружена.";
    
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
 * Получает остатки на складах.
 */
async function getStockReport() {
    if (!authToken || !organizationId) return "Ошибка: нет токена или ID организации.";
    try {
        const response = await axios.post(`${API_BASE_URL}/reports/rest_stops`, 
            { organizationIds: [organizationId] }, // API требует массив ID
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
