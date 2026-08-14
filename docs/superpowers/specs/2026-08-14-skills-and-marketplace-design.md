# Дизайн-документ: Система скиллов и Маркетплейс для Obsidian Harness Bot

**Дата:** 2026-08-14  
**Статус:** Согласовано (Ready for Implementation Plan)  
**Область:** Поддержка стандарта `SKILL.md`, умный парсер Git-репозиториев, локальный сканер Vault с дедупликацией и разрешением симлинков, каталог `marketplace/skills.json` (с заделом под MCP), графический интерфейс управления и динамический реестр слэш-команд в чате.

---

## 1. Введение и цели

Система скиллов предоставляет агенту Obsidian Harness Bot расширяемые модули инструкций и методологий по стандарту `SKILL.md`, совместимому с экосистемами Cloud Code, OpenCode, Antigravity и Claude Code.

### Ключевые цели:
1. **Совместимость со стандартом `SKILL.md`**: поддержка YAML frontmatter (`name`, `description`, `author`, `tags`, `version`, `homepage`) и тела инструкций на Markdown.
2. **Умный резолвер ссылок GitHub / Git**: поддержка ссылок на репозитории, подпапки (`/tree/...`), прямые файлы (`/blob/...` и `raw.githubusercontent.com`), а также коротких путей `owner/repo`.
3. **Локальный сканер Vault с защитой от дубликатов**: поиск скиллов в стандартных папках (`.agents/skills/`, `.skills/`, `.claude/skills/`, `.gemini/skills/`, `skills/`), разрешение симлинков/копий через хеширование канонических путей и выбор наивысшей версии по SemVer.
4. **Каталог Marketplace в репозитории (`marketplace/`)**: хранение каталога скиллов в `marketplace/skills.json` с модульной структурой для будущего расширения каталогом MCP-серверов (`marketplace/mcp.json`).
5. **Полнофункциональный GUI**: модальное окно `SkillsModal` с вкладками «Установленные & Локальные» и «Маркетплейс & Импорт», интеграция с шапкой чата и настройками плагина.
6. **Динамический реестр слэш-команд**: автоматическое появление активных скиллов в выпадающем списке `/` внизу списка системных команд, инжекция инструкций в контекст выполнения агента при вызове `/skill-name [запрос]`.

---

## 2. Архитектура и структура компонентов

```
src/
├── skills/
│   ├── types.ts                # Интерфейсы скиллов, каталога и источников
│   ├── frontmatter.ts          # Легковесный парсер YAML frontmatter
│   ├── git-resolver.ts         # Резолвер URL GitHub (репозитории, подпапки, raw)
│   ├── vault-scanner.ts        # Сканер папок Vault с дедупликацией и симлинками
│   ├── marketplace.ts          # Загрузчик каталога marketplace/skills.json (встроенный + remote)
│   └── skill-manager.ts        # Единый фасад управления, реестр активных скиллов и инжекция
├── marketplace/
│   └── skills.json             # Исходный файл реестра скиллов в репозитории
├── ui/
│   ├── skills-modal.ts         # Модальное окно управления скиллами и маркетплейса
│   ├── chat-view.ts            # Интеграция выпадающего списка / и кнопки в шапке
│   └── settings-tab.ts         # Интеграция секции настроек скиллов
└── engine/
    └── agent.ts                # Поддержка инжекции инструкций активного скилла в системный контекст
```

---

## 3. Модели данных и форматы (`src/skills/types.ts`)

### 3.1. Структура метаданных скилла
```typescript
export type SkillSourceType = 'installed' | 'local_vault' | 'builtin';

export interface SkillMetadata {
  id: string;                  // Уникальный нормализованный идентификатор (например: 'brainstorming')
  name: string;                // Отображаемое название
  description: string;         // Краткое описание функционала
  author?: string;             // Имя или ник автора
  tags?: string[];             // Теги/категории
  version?: string;            // Версия по стандарту SemVer (например, '1.0.0')
  homepage?: string;           // Ссылка на исходный репозиторий GitHub
  sourceType: SkillSourceType; // Тип источника
  sourceUrl?: string;          // Исходный URL при установке по ссылке
  localPath?: string;          // Относительный путь к файлу в Vault (для local_vault)
  canonicalPath?: string;      // Реальный путь в файловой системе для отсечения симлинков
  enabled: boolean;            // Включен ли скилл
  content: string;             // Markdown инструкции скилла
  updatedAt: number;           // Timestamp последнего обновления
}
```

### 3.2. Манифест Маркетплейса (`marketplace/skills.json`)
```json
{
  "version": "1.0.0",
  "skills": [
    {
      "id": "brainstorming",
      "name": "Brainstorming & Design",
      "description": "Пошаговая разработка идей, архитектуры и спецификаций через диалог с агентом",
      "author": "superpowers",
      "homepage": "https://github.com/superpowers-org/skills",
      "downloadUrl": "https://raw.githubusercontent.com/superpowers-org/skills/main/skills/brainstorming/SKILL.md",
      "version": "1.0.0",
      "tags": ["planning", "design", "workflow"]
    },
    {
      "id": "pkm-researcher",
      "name": "Vault PKM Researcher",
      "description": "Глубокое исследование заметок в хранилище, синтез связей и подготовка аналитических отчетов",
      "author": "Obsidian Harness Contributors",
      "homepage": "https://github.com/killeryStark/oh-bot",
      "downloadUrl": "https://raw.githubusercontent.com/killeryStark/oh-bot/main/marketplace/skills/pkm-researcher/SKILL.md",
      "version": "1.0.0",
      "tags": ["research", "obsidian", "notes"]
    },
    {
      "id": "code-architect",
      "name": "Code & Script Architect",
      "description": "Проектирование, аудит и аккуратный рефакторинг кода и скриптов",
      "author": "Obsidian Harness Contributors",
      "homepage": "https://github.com/killeryStark/oh-bot",
      "downloadUrl": "https://raw.githubusercontent.com/killeryStark/oh-bot/main/marketplace/skills/code-architect/SKILL.md",
      "version": "1.0.0",
      "tags": ["coding", "refactoring"]
    },
    {
      "id": "daily-journal-coach",
      "name": "Daily Journal Coach",
      "description": "Анализ ежедневных заметок, структурирование задач и формулирование инсайтов",
      "author": "Obsidian Harness Contributors",
      "homepage": "https://github.com/killeryStark/oh-bot",
      "downloadUrl": "https://raw.githubusercontent.com/killeryStark/oh-bot/main/marketplace/skills/daily-journal-coach/SKILL.md",
      "version": "1.0.0",
      "tags": ["productivity", "journal", "pkm"]
    }
  ]
}
```

---

## 4. Логика движка скиллов и парсеров

### 4.1. Умный Git-резолвер (`SkillGitResolver`)
Резолвер распознает следующие паттерны:
1. `https://github.com/:owner/:repo/tree/:branch/:path...`
   - Трансформируется в загрузку: `https://raw.githubusercontent.com/:owner/:repo/:branch/:path/SKILL.md` (или прямое имя файла).
2. `https://github.com/:owner/:repo/blob/:branch/:path...`
   - Трансформируется в raw-ссылку: `https://raw.githubusercontent.com/:owner/:repo/:branch/:path`.
3. `https://github.com/:owner/:repo` (корень репозитория)
   - Последовательно проверяет:
     - `https://raw.githubusercontent.com/:owner/:repo/main/SKILL.md`
     - `https://raw.githubusercontent.com/:owner/:repo/master/SKILL.md`
     - `https://raw.githubusercontent.com/:owner/:repo/main/skills/SKILL.md`
     - `https://raw.githubusercontent.com/:owner/:repo/main/.agents/skills/SKILL.md`
4. `owner/repo` или `owner/repo/path` — преобразуется в стандартный GitHub URL.
5. Прямые HTTP/HTTPS URL на Markdown файлы.

### 4.2. Сканер локального хранилища с дедупликацией (`VaultSkillsScanner`)
* Сканирует пути внутри Vault:
  1. `.agents/skills/`
  2. `.skills/`
  3. `.claude/skills/`
  4. `.gemini/skills/`
  5. `skills/`
* Для каждого найденного файла `SKILL.md` или `*.skill.md`:
  - Вычисляет хеш содержимого и канонический путь.
  - Извлекает `id` и `version` из YAML frontmatter.
  - При обнаружении дубликата с тем же `id`:
    - Сравнивает версии по SemVer (выбирает большую версию).
    - При равных версиях отдает приоритет по иерархии папок (`.agents/skills` > `.skills` > `.claude/skills` > `.gemini/skills` > `skills`).
    - Локальные файлы Vault всегда имеют приоритет над установленными в `data.json`.

### 4.3. Парсер Frontmatter (`frontmatter.ts`)
* Извлекает блок между `---` и `---`.
* Корректно парсит поля `name`, `description`, `author`, `tags` (в виде массива строк), `version`, `homepage`.
* Если frontmatter отсутствует или поврежден: генерирует fallback-значения на основе имени папки / файла без падения приложения.

---

## 5. Интеграция с интерфейсом чата и выполнения агента

### 5.1. Реестр слэш-команд в выпадающем меню (`renderSlashSuggest`)
1. Пользователь вводит `/` в `inputTextAreaEl`.
2. Список команд формируется по порядку:
   - Системные команды: `/sessions`, `/new`, `/clear`, `/export`, `/skills`.
   - Разделитель (визуальный).
   - Список включенных скиллов: `/[id]` с бейджем и описанием.
3. При нажатии Enter или клике:
   - Если это системная команда — выполняется соответствующее действие.
   - Если это скилл — в поле подставляется префикс `/[id] ` и фокус остается в поле ввода для ввода запроса, либо (если запрос уже был введен) запрос мгновенно отправляется с примененным скиллом.

### 5.2. Инжекция контекста скилла в Agent Engine (`agent.ts`)
* Если сообщение начинается с `/[skill-id]` или активирован конкретный скилл:
  - Скилл извлекается из `SkillManager`.
  - Инструкции скилла оборачиваются в секцию:
    ```markdown
    [SYSTEM DIRECTIVE: ACTIVE SKILL "${skill.name}"]
    ${skill.content}
    [END OF ACTIVE SKILL INSTRUCTIONS]
    ```
  - Передаются в `AgentHarness.runTurn` с наивысшим приоритетом в системном промпте.
* Если скилл не указан явно:
  - В системный промпт добавляется компактный справочник доступных скиллов, позволяя агенту следовать им при необходимости.

---

## 6. Пользовательский интерфейс GUI (`SkillsModal`)

### 6.1. Элементы управления в окне
* **Шапка**: Заголовок «Skills & Marketplace», строка поиска, переключатель вкладок (`Установленные (N)` / `Маркетплейс (M)`), кнопка принудительного обновления хранилища/каталога.
* **Вкладка «Установленные & Локальные»**:
  - Карточки скиллов с метаданными, тегами, ссылками на авторов и бейджами источников.
  - Быстрый тумблер Enabled/Disabled.
  - Кнопка «Просмотр инструкций» (открывает модалку с полным текстом Markdown).
  - Кнопка «Удалить» (только для установленных скиллов).
* **Вкладка «Маркетплейс & Импорт»**:
  - Секция «Импорт по Git URL / ссылке»: ввод ссылки и кнопка «Импортировать».
  - Поиск и фильтрация по каталогу `marketplace/skills.json`.
  - Карточки скиллов маркетплейса с кнопкой «Установить» / «Удалить» в 1 клик.

### 6.2. Настройки в Settings Tab
* Переключатель «Автосканирование папок Vault для поиска скиллов».
* Поле ввода «Пользовательский URL манифеста маркетплейса».
* Кнопка «Открыть менеджер скиллов и маркетплейс».

---

## 7. Обработка ошибок и безопасность

1. **Офлайн-режим и устойчивость**: встроенный каталог `marketplace/skills.json` вшит в сборку плагина и гарантированно работает без подключения к сети.
2. **Безопасность выполнения**: скиллы представляют собой текстовые инструкции (Prompt Injection Safe Standard) и не выполняют произвольный JavaScript-код. Все файловые мутации регулируются механизмом Safety Mode (`strict` / `auto`).
3. **Обработка невалидных URL**: при некорректной ссылке или отсутствии файла `SKILL.md` выводится понятное всплывающее уведомление (Notice) с описанием ошибки.

---

## 8. План тестирования и верификации

1. **Тестирование парсера Git URL**:
   - URL репозитория (`https://github.com/owner/repo`).
   - URL папки в ветке (`https://github.com/owner/repo/tree/main/skills/brainstorming`).
   - Raw URL (`https://raw.githubusercontent.com/.../SKILL.md`).
2. **Тестирование дедупликации и симлинков**:
   - Создание идентичных скиллов в `.agents/skills` и `.skills` с разными версиями.
   - Проверка выбора наивысшей версии и отсутствия дубликатов в меню `/`.
3. **Тестирование UI**:
   - Открытие `SkillsModal` из шапки чата, из настроек и по команде `/skills`.
   - Установка и удаление скилла через Marketplace в 1 клик.
   - Импорт произвольного скилла по ссылке GitHub.
4. **Тестирование выполнения агента**:
   - Ввод `/brainstorming Мой новый проект` в чате.
   - Проверка, что инструкции скилла попадают в системный контекст и агент следует методологии скилла.
