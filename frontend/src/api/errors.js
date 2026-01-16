export const API_UNAVAILABLE_MESSAGE = 'Backend API недоступен. Запустите Django (docker compose up -d django-app) или проверьте прокси /api/.';

export const CREATE_PROJECT_FAILED_MESSAGE = 'Не удалось создать проект. Проверьте подключение к Backend API';

// Axios network error обычно приходит без `error.response` (например, connection refused / timeout).
export const isNetworkError = (error) => !error?.response;
