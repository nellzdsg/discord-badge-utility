# Discord Badge Utility

Локальное приложение для Windows, которое помогает прокачивать значки профиля Discord
**«Универсал» (Game Variety)** и **«Время в играх» (Game Time)**.

Приложение запускает собственные фоновые процессы с именами игр из официальной базы Discord.
Клиент Discord видит их через стандартный список процессов ОС — точно так же, как обычные игры.

> ⚠️ **Проект не связан с Discord Inc.** и не одобрен Discord.
> Эмуляция игровой активности нарушает ToS Discord. Используйте на свой риск.

---

## Что делает приложение

| Раздел | Назначение |
| --- | --- |
| **Универсал** | Перебирает игры из базы Discord параллельными батчами и увеличивает число разных игр в профиле. |
| **Фарм часов** | Держит до 20 выбранных игр запущенными одновременно, умножая время в играх. |
| **База игр** | Поиск и фильтрация по загруженному списку Discord, отметки уже обработанных игр. |
| **Настройки** | Размер батча, время удержания, кулдауны, история, язык интерфейса. |
| **Консоль** | Живые логи: что запущено, что упало, сколько осталось. |

---

## Чего приложение НЕ делает

Это важнее списка возможностей:

- ❌ не просит токен, пароль или QR-код;
- ❌ не читает папку Discord, `Local Storage`, cookies и кэш клиента;
- ❌ не внедряется в процессы, не патчит память, не ставит DLL и хуки;
- ❌ не модифицирует файлы клиента Discord;
- ❌ не отправляет телеметрию, аналитику и «статистику использования»;
- ❌ не содержит автообновления, которое что-то скачивает в фоне.

**Единственный сетевой запрос** — публичный список распознаваемых игр:
`https://discord.com/api/v9/applications/detectable`. Ответ кэшируется локально на 12 часов.
Офлайн-режим отключает и его: тогда используется только сохранённая база.

Все запускаемые процессы — собственные пустышки приложения. Они живут в Job Object,
поэтому гарантированно завершаются вместе с программой, а временная папка удаляется.

---

## Статус проекта

- [x] **M0** — каркас: Tauri v2 + React + Tailwind, CI, иконки
- [x] **M1** — загрузка и кэш базы игр Discord
- [x] **M2** — движок эмуляции процессов, Dashboard и консоль
- [ ] **M3** — вкладка «Фарм часов»
- [ ] **M4** — база игр, настройки, история, язык
- [ ] **M5** — дисклеймер, документация, релиз `v0.1.0`

Движок уже работает: приложение запускает собственные процессы-пустышки и управляет ими,
но часть интерфейса пока в разработке.

---

## Скачать

Готовые сборки появятся в разделе
[Releases](https://github.com/nellzdsg/discord-badge-utility/releases):

| Файл | Описание |
| --- | --- |
| `discord-badge-utility_<версия>_x64_portable.exe` | Portable: скачал и запустил, установка не нужна |
| `discord-badge-utility_<версия>_x64_setup.exe` | Установщик NSIS для текущего пользователя |
| `SHA256SUMS.txt` | Контрольные суммы файлов релиза |

Требуется Windows 10/11 x64. WebView2 уже входит в систему.

---

## Сборка из исходников

Нужны [Node.js 20+](https://nodejs.org/) и [Rust](https://rustup.rs/).

```bash
npm install
npm run icons          # генерирует src-tauri/icons из assets/app-icon.svg
npm run tauri dev      # режим разработки
npm run tauri build    # релизная сборка
```

Готовые файлы после сборки:

- `src-tauri/target/release/*.exe` — portable;
- `src-tauri/target/release/bundle/nsis/*.exe` — установщик.

### Релиз через GitHub Actions

1. Обнови `version` в `package.json`, `src-tauri/Cargo.toml` и `src-tauri/tauri.conf.json`.
2. Поставь тег и запушь:

```bash
git tag v0.1.0
git push origin v0.1.0
```

Workflow `Release` соберёт exe, посчитает SHA-256 и создаст **черновик** релиза.
Останется открыть его на GitHub и нажать «Publish release».

Workflow `CI` собирает проект на каждый пуш в `main` и складывает exe в артефакты —
удобно проверить сборку, не делая релиз.

---

## Ограничения и риски

- Результат не гарантирован: решение о значках принимает Discord, задержка обновления — до 24 часов.
- Эмуляция активности нарушает ToS Discord. Аккаунт теоретически может получить ограничение.
- Не запускайте приложение одновременно с играми, где работает античит
  (Valorant, CS2, Rust, Fortnite, Apex и т.п.).
- После большого числа игр вкладка Discord «Зарегистрированные игры» может подтормаживать —
  это локальный кэш клиента, он чистится удалением `%APPDATA%\discord\Local Storage`.

---

## Лицензия

[MIT](LICENSE). Проект написан с нуля; идейно вдохновлён открытым
[mimic-discord](https://github.com/Timon2306/mimic-discord), код не копировался.

---

## English summary

**Discord Badge Utility** is a Windows desktop app that helps grow the Discord profile badges
*Game Variety* and *Game Time* by running its own background dummy processes named after games
from Discord's public detectable-applications list.

It never asks for a token, never reads or patches the Discord client, and sends no telemetry.
The only network request is the public `applications/detectable` endpoint, which can be disabled.

Unofficial project, not affiliated with Discord Inc. Using it violates Discord's Terms of Service.
