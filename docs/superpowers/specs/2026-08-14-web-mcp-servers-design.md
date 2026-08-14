# Архитектурный дизайн: Поддержка Web MCP серверов в Obsidian (Mobile & Desktop)

**Дата:** 2026-08-14  
**Статус:** Согласовано (Approved)  
**Область:** Поддержка Model Context Protocol (MCP) через веб-транспорты (SSE / Streamable HTTP) с авторизацией (API Token / OAuth 2.1 PKCE), управлением в UI модальном окне и поддержкой мобильных платформ (iOS / Android).

---

## 1. Введение и цели

Цель разработки — предоставить пользователю возможность подключать внешние удаленные MCP (Model Context Protocol) серверы к автономному агенту Obsidian Harness Bot с соблюдением ключевых требований:
1. **100% мобильная совместимость (Mobile-First Architecture)**: гарантированная работа на iOS, iPadOS, Android и десктопе без использования `child_process`, `stdio` или локальных бинарных зависимостей Node.js.
2. **Веб-транспорт (Web Transports Only)**: использование стандартного протокола MCP Remote Transport (Server-Sent Events + HTTP POST JSON-RPC) поверх нативных веб-API (`requestUrl`, `fetch`, `EventSource`).
3. **Безопасная и гибкая авторизация**:
   * Поддержка персональных API-токенов (Bearer Token) и произвольных заголовков (`X-API-Key`).
   * Поддержка OAuth 2.1 PKCE Flow через кастомную схему `obsidian://oh-bot-mcp-auth` для интерактивного логина в браузере.
   * Все токены и ключи доступа изолированно хранятся в `SecretManager` и не попадают в открытый `data.json`.
4. **Удобный UI-интерфейс (`McpModal`)**:
   * Отдельное модальное окно управления MCP серверами, аналогичное интерфейсу скиллов (`SkillsModal`).
   * Вкладка «Configured Servers» (статусы, переключатели вкл/выкл, тест соединения, просмотр схем инструментов, редактирование, удаление).
   * Вкладка «Catalog & Add» с предустановленным каталогом (официальный **Todoist MCP**) и формой добавления кастомного веб-сервера.
   * Быстрый вызов через `/mcp` в строке чата и Command Palette.
5. **Интеграция с Агентом и безопасность**:
   * Динамическая регистрация инструментов с префиксом `mcp__<serverId>__<toolName>` в `ToolRegistry`.
   * Мгновенная готовность к работе благодаря кэшированию схем инструментов (`tools/list`).
   * Интеграция с `SafetyMode` (в режиме `strict` мутирующие операции запрашивают подтверждение пользователя).

---

## 2. Архитектура и ограничения мобильной среды

### 2.1. Ограничения среды
* В мобильной версии Obsidian отсутствует среда Node.js и модуль `child_process`. Невозможно запустить `npx` или локальный процесс со `stdio`.
* Сетевые запросы осуществляются через API Obsidian `requestUrl` (обходит CORS) и потоковые Web API (`EventSource` / `fetch`).
* Мобильная ОС выгружает неактивные фоновые соединения при блокировке экрана или переключении приложений.

### 2.2. Стратегия подключения: Lazy Connect & Cached Schemas
* **Кэширование схем (`tools/list`)**: при добавлении сервера или нажатии кнопки «Test / Sync» список инструментов и их параметры кэшируются локально.
* **On-Demand вызов (`tools/call`)**: долговременные фоновые сокеты не удерживаются вхолостую. При вызове инструмента агентом создается сессионный запрос, выполняется метод, после чего ресурсы освобождаются.
* **Автоматический Retry и таймауты**: каждый сетевой вызов защищен таймаутом (30 секунд) и однократным авто-переподключением при обрыве сессии.

---

## 3. Модели данных и типы

### 3.1. Типы авторизации и конфигурация сервера
```typescript
export type McpAuthType = 'none' | 'bearer' | 'custom_headers' | 'oauth2';

export interface McpServerConfig {
  id: string;
  name: string;
  description?: string;
  url: string; // URL удаленного SSE/HTTP эндпоинта (например, https://ai.todoist.net/mcp)
  enabled: boolean;
  authType: McpAuthType;
  
  // Ключи в SecretManager:
  apiKeySecretName?: string;
  customHeaderName?: string; // Например, 'X-API-Key'
  
  // Параметры для OAuth 2.1 PKCE:
  oauthConfig?: {
    clientId?: string;
    authorizationUrl?: string;
    tokenUrl?: string;
    scopes?: string[];
    accessTokenSecretName: string;
    refreshTokenSecretName?: string;
    expiresAt?: number;
  };
  
  cachedTools?: ToolSchema[];
  lastConnected?: number;
  lastError?: string;
}

export interface McpCatalogItem {
  id: string;
  name: string;
  description: string;
  url: string;
  authType: McpAuthType;
  authDescription?: string;
  defaultScopes?: string[];
  docUrl?: string;
  oauthDefaults?: {
    authorizationUrl: string;
    tokenUrl: string;
    clientId?: string;
  };
}
```

### 3.2. Расширение настроек плагина (`HarnessSettings`)
```typescript
export interface HarnessSettings {
  // ... существующие настройки
  mcpServers: McpServerConfig[];
}
```

---

## 4. Подсистема авторизации

### 4.1. Режимы работы
1. **`none`**: Отсутствие заголовков авторизации.
2. **`bearer`**: Заголовок `Authorization: Bearer <token>`. Значение берется из `SecretManager`.
3. **`custom_headers`**: Заголовок `<customHeaderName>: <token>`. Значение берется из `SecretManager`.
4. **`oauth2` (OAuth 2.1 PKCE Flow)**:
   * Генерация криптографического `code_verifier` и `code_challenge` (S256 через Web Crypto API).
   * Открытие URL авторизации в браузере с параметрами `redirect_uri=obsidian://oh-bot-mcp-auth`.
   * Обработка редиректа через зарегистрированный `registerObsidianProtocolHandler('oh-bot-mcp-auth', callback)`.
   * Обмен временного `code` на `access_token` и `refresh_token` через POST на `tokenUrl`.
   * Запись токенов в `SecretManager` под ключами `oh_bot_secret_mcp_<id>_access` и `oh_bot_secret_mcp_<id>_refresh`.

---

## 5. Компоненты системы

### 5.1. `McpClient` (`src/mcp/client.ts`)
Низкоуровневый клиент для общения с удаленным MCP сервером по спецификации MCP (SSE + Streamable HTTP POST):
* `handshake()`: инициирует сессию, обрабатывает endpoint событие SSE, отправляет `initialize` и `notifications/initialized`.
* `listTools()`: отправляет JSON-RPC метод `tools/list` и парсит схемы инструментов.
* `callTool(name, args)`: отправляет JSON-RPC метод `tools/call` и возвращает результат.

### 5.2. `McpManager` (`src/mcp/mcp-manager.ts`)
Центральный менеджер жизненного цикла MCP серверов:
* Загрузка и сохранение конфигураций серверов в `settings.mcpServers`.
* Проверка соединений (`testAndSyncServer`) и обновление кэша инструментов.
* Инициация OAuth авторизации (`startOAuthFlow`) и обработка ответа (`handleOAuthCallback`).
* Предоставление активных инструментов в `ToolRegistry`.
* Экспорт встроенного каталога серверов (включая **Todoist MCP**).

### 5.3. Динамический адаптер `McpBridgeTool` (`src/tools/mcp/bridge-tool.ts`)
Реализует интерфейс `AgentTool`:
* Имя инструмента: `mcp__<serverId>__<toolName>`.
* Описание: `[<ServerName>] <Original Description>`.
* `isMutation`: эвристика определения опасных операций (содержит `create`, `delete`, `update`, `patch`, `post`, `write`, `remove`, `add`) для активации подтверждения в `SafetyMode === 'strict'`.
* Метод `execute(args, app)`: перенаправляет вызов в `McpManager.executeTool(serverId, toolName, args)`.

---

## 6. Каталог серверов: Todoist MCP

Встроенный пресет каталога:
* **ID**: `todoist`
* **Название**: `Todoist (Official Remote MCP)`
* **URL**: `https://ai.todoist.net/mcp`
* **Описание**: «Официальный облачный MCP сервер Todoist для управления задачами, проектами, комментариями и напоминаниями.»
* **Способы подключения в UI**:
  1. **Быстрый вход через OAuth**: автоматическая авторизация через браузер с возвратом в Obsidian.
  2. **Персональный API токен (Developer Token)**: прямой ввод токена из настроек Todoist (`Todoist Settings -> Integrations -> Developer -> API token`).

---

## 7. Пользовательский интерфейс (UI / UX)

### 7.1. Модальное окно `McpModal` (`src/ui/mcp-modal.ts`)
* **Вкладка "Configured Servers"**:
  * Карточки настроенных серверов с индикатором состояния:
    * `Connected (X tools)` (зеленый бейдж).
    * `Error: <текст ошибки>` (красный бейдж).
    * `Disabled` (серый бейдж).
  * Тумблер включения/выключения на карточке.
  * Кнопки действий: `Sync / Test`, `View Tools`, `Edit`, `Delete`.
* **Вкладка "Catalog & Add"**:
  * Секция каталога с карточкой Todoist и кнопками быстрой установки.
  * Секция добавления кастомного сервера: поля ввода URL, имени, типа авторизации, кнопки проверки и сохранения.

### 7.2. Модальное окно просмотра инструментов `McpToolsViewModal`
* Отображает полный список инструментов выбранного MCP сервера с подробным описанием входных аргументов, типов и обязательных полей.

### 7.3. Интеграция с чатом и палитрой команд
* Поддержка слэш-команды `/mcp` в поле ввода чата.
* Команда в палитре Obsidian: `Obsidian Harness Bot: Open MCP Servers (/mcp)`.
* В интерфейс чата отдельная кнопка не выносится, чтобы не перегружать шапку чата.

---

## 8. Мобильная адаптивность и стилизация

* CSS правила в `styles.css` с использованием flex/grid и медиа-запросов `@media (max-width: 600px)`.
* Минимальная высота кликабельных элементов — 44px (touch target guidelines).
* Поддержка безопасных отступов на экранах смартфонов.

---

## 9. План тестирования и валидации

1. **Модульные тесты**:
   * Парсинг MCP JSON-RPC сообщений и обработка SSE потока.
   * Формирование заголовков авторизации (Bearer, Custom Headers).
   * Регистрация и пространственное именование инструментов в `ToolRegistry`.
2. **Интеграционные тесты**:
   * Проверка эндпоинта `https://ai.todoist.net/mcp` (handshake, `tools/list`, кэширование).
   * Вызов инструментов агентом в цикле `AgentHarness.runTurn()`.
   * Проверка работы `SafetyMode` (запрос подтверждения перед вызовом мутирующих методов).
3. **Мобильная валидация**:
   * Корректный рендеринг модального окна на экранах с шириной 375–430px.
   * Отсутствие использования несовместимых модулей Node.js при сборке через `esbuild`.
