# Архитектура контейнеров и схема взаимодействия

В проекте используется микросервисная архитектура, развернутая с помощью Docker Compose. Все контейнеры объединены в общую сеть `photogrametrista_net`.

## Схема взаимодействия

```mermaid
graph TD
    User([Пользователь / Браузер]) <--> Nginx[nginx:80/443]

    subgraph "Фронтенд"
        Nginx <--> Frontend[frontend:80]
    end

    subgraph "Бэкенд (Django)"
        Nginx <--> Django[django-app:8000]
        Django <--> PostGIS[(postgres-postgis:5432)]
        Django <--> Redis[(redis:6379)]
    end

    subgraph "Фоновые задачи (Celery)"
        CeleryWorker[celery-worker] <--> Redis
        CeleryWorker <--> PostGIS
        CeleryHeavy[celery-heavy] <--> Redis
        CeleryHeavy <--> PostGIS
        CeleryHeavy <--> GPU[NVIDIA GPU]
    end

    subgraph "Движок обработки (WebODM)"
        Django <--> WebODM[webodm:8000]
        CeleryHeavy <--> WebODM
        WebODM <--> WODatabase[(webodm-db:5432)]
        WebODM <--> WORedis[(webodm-broker:6379)]
        WebODM <--> WOWorker[webodm-worker]
        WOWorker <--> NodeODM[nodeodm:3000]
        WOWorker <--> WORedis
        WOWorker <--> WODatabase
    end

    subgraph "Мониторинг"
        Grafana[grafana:3000] <--> Prometheus[prometheus:9090]
        Grafana <--> Loki[loki:3100]
        Prometheus <--> Django
        Prometheus <--> PostgreExporter[postgres-exporter]
        PostgreExporter <--> PostGIS
        Promtail[promtail] <--> Loki
        Promtail -.-> DockerLogs[(Docker Logs)]
    end

    %% Внешние связи
    Django <--> YaDisk[Yandex.Disk API]
```

## Описание компонентов

### 1. Точка входа (Edge)
*   **Nginx**: Реверс-прокси. Распределяет трафик между фронтендом (статические файлы) и бэкендом (API). Также обслуживает медиа-файлы и статику.

### 2. Прикладной уровень
*   **Frontend**: React-приложение, скомпилированное и обслуживаемое через Nginx или внутренний сервер (в зависимости от режима).
*   **Django-app**: Основная логика API, аутентификация, управление проектами.

### 3. Базы данных и кэш
*   **PostgreSQL (PostGIS)**: Основное хранилище геоданных и метаданных.
*   **Redis**: Брокер сообщений для Celery и кэширование.

### 4. Распределенные вычисления
*   **Celery Worker**: Легкие задачи (импорт из облака, генерация отчетов, уведомления).
*   **Celery Heavy**: Ресурсоемкие задачи (запуск фотограмметрии, GIS-анализ). Имеет доступ к GPU для ускорения вычислений.

### 5. Интеграция с WebODM
*   **WebODM / NodeODM**: Изолированный стек для профессиональной сшивки снимков. Бэкенд Django общается с ним через API (Client-Server).

### 6. Мониторинг (Observability)
*   **Prometheus**: Сбор метрик с Django, БД и системных экспортеров.
*   **Grafana**: Визуализация метрик на дашбордах.
*   **Loki / Promtail**: Сбор и централизованное хранение логов всех контейнеров.
