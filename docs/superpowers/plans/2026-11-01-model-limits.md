# model-limits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Плагин BB, показывающий остатки лимитов и балансы провайдеров со всех устройств на странице и в плашке над футером.

**Architecture:** Источники (BB по каждой машине и HTTP) выдают `AccountReading[]`. Сборщик кэширует их в снимке, чистая функция `merge` строит дерево Провайдер → Аккаунт → Лимит, а RPC отдаёт его странице, плашке и CLI. Логика вынесена в чистые модули `src/`, которые тестируются без BB.

**Tech Stack:** TypeScript, `@get-bb/plugin-sdk` 0.6.79, React, Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-01-model-limits-design.md`

## Global Constraints

- Идентификатор плагина `model-limits`; `engines`: `bb >=0.47`, `bbPluginSdk >=0.6.79`.
- Ключи и тело HTTP-ответа не попадают в логи, RPC-ответы, сообщения об ошибках, снимок и CLI.
- HTTP: только `https:`, редиректы не выполняются, таймаут 10 секунд, ответ до 1 МиБ.
- Данные устарели, если старше 30 минут либо если время сброса окна прошло.
- Неизвестное значение никогда не показывается как ноль; балансы не суммируются и не входят в минимум.
- Цвет плашки: выше 30% зелёный, от 10% (не включая) до 30% включительно жёлтый, 10% и ниже красный, устаревшее и «нет данных» серые.
- Секретные поля: `deepseekApiKey`, `polzaApiKey`, `customKey1`…`customKey5`.
- Интерфейс на русском языке. Точные типы SDK сверять с `node_modules/@get-bb/plugin-sdk/bundled-types/bb-plugin-sdk.d.ts` и `bb-plugin-sdk-app.d.ts`.
- Коммиты заканчиваются строкой `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Работа идёт в ветке `feat/v1`; `git push` только в задаче 12 и только с согласия пользователя.

## Review Focus

1. Провайдер вернул `status: "ok"` и пустой список окон: показывается «лимиты не сообщаются», а не 0% и не 100%. Тест в задаче 2.
2. Аккаунт скрыт в настройках, но открыт его чат: аккаунта нет на странице и в минимуме, а плашка чата работает. Тесты в задачах 2 и 4.
3. Первый запуск, все машины вне сети или ещё нет снимка: пустое состояние, без падений и без нулей. Тесты в задачах 3 и 7.
4. Баланс ровно `"0.00"` показывается как 0, а нечисловая сумма даёт ошибку пути. Тест в задаче 5.
5. Источник удалён или выключен, а его данные остались в снимке: они исчезают при следующем сборе. Тест в задаче 7.

---

### Task 1: Каркас плагина и типы

**Files:**
- Create: каркас из `bb plugin new model-limits` в корне репозитория, без примера todos
- Create: `src/types.ts`, `src/normalize.ts`, `vitest.config.ts`
- Test: `test/normalize.test.ts`

**Interfaces:**
- Produces: типы `Limit`, `AccountReading` (как в спеке, плюс `offline: boolean`), `Device`, `KeySlot`, `KEY_SLOTS`, `HttpSource`, а также:

```ts
interface AccountNode { key: string; label: string | null; planLabel: string | null;
  devices: Device[]; status: AccountReading["status"]; message: string | null;
  offline: boolean; limits: Limit[]; fetchedAt: string }
interface ProviderNode { providerId: string; name: string; accounts: AccountNode[]; hints: string[] }
interface Overrides { hidden: string[]; names: Record<string, string> }
function toRemainingPercent(usedPercent: number): number
```

- [ ] **Step 1: Создать ветку `feat/v1`, сгенерировать каркас во временной папке и перенести файлы в корень**

Удалить код todos из `server.ts`, `app.tsx` и `skills/example-todos`. В `package.json`: `bb.name` «Model Limits», значок `Gauge`, описание из цели плана. В `.gitignore` оставить только `node_modules/`: `dist/` коммитится. Добавить `vitest` в devDependencies.

- [ ] **Step 2: Написать падающий тест `toRemainingPercent`**

```ts
expect(toRemainingPercent(28)).toBe(72);
expect(toRemainingPercent(0)).toBe(100);
expect(toRemainingPercent(130)).toBe(0);
```

- [ ] **Step 3: Запустить `npx vitest run test/normalize.test.ts`; ожидается FAIL: функция не определена**
- [ ] **Step 4: Реализовать типы и `toRemainingPercent` по `max(0, 100 - usedPercent)`**
- [ ] **Step 5: Запустить `npx vitest run` и `bb plugin build`; ожидается PASS и успешная сборка**
- [ ] **Step 6: Закоммитить: `feat: scaffold plugin and core types`**

### Task 2: Склейка показаний

**Files:**
- Create: `src/merge.ts`
- Test: `test/merge.test.ts`

**Interfaces:**
- Consumes: типы из задачи 1.
- Produces: `merge(readings: AccountReading[], overrides: Overrides): ProviderNode[]`, `accountKey(reading: AccountReading): string`.

`accountKey`: `providerId|accountIdentity`; без идентификатора `providerId|host:<hostId>` или `providerId|source:<sourceId>`.

- [ ] **Step 1: Написать падающие тесты**
  - `same accountKey on two hosts`: один аккаунт, `devices` содержит обе машины, лимиты взяты из более нового `fetchedAt`.
  - `different accountKey`: два аккаунта.
  - `kimi without identity`: две машины дают два аккаунта.
  - `unauthenticated with another account`: в `hints` строка `На server-1 не выполнен вход`, лишнего аккаунта нет.
  - `unauthenticated alone`: один аккаунт со статусом `unauthenticated` и без лимитов.
  - `not_installed`: показание отброшено.
  - `ok without limits`: аккаунт со статусом `ok` и `limits: []`, без подставленных значений.
  - `hidden`: ключ из `overrides.hidden` отсутствует в результате; скрытие провайдера записывается как `providerId`, устройства как `providerId|device:<hostId>`. Скрытое устройство убирает и подсказку о входе, и метку устройства.
  - `names`: `overrides.names[key]` заменяет `label`.
- [ ] **Step 2: Запустить `npx vitest run test/merge.test.ts`; ожидается FAIL**
- [ ] **Step 3: Реализовать `merge` и `accountKey`**
- [ ] **Step 4: Запустить тесты; ожидается PASS**
- [ ] **Step 5: Закоммитить: `feat: merge readings into provider tree`**

### Task 3: Устаревание и сводка

**Files:**
- Create: `src/summary.ts`
- Test: `test/summary.test.ts`

**Interfaces:**
- Consumes: `ProviderNode`, `Limit`.
- Produces:

```ts
const STALE_AFTER_MS = 30 * 60 * 1000;
function isStale(limit: Limit, fetchedAt: string, now: Date): boolean
interface Summary { minimum: { providerName: string; label: string; remainingPercent: number } | null;
  nextResetAt: string | null; accountCount: number; deviceCount: number }
function summarize(tree: ProviderNode[], now: Date): Summary
```

- [ ] **Step 1: Написать падающие тесты**
  - `fetchedAt` 29 минут назад не устарел, 31 минуту назад устарел; окно с прошедшим `resetsAt` устарело.
  - `minimum` пропускает балансы, устаревшие окна и аккаунты со статусом `unauthenticated`/`expired`.
  - Ошибка источника со свежими данными учитывается в минимуме.
  - Пустое дерево: `minimum: null`, `nextResetAt: null`, счётчики 0.
  - `deviceCount` считает уникальные машины, метка «сервис» не считается.
- [ ] **Step 2: Запустить `npx vitest run test/summary.test.ts`; ожидается FAIL**
- [ ] **Step 3: Реализовать `isStale` и `summarize`**
- [ ] **Step 4: Запустить тесты; ожидается PASS**
- [ ] **Step 5: Закоммитить: `feat: add staleness rules and summary`**

### Task 4: Сопоставление чата с лимитом

**Files:**
- Create: `src/thread-match.ts`
- Test: `test/thread-match.test.ts`

**Interfaces:**
- Consumes: `ProviderNode`, `isStale`.
- Produces:

```ts
interface ThreadInput { providerId: string; model: string | null; hostId: string | null }
interface PillView { model: string | null; text: string; percent: number | null;
  tone: "good" | "warn" | "bad" | "muted"; stale: boolean;
  limits: Limit[]; providerName: string | null; deviceName: string | null; fetchedAt: string | null }
function windowAppliesToModel(label: string, model: string, catalog: string[]): "model" | "other-model" | "account"
function matchThread(input: ThreadInput, tree: ProviderNode[], catalog: string[], now: Date): PillView
function idlePill(tree: ProviderNode[], now: Date): PillView
function toneFor(percent: number): "good" | "warn" | "bad"
```

`matchThread` получает полное дерево, построенное без `overrides.hidden`, поэтому скрытие не влияет на плашку открытого чата.

- [ ] **Step 1: Написать падающие тесты**
  - `claude-fable-5-1` на `vps-1`: окна «Сессия» 64, «Неделя» 72, «Fable» 41 дают `percent: 41`, `tone: "warn"`.
  - Каталог `["claude-fable-5-1","claude-opus-5-5"]`: окно «Opus» даёт `other-model` для Fable и в расчёт не входит; «Current session» даёт `account`.
  - Сегмент сравнивается целиком и без учёта регистра: окно «Fab» не относится к `claude-fable-5-1`.
  - Pi и `kimi-k3` при одном аккаунте Kimi дают Kimi; при двух дают `text: "нет данных"`.
  - Pi и `mystery-model-1`: `text: "нет данных"`, `tone: "muted"`.
  - Нет окон, есть баланс: `text: "12,40 USD"`, `percent: null`, `tone: "muted"`.
  - Устаревшие данные: `stale: true`, `tone: "muted"`, в `text` есть `⚠`.
  - Скрытый аккаунт присутствует в переданном дереве, и чат показывает его лимиты.
  - `toneFor`: 31 даёт `good`, 30 и 11 дают `warn`, 10 даёт `bad`.
  - `idlePill` на пустом дереве: `text: "нет данных"`.
- [ ] **Step 2: Запустить `npx vitest run test/thread-match.test.ts`; ожидается FAIL**
- [ ] **Step 3: Реализовать правила по разделу спека «Плашка над футером»**
- [ ] **Step 4: Запустить тесты; ожидается PASS**
- [ ] **Step 5: Закоммитить: `feat: match thread to its limits`**

### Task 5: HTTP-коннектор и пресеты

**Files:**
- Create: `src/sources/json-path.ts`, `src/sources/http.ts`, `src/sources/presets.ts`
- Test: `test/json-path.test.ts`, `test/http.test.ts`

**Interfaces:**
- Consumes: `HttpSource`, `AccountReading`, `Limit`.
- Produces:

```ts
function readPath(json: unknown, path: string): unknown[]      // бросает PathError(path)
function listFieldPaths(json: unknown): string[]              // пути без значений, до 200 штук
const httpSourceSchema: z.ZodType<HttpSource>
function parseBalance(source: HttpSource, json: unknown, now: Date): AccountReading
function fetchHttpSource(source: HttpSource, key: string | undefined,
  fetchImpl: typeof fetch, now: Date): Promise<{ reading: AccountReading; fieldPaths: string[] }>
const PRESETS: Record<"deepseek" | "polza", Omit<HttpSource, "id" | "enabled">>
```

Идентификатор HTTP-аккаунта: `<sourceId>:<organization>`. Значение `organizationPath` имеет приоритет над `organization`. `device` равен `{ service: true }`.

- [ ] **Step 1: Написать падающие тесты**
  - `balance_infos[*].total_balance` на примере DeepSeek с USD и CNY даёт два баланса с верными валютами.
  - Сумма `"0.00"` даёт `amount: 0`; `"abc"` и отсутствующее поле дают `status: "error"` с названием пути.
  - `[*]` на разных массивах в сумме и валюте даёт ошибку настройки.
  - `httpSourceSchema` отклоняет `http://`, `https://user:pw@host/` и заголовок с переводом строки.
  - `fetchHttpSource` без ключа не вызывает `fetchImpl`, сообщение: `не задан ключ polzaApiKey`.
  - Заголовок содержит `Authorization: Bearer <key>`, `redirect: "manual"`; ответ 302 даёт ошибку без перехода.
  - Ответ больше 1 МиБ и таймаут дают `status: "error"`.
  - Ответ 500 с телом `secret-body` и ключ `secret-key`: ни одна из строк не встречается в `JSON.stringify(result)`.
  - `listFieldPaths({a:{b:1},c:[{d:"x"}]})` равен `["a.b","c[*].d"]`, значения не встречаются в результате.
  - `PRESETS.deepseek`: адрес и пути из раздела спека «Пресеты»; `PRESETS.polza`: адрес `https://polza.ai/api/v2/balance`, `amountPath: "available"`, `currencyFixed: "RUB"`, поле `polzaApiKey`.
  - Ответ Polza из документации (`amount: "1234.56000000"`, `available: "1200.06000000"`) даёт один баланс `1200.06 RUB`; пустой путь суммы даёт ошибку «выберите путь к сумме» и непустые `fieldPaths`.
- [ ] **Step 2: Запустить `npx vitest run test/json-path.test.ts test/http.test.ts`; ожидается FAIL**
- [ ] **Step 3: Реализовать модули. Тело читать потоком с прерыванием на 1 МиБ, таймаут через `AbortSignal.timeout(10000)`**

Пустой путь суммы даёт `status: "error"` с сообщением «выберите путь к сумме», но `fieldPaths` всё равно возвращаются: так кнопка «Проверить» помогает настроить новый сервис.

- [ ] **Step 4: Запустить тесты; ожидается PASS**
- [ ] **Step 5: Закоммитить: `feat: add HTTP balance connector and presets`**

### Task 6: Источник BB

**Files:**
- Create: `src/sources/bb.ts`
- Test: `test/bb-source.test.ts`

**Interfaces:**
- Consumes: `AccountReading`, `toRemainingPercent`.
- Produces:

```ts
interface BbUsageDeps {
  listHosts(): Promise<{ id: string; name: string; connected: boolean }[]>;
  usageLimits(hostId: string, refresh: boolean): Promise<Record<string, unknown>>;
}
function readHost(host: { id: string; name: string }, deps: BbUsageDeps, refresh: boolean, now: Date): Promise<AccountReading[]>
```

Настоящий `BbUsageDeps` собирается в `server.ts` из `bb.sdk.hosts.list` и `bb.sdk.system.usageLimits({ hostId, refresh })`; признак подключения брать из типа `HostListResult`.

- [ ] **Step 1: Написать падающие тесты**

Ответ `{ "claude-code": { status:"ok", accountKey:"anthropic:account:1", planLabel:"Pro", windows:[{label:"Неделя",usedPercent:28,resetsAt:null}] }, "kimi-code": { status:"unauthenticated" } }` даёт два показания: Claude с `remainingPercent: 72` и `accountIdentity`, Kimi со статусом и пустыми `limits`. `planLabel`, `accountEmail` как `accountLabel` и `model` окна сохраняются, если они есть. Неизвестные поля и неполное окно не приводят к падению: окно пропускается. Отказ `usageLimits` даёт исключение, которое обрабатывает сборщик.

- [ ] **Step 2: Запустить `npx vitest run test/bb-source.test.ts`; ожидается FAIL**
- [ ] **Step 3: Реализовать `readHost`, проверяя ответ схемой Zod с `.passthrough()`**
- [ ] **Step 4: Запустить тесты; ожидается PASS**
- [ ] **Step 5: Закоммитить: `feat: read provider usage per host`**

### Task 7: Сборщик

**Files:**
- Create: `src/collector.ts`
- Test: `test/collector.test.ts`

**Interfaces:**
- Consumes: `readHost`, `fetchHttpSource`.
- Produces:

```ts
interface Snapshot { readings: AccountReading[]; updatedAt: string | null }
interface CollectorDeps { bb: BbUsageDeps; loadSources(): Promise<HttpSource[]>;
  readKey(slot: KeySlot): Promise<string | undefined>; fetchImpl: typeof fetch;
  load(): Promise<Snapshot | null>; save(s: Snapshot): Promise<void>; publish(): void; now(): Date }
class Collector { constructor(deps: CollectorDeps); collect(refresh: boolean): Promise<Snapshot>; current(): Promise<Snapshot> }
```

- [ ] **Step 1: Написать падающие тесты**
  - Отказ одного HTTP-источника не мешает другому; его прошлые лимиты и `fetchedAt` сохраняются, `status: "error"`, сообщение обновлено.
  - Машина не в сети: не опрашивается, прошлые показания сохраняются с `offline: true`.
  - Отказ `usageLimits` на подключённой машине сохраняет её прошлые показания со статусом `error`.
  - Статус `expired` от провайдера сохраняет прошлые лимиты и их `fetchedAt`, статус становится `expired`.
  - Источник удалён или выключен: его показания исчезают.
  - Два одновременных `collect` выполняют один проход.
  - Одновременно не больше 4 запросов.
  - `current()` без снимка возвращает `{ readings: [], updatedAt: null }`.
  - `collect` сохраняет снимок и вызывает `publish`.
- [ ] **Step 2: Запустить `npx vitest run test/collector.test.ts`; ожидается FAIL**
- [ ] **Step 3: Реализовать `Collector`**
- [ ] **Step 4: Запустить тесты; ожидается PASS**
- [ ] **Step 5: Закоммитить: `feat: collect and cache readings`**

### Task 8: Серверная часть

**Files:**
- Modify: `server.ts`
- Create: `src/rpc-contract.ts`, `src/cli-output.ts`, `skills/model-limits/SKILL.md`
- Test: `test/cli-output.test.ts`

**Interfaces:**
- Consumes: всё из задач 2–7.
- Produces: контракт RPC, импортируемый в `app.tsx`:

```ts
snapshot_get:  null → { tree: ProviderNode[]; summary: Summary; updatedAt: string | null }
refresh:       null → то же
thread_view:   { threadId: string | null } → PillView
pill_config:   null → { showPill: boolean; pillFallback: "minimum" | "hidden" }
sources_list:  null → { sources: HttpSource[]; presets: typeof PRESETS }
source_save:   HttpSource → { source: HttpSource }
source_delete: { id: string } → { removed: boolean }
source_test:   HttpSource → { reading: AccountReading; fieldPaths: string[] }
overrides_get: null → Overrides
overrides_set: Overrides → Overrides
discovered:    null → { tree: ProviderNode[] }   // без применения скрытия
```

Канал realtime: `snapshot-changed`. Ключи kv: `snapshot`, `sources`, `overrides`.

- [ ] **Step 1: Написать падающий тест `renderSummaryText(tree, summary)` и `renderJson(tree, summary, maxBytes)`**

Текст содержит провайдера, лимит и остаток. JSON при превышении `maxBytes` усекается и содержит `truncated: true`. Вход с полем `key: "secret"` не приводит к появлению `secret` в выводе, потому что поля выбираются явно.

- [ ] **Step 2: Запустить `npx vitest run test/cli-output.test.ts`; ожидается FAIL**
- [ ] **Step 3: Реализовать вывод CLI, контракт RPC и `server.ts`**

Настройки определить таблицей из спека (`experimental_optionLabels` для интервалов). `refreshSeconds` хранить строкой значения select и читать в каждом цикле. Сервис `bb.background.service("collector", …)` спит с пробуждением по `signal`; при значении `0` не собирает данные и перепроверяет настройку раз в 30 секунд.

`thread_view`: `bb.sdk.threads.get` даёт `providerId`, окружение чата даёт `hostId`, модель берётся из `bb.sdk.threads.events.list({ threadId, limit: "50" })` по наибольшему `seq` с `data.execution.model`. Каталог моделей читать из `bb.sdk.providers` с кэшем 10 минут; при сбое использовать пустой каталог, тогда все окна считаются окнами аккаунта. `threadId: null` или неудачное чтение дают `idlePill`. `refresh` вызывает `collect(true)`, таймер вызывает `collect(false)`.

CLI `bb model-limits [--refresh] [--json]` с `maxBytes` 64 КиБ. Скилл описывает команду и настройки.

- [ ] **Step 4: Запустить `npx vitest run` и `bb plugin build`; ожидается PASS и успешная сборка**
- [ ] **Step 5: Закоммитить: `feat: wire settings, RPC, CLI and collector service`**

### Task 9: Страница лимитов

**Files:**
- Create: `components/LimitsPage.tsx`, `components/LimitRow.tsx`, `src/format.ts`
- Modify: `app.tsx`
- Test: `test/format.test.ts`

**Interfaces:**
- Consumes: `snapshot_get`, `refresh`, `snapshot-changed`.
- Produces: `formatAmount(amount: number, currency: string): string`, `formatReset(resetsAt: string | null, now: Date): string`, `formatAge(fetchedAt: string, now: Date): string`; компонент `LimitRow`.

- [ ] **Step 1: Написать падающие тесты**

`formatAmount(12.4,"USD")` даёт `12,40 USD`, `formatAmount(0,"RUB")` даёт `0,00 ₽`, `formatAmount(3200,"RUB")` содержит `3 200` с неразрывным пробелом; неизвестная валюта выводится кодом. `formatReset(null, now)` даёт пустую строку. `formatAge` даёт `обновлено 14 мин назад`.

- [ ] **Step 2: Запустить `npx vitest run test/format.test.ts`; ожидается FAIL**
- [ ] **Step 3: Реализовать форматирование и страницу по мокапу**

`app.slots.navPanel({ id:"limits", title:"Лимиты", icon:"Gauge", path:"limits", component: LimitsPage })`. Сводка, группы провайдеров, скрытие уровня аккаунта при одном аккаунте, метки устройств, подсказки, полосы окон и суммы балансов. Пустое состояние: «Данных пока нет», кнопка «Обновить». Устаревшие окна серые с пометкой «данные устарели», `ok` без лимитов: «лимиты не сообщаются».

- [ ] **Step 4: Запустить `npx vitest run` и `bb plugin build`; ожидается PASS и успешная сборка**
- [ ] **Step 5: Закоммитить: `feat: add limits page`**

### Task 10: Плашка

**Files:**
- Create: `components/LimitsPill.tsx`
- Modify: `app.tsx`
- Test: `test/pill-position.test.ts`

**Interfaces:**
- Consumes: `thread_view`, `pill_config`, `snapshot-changed`, `useBbContext()`, `useBbNavigate()`, `PillView`.
- Produces: `app.slots.experimental_appOverlay({ id:"pill", component: LimitsPill })` (имя слота сверить с типами); `PILL_POSITION = { left: 12, bottom: 56, width: 206 }` в `src/pill-position.ts`, `shouldShowPill(config, view, threadId, viewportWidth): boolean`.

- [ ] **Step 1: Написать падающие тесты `shouldShowPill`**

`showPill: false` скрывает всегда; ширина 639 скрывает, 640 показывает; без чата и `pillFallback: "hidden"` скрывает; без чата и `"minimum"` показывает; с чатом показывает при любом `pillFallback`.

- [ ] **Step 2: Запустить `npx vitest run test/pill-position.test.ts`; ожидается FAIL**
- [ ] **Step 3: Реализовать плашку и карточку по мокапу**

Перезапрашивать `thread_view` при смене `threadId`, по `snapshot-changed` и раз в 60 секунд. Клик раскрывает карточку со строками лимитов и ссылкой `toPluginPanel("limits")`. Кнопка с `aria-expanded`, Escape закрывает карточку. Индикатор окрашивается по `tone`.

- [ ] **Step 4: Запустить `npx vitest run` и `bb plugin build`; ожидается PASS и успешная сборка**
- [ ] **Step 5: Закоммитить: `feat: add model pill above sidebar footer`**

### Task 11: Секция настроек

**Files:**
- Create: `components/SettingsSection.tsx`, `components/SourceForm.tsx`, `src/source-draft.ts`
- Modify: `app.tsx`
- Test: `test/source-draft.test.ts`

**Interfaces:**
- Consumes: `sources_list`, `source_save`, `source_delete`, `source_test`, `overrides_get`, `overrides_set`, `discovered`, `httpSourceSchema`.
- Produces: `draftFromPreset(preset, id: string): HttpSource`, `emptyDraft(id: string): HttpSource`, `validateDraft(draft: unknown): { ok: true; source: HttpSource } | { ok: false; errors: Record<string, string> }`.

- [ ] **Step 1: Написать падающие тесты**

`draftFromPreset(PRESETS.deepseek, "x")` содержит поля пресета и `enabled: true`. `emptyDraft` использует `authHeader: "Authorization"`, `authPrefix: "Bearer "`, `keySlot: "customKey1"`. `validateDraft` возвращает ошибку под полем `url` для `http://x`. Сторонний JSON с лишними полями очищается.

- [ ] **Step 2: Запустить `npx vitest run test/source-draft.test.ts`; ожидается FAIL**
- [ ] **Step 3: Реализовать секцию по мокапу через слот `settingsSection`**

Список источников со статусом, «Из пресета», «Свой сервис», форма со всеми полями из мокапа, «Проверить», «Сохранить», «Удалить». Результат проверки показывает разобранные лимиты, ошибку и список путей. Клик по пути подставляет его в поле суммы, если оно пусто. Блок «Найденные автоматически» строится из `discovered`: флажок скрывает, поле задаёт своё имя. Значения ключей не запрашиваются и не показываются.

- [ ] **Step 4: Запустить `npx vitest run` и `bb plugin build`; ожидается PASS и успешная сборка**
- [ ] **Step 5: Закоммитить: `feat: add source and visibility settings`**

### Task 12: Релиз и живая проверка

**Files:**
- Modify: `README.md`, `PLUGIN_OVERVIEW.md`, `dist/`

- [ ] **Step 1: Обновить README: назначение, установка, настройки, ограничения из спека**
- [ ] **Step 2: Запустить `npx tsc --noEmit`, `npx vitest run`, `bb plugin build`; ожидается отсутствие ошибок. Закоммитить вместе с `dist/`: `chore: prepare 0.1.0 release`**
- [ ] **Step 3: Проверить `git grep -nE "sk-[A-Za-z0-9]{8,}|Bearer [A-Za-z0-9]{12,}"`; ожидается пустой результат**
- [ ] **Step 4: Запросить согласие пользователя, затем отправить `main` с влитой `feat/v1` и установить**

Run: `git push -u origin main`, затем `bb plugin install git:https://github.com/DaSh-More/model-limits.git --yes`
Expected: `model-limits@0.1.0 running`. Если записи в GitHub нет, сообщить пользователю и остановиться.

- [ ] **Step 5: Проверить `bb model-limits --refresh --json`**

Expected: Claude с окнами и меткой `vps-1`, подсказка о входе на `server-1`, нет полей с ключами, `bb plugin logs model-limits` без ошибок.

- [ ] **Step 6: Попросить пользователя вписать ключи DeepSeek и Polza в настройках и проверить балансы**

Если ключей нет, сообщить, что эта проверка не выполнена. Если реальный ответ Polza расходится с документацией, исправить пресет, закоммитить как `fix: correct Polza preset`, пересобрать, отправить только с согласия пользователя и обновить через `bb plugin update model-limits`.

- [ ] **Step 7: Попросить пользователя проверить вид плашки и страницы; положение плашки поправить в `src/pill-position.ts`**
