// lib/tags/groups/tool.ts — чим будуємо.
import { tag } from "../types";

const t = tag("tool");

export const TOOL_TAGS = [
  // Вайбкодинг: ШІ пише код
  t("lovable", "Lovable", ["ловабл", "лавабл", "lovable.dev", "lovable app", "lovable.dev app", "зробити через lovable", "lovable prompt", "lovable project"]),
  t("bolt-new", "Bolt.new", ["болт нью", "bolt.new app", "зробити в bolt.new", "bolt.new prompt", "bolt.new project", "розробка в bolt.new"]),
  t("v0", "v0", ["v0.dev", "в0", "v0 app builder", "зробити через v0", "v0 prompt", "v0 ui", "генерація інтерфейсу v0", "Ві-Зіро", "ви-ноль"]),
  t("replit", "Replit", ["репліт", "реплит", "replit agent", "replit app", "зробити на replit", "replit workspace", "replit deployment", "replit project"]),
  t("cursor", "Cursor", ["cursor ai", "cursor ide", "cursor editor", "писати код у cursor", "cursor composer", "cursor rules", "cursor agent", "курсор"]),
  t("windsurf", "Windsurf", ["віндсерф", "виндсерф", "windsurf editor", "codeium windsurf", "windsurf cascade", "windsurf agent", "писати код у windsurf"]),
  t("claude-code", "Claude Code", ["клод код", "claude code cli", "claude code agent", "claude code terminal", "кодинг з claude", "cli claude", "claude code команда", "клодкод"]),
  t("codex", "OpenAI Codex", ["codex cli", "кодинг через codex", "codex agent", "codex terminal", "кодекс"]),
  t("github-copilot", "GitHub Copilot", ["copilot", "копілот", "копилот", "github copilot chat", "автодоповнення коду", "підказки коду", "copilot extension", "помічник програміста", "Копайлот"]),
  t("base44", "Base44", ["base 44", "бейс44", "base44 app", "зробити через base44", "base44 builder", "base44 project", "base44 prompt", "бейссорокчетыре"]),
  t("firebase-studio", "Firebase Studio", ["project idx", "firebase studio app", "firebase studio builder", "розробка у firebase studio", "idx workspace", "firebase studio prompt", "Файрбейз Студіо"]),

  // No-code і low-code
  t("bubble", "Bubble", ["bubble app builder", "зробити в bubble", "bubble no-code", "bubble workflow", "bubble database", "бабл", "bubble.io"]),
  t("webflow", "Webflow", ["вебфлоу", "web flow", "webflow designer", "зробити в webflow", "webflow cms", "webflow сайт", "webflow ecommerce"]),
  t("tilda", "Tilda", ["тільда", "тильда", "зробити на тільді", "tilda landing", "тільда блоки", "tilda zero block", "редактор tilda"]),
  t("wix", "Wix", ["вікс", "викс", "зробити на wix", "wix editor", "wix app market", "wix bookings", "wix stores"]),
  t("framer", "Framer", ["фреймер", "framer sites", "зробити у framer", "framer website", "framer cms"]),
  t("flutterflow", "FlutterFlow", ["flutter flow", "флаттерфлоу", "flutterflow app", "зробити у flutterflow", "flutterflow builder", "flutterflow firebase", "flutterflow mobile"]),
  t("glide", "Glide", ["glideapps", "glide app builder", "зробити у glide", "glide no-code", "glide таблиця", "glide mobile app", "глайд"]),
  t("softr", "Softr", ["софтр", "softr app builder", "зробити у softr", "softr portal", "softr airtable", "softr no-code", "Софтер"]),
  t("adalo", "Adalo", ["адало", "adalo app builder", "зробити в adalo", "adalo mobile app", "adalo no-code", "adalo database"]),
  t("n8n", "n8n", ["н8н", "n8n workflow", "n8n automation", "n8n workflow builder", "автоматизація через n8n", "n8n nodes", "n8n webhook", "енейтен", "ен-вісім-ен"]),
  t("make-com", "Make (Integromat)", ["make.com", "інтегромат", "make automation", "сценарій make", "автоматизація в make", "make webhook", "make scenario"]),
  t("zapier", "Zapier", ["запієр", "запиер", "zapier automation", "zapier zap", "автоматизація через zapier", "zapier webhook", "зв'язати сервіси zapier", "запир"]),
  t("manychat", "ManyChat", ["менічат", "меничат", "many chat", "manychat automation", "manychat instagram", "автовідповідач в директ", "розсилка в директ", "manychat flow"]),
  t("sendpulse-bots", "SendPulse-чатботи", ["конструктор ботів sendpulse", "sendpulse чатбот", "sendpulse chatbot builder", "бот у sendpulse", "sendpulse bot flow", "чатбот sendpulse", "сценарій бота sendpulse"]),
  t("retool", "Retool", ["ретул", "retool app", "retool dashboard", "внутрішній інтерфейс retool", "retool database", "retool workflow", "Рітул", "ритул"]),

  // CMS і платформи магазинів
  t("wordpress", "WordPress", ["вордпрес", "вордпресс", "wp", "вп сайт", "wordpress plugin", "wordpress тема", "wp cms", "wordpress адмінка", "сайт на wordpress"]),
  t("woocommerce", "WooCommerce", ["вукомерс", "woo commerce", "woocommerce магазин", "woocommerce checkout", "woocommerce orders", "woocommerce plugin", "магазин на woocommerce", "вукомуерс"], { related: { wordpress: 0.7 } }),
  t("shopify", "Shopify", ["шопіфай", "шопифай", "shopify store", "магазин на shopify", "shopify checkout", "shopify app", "shopify products"]),
  t("opencart", "OpenCart", ["опенкарт", "open cart", "магазин на opencart", "opencart модуль", "opencart checkout", "opencart адмінка", "opencart каталог"]),

  // Фронтенд
  t("react", "React", ["реакт", "react.js", "reactjs", "react component", "react hooks", "react frontend", "react приложение", "react інтерфейс"]),
  t("nextjs", "Next.js", ["некст", "nextjs app", "next js", "next.js app router", "next.js сайт", "next.js сервер", "next.js seo", "next.js deployment"], { related: { react: 0.8 } }),
  t("vue", "Vue", ["vue.js", "vuejs", "vue component", "vue frontend", "vue composition api", "vue приложение", "vue інтерфейс", "вью"]),
  t("nuxt", "Nuxt", ["накст", "nuxt.js", "nuxt app", "nuxt сайт", "nuxt server", "nuxt content", "nuxt deployment"], { related: { vue: 0.8 } }),
  t("angular", "Angular", ["ангуляр", "angular app", "angular component", "angular frontend", "angular framework", "angular проект"]),
  t("svelte", "Svelte", ["свелт", "sveltekit", "svelte app", "svelte component", "svelte frontend", "svelte store", "svelte проект"]),
  t("tailwind", "Tailwind CSS", ["тейлвінд", "tailwind classes", "tailwind компоненти", "tailwind верстка", "tailwind utilities", "стилі tailwind", "тейлвинд"]),
  t("typescript", "TypeScript", ["тайпскрипт", "typescript types", "типізація коду", "typescript проект", "ts интерфейсы", "typescript compiler", "ts"]),
  t("javascript", "JavaScript", ["джаваскрипт", "vanilla js", "javascript код", "скрипт на js", "js функция", "javascript frontend", "ванільний javascript", "js"]),

  // Бекенд
  t("nodejs", "Node.js", ["express.js", "nestjs", "node.js backend", "сервер на node", "node.js api", "npm пакет", "node.js приложение", "node", "нода"]),
  t("python", "Python", ["пайтон", "питон", "python скрипт", "код на python", "python backend", "python библиотека", "python приложение"]),
  t("django", "Django", ["джанго", "django app", "django backend", "django admin", "django rest framework", "проект django"], { related: { python: 0.8 } }),
  t("fastapi", "FastAPI", ["fast api", "фастапі", "fastapi backend", "fastapi endpoint", "fastapi сервер", "fastapi приложение", "python rest api"], { related: { python: 0.8 } }),
  t("aiogram", "aiogram / python-telegram-bot", ["айограм", "python-telegram-bot", "pytelegrambotapi", "telebot", "бот на aiogram", "aiogram бот", "telegram bot python", "бот на python", "telegram bot handler"], { related: { python: 0.7, "telegram-bot": 0.7 } }),
  t("php", "PHP", ["пхп", "php backend", "php скрипт", "код на php", "php сервер", "php проект", "ПіЕйчПі"]),
  t("laravel", "Laravel", ["ларавел", "ларавель", "laravel app", "laravel backend", "laravel api", "laravel проект", "laravel eloquent"], { related: { php: 0.8 } }),
  t("golang", "Go (Golang)", ["go lang", "golang backend", "go приложение", "код на golang", "go api server", "go проект", "Голанг"]),
  t("java", "Java / Kotlin бекенд", ["джава", "spring boot", "java backend", "spring boot api", "java приложение", "spring framework", "бэкенд на java"]),
  t("dotnet", ".NET / C#", [".net", "c#", "дотнет", "asp.net", "asp.net core", "c sharp приложение", "dotnet api", "c# backend", "проект на .net"]),

  // Мобільні
  t("flutter", "Flutter", ["флаттер", "flutter app", "мобильное приложение flutter", "flutter widgets", "dart app", "flutter разработка", "dart"]),
  t("react-native", "React Native", ["реакт нейтів", "реакт натив", "rn", "мобільна розробка", "нативний застосунок", "нативное приложение", "кросплатформна розробка", "кроссплатформенная разработка", "зробити на React Native", "приложение на React Native", "реактнейтив"], { related: { react: 0.6 } }),
  t("expo", "Expo", ["expo go", "запуск на телефоні", "тестувати на телефоні", "тестировать на телефоне", "expo sdk", "eas build", "eas submit", "expo router", "експо"], { related: { "react-native": 0.8 } }),
  t("swift", "Swift / SwiftUI", ["swiftui", "свіфт", "мова Swift", "язык Swift", "розробка під айфон", "разработка под айфон", "iOS на Swift", "SwiftUI застосунок", "SwiftUI приложение", "свифт"]),
  t("kotlin", "Kotlin / Android", ["котлін", "котлин", "jetpack compose", "мова Kotlin", "язык Kotlin", "розробка під Android", "разработка под Android", "Android на Kotlin", "Compose Multiplatform", "Kotlin Multiplatform"]),

  // Дані й хостинг
  t("supabase", "Supabase", ["супабейс", "супабаза", "supabase auth", "supabase database", "supabase storage", "база Supabase", "база супабейс", "авторизація Supabase", "бекенд на Supabase", "підʼєднати Supabase"]),
  t("firebase", "Firebase", ["файрбейс", "фаербейс", "firebase auth", "firebase hosting", "firebase functions", "firestore", "база Firestore", "авторизація Firebase", "бекенд на Firebase"]),
  t("postgresql", "PostgreSQL", ["postgres", "постгрес", "постгре", "база PostgreSQL", "база постгрес", "реляційна база", "реляционная база", "postgresql база", "pgvector", "SQL база PostgreSQL", "підʼєднати PostgreSQL"]),
  t("mysql", "MySQL", ["майскл", "mariadb", "база MySQL", "база майскл", "реляційна база MySQL", "сервер MySQL", "mysql база данных", "phpMyAdmin", "МайЭсКьюЭль", "майскьюэль"]),
  t("mongodb", "MongoDB", ["mongo", "монго", "база MongoDB", "база монго", "документна база", "колекція MongoDB", "коллекция MongoDB", "mongoose"]),
  t("cloudflare", "Cloudflare", ["клаудфлер", "cloudflare workers", "Cloudflare Pages", "Cloudflare CDN", "захист Cloudflare", "защита Cloudflare", "DNS Cloudflare", "Workers KV", "проксі Cloudflare", "Клаудфлеер"]),
  t("vercel", "Vercel", ["версель", "верцел", "Vercel deploy", "Vercel hosting", "деплой на Vercel", "деплой на версель", "Next.js hosting", "preview deployments", "vercel.json"]),
  t("aws", "AWS", ["amazon web services", "амазон вебсервіси", "Amazon S3", "AWS Lambda", "EC2 сервер", "сервер AWS", "хмара Amazon", "хмарні сервіси Amazon", "AWS account"]),
  t("docker", "Docker", ["докер", "docker compose", "dockerfile", "контейнеризація", "запакувати в контейнер", "запустить в контейнере", "Docker image"]),

  // Дизайн і ігри
  t("figma", "Figma", ["фігма", "фигма", "Figma файл", "файл Figma", "фігма макет", "фигма макет", "намалювати інтерфейс", "отрисовать интерфейс", "компоненти Figma"]),
  t("unity", "Unity", ["Unity Engine", "Unity 3D", "гра на Unity", "игра на Unity", "unity сцена", "Unity C#", "збірка гри", "Unity3D", "юніті", "юнити"]),
  t("godot", "Godot", ["годот", "Godot Engine", "гра на Godot", "игра на Godot", "GDScript", "godot сцена", "2D гра на Godot", "3D гра на Godot"]),

  // Ще інструменти
  t("chatgpt", "ChatGPT", ["чатгпт", "чат гпт", "chat gpt", "GPT-5", "запит до ChatGPT", "чат жпт", "відповідь ChatGPT", "GPT асистент", "чатджипити"]),
  t("claude-ai", "Claude (чат)", ["claude", "клод", "Claude.ai", "Claude Sonnet", "Claude Opus", "відповідь Claude", "чат Claude"], { related: { "claude-code": 0.6 } }),
  t("gemini-cli", "Gemini CLI / Jules", ["jules", "Gemini Jules", "Jules Google", "агент Jules", "запуск Jules", "Gemini в терміналі", "кодинг через Jules", "GeminiCLI"]),
  t("trae", "Trae", ["трае", "редактор Trae", "IDE Trae", "trae ide", "програмувати в Trae", "кодинг у Trae", "AI IDE Trae", "Трей"]),
  t("zed", "Zed", ["зед редактор", "zed editor", "редактор Zed", "IDE Zed", "програмувати в Zed", "кодинг у Zed", "Zed для програмування", "zed.dev", "Зед"]),
  t("vite", "Vite", ["віт", "vite.js", "vite dev server", "збірка через Vite", "запустити Vite", "vite.config", "vite build", "Vite проєкт", "vite сервер", "Вайт", "Вите"], { related: { react: 0.4 } }),
  t("astro", "Astro", ["астро", "astro.build", "Astro framework", "Astro сайт", "Astro проєкт", "astro components", "astro islands", "Astro статичний сайт"]),
  t("remix", "Remix / React Router", ["react router", "ремікс", "Remix framework", "Remix застосунок", "Remix приложение", "React Router framework", "зробити на Remix", "сайт на Remix", "remix loader", "Ремикс", "Remix.run"], { related: { react: 0.7 } }),
  t("strapi", "Strapi / Directus / Sanity", ["directus", "sanity", "payload cms", "Strapi CMS", "Directus CMS", "Sanity CMS", "безголова CMS", "адмінка Strapi", "Страпи"], { related: { "content-editor": 0.6 } }),
  t("prisma", "Prisma / Drizzle", ["drizzle", "orm", "Prisma ORM", "Drizzle ORM", "схема Prisma", "схема Drizzle", "генерувати клієнт Prisma", "міграції Prisma", "ORM для TypeScript", "Призма"]),
  t("redis", "Redis", ["редіс", "редис", "upstash", "Redis cache", "кеш Redis", "черга Redis", "Redis queue", "Redis pub sub", "Key-value сховище", "кешування в Redis", "Рэдис"]),
  t("netlify", "Netlify / Render / Railway", ["render.com", "railway", "fly.io", "Netlify deploy", "Netlify hosting", "Render hosting", "Railway hosting", "fly.io deploy", "розгорнути на Netlify", "деплой на Railway", "Нетлифай", "Render"]),
  t("vps", "VPS (Hetzner, DigitalOcean)", ["hetzner", "digitalocean", "впс", "виділений сервер", "орендувати VPS", "сервер Hetzner", "сервер DigitalOcean", "Linux сервер", "віртуальний сервер", "віртуальный сервер", "SSH доступ", "виртуалка"], { related: { devops: 0.6 } }),
  t("gcp-azure", "Google Cloud / Azure", ["google cloud", "gcp", "azure", "азур", "Google Cloud Platform", "Microsoft Azure", "Azure Functions", "Google Cloud Run", "хмарний сервер Google", "обліковий запис Azure", "розмістити в GCP"]),
  t("kubernetes", "Kubernetes", ["k8s", "кубернетіс", "кубер", "Kubernetes cluster", "кластер Kubernetes", "кластер кубера", "k8s deployment", "керування контейнерами", "оркестрація контейнерів", "kubectl", "Кубернетес"], { related: { docker: 0.7 } }),
  t("github-actions", "GitHub Actions / CI", ["гітхаб екшенс", "ci pipeline", "workflow GitHub", "GitHub Actions workflow", "CI GitHub", "автоматична збірка", "автоматическая сборка", "запуск тестів при коміті", "pipeline GitHub"], { related: { devops: 0.6 } }),
  t("sentry", "Sentry", ["сентрі", "sentry.io", "відстеження помилок", "отслеживание ошибок", "збирати помилки застосунку", "збір винятків", "sentry SDK", "лог помилок frontend", "crashlytics"], { related: { monitoring: 0.8 } }),
  t("sqlite", "SQLite / D1", ["d1", "cloudflare d1", "turso", "SQLite база", "база SQLite", "sqlite database", "SQLite файл", "база в одному файлі", "локальна база даних SQLite", "D1 база даних", "SQLite3", "эскайлайт"]),
  t("threejs", "Three.js / WebGL", ["three.js", "webgl", "три джс", "Three.js сцена", "3D у браузері", "тривимірна графіка", "трехмерная графика", "WebGL сцена", "3D сайт", "three js animation", "триджейэс"], { related: { animations: 0.6 } }),
  t("gsap", "GSAP / Framer Motion", ["гсап", "framer motion", "motion.dev", "GSAP анімація", "анімації GSAP", "анимация GSAP", "анімація інтерфейсу", "scroll-анімація", "анімація при прокрутці", "плавні переходи на сайті", "GreenSock", "Гринсок"], { related: { animations: 0.8 } }),
  t("pandas", "Pandas / Jupyter", ["jupyter", "ноутбуки python", "data science", "обробка таблиць Python", "аналіз даних Python", "таблиці DataFrame", "аналіз CSV", "аналіз датафреймів", "обробити Excel у Python", "pandas dataframe", "пандас", "DataFrame"], { related: { python: 0.6, "data-analytics": 0.6 } }),
  t("langchain", "LangChain / LlamaIndex", ["llamaindex", "ленгчейн", "LangChain агенти", "ланчейн", "лангчейн", "ланцюжок LLM", "RAG pipeline", "ланцюги промптів", "LlamaIndex індекс"], { related: { rag: 0.7, "ai-agent": 0.6 } }),
  t("mcp", "MCP", ["model context protocol", "мсп сервер", "mcp сервер", "mcp server", "MCP протокол", "MCP tool", "підключити MCP", "MCP інструменти", "MCP клієнт", "сервер протоколу контексту", "модельний контекст", "модельный контекст"], { related: { "ai-agent": 0.6 } }),
  t("browser-automation", "Puppeteer / Playwright", ["puppeteer", "playwright", "selenium", "браузерна автоматизація", "автоматизувати браузер", "автоматизировать браузер", "керування браузером кодом", "управление браузером кодом", "скрейпінг через браузер", "запустити headless браузер", "клікати на сайті автоматично"], { related: { parser: 0.7, testing: 0.5 } }),
  t("unreal", "Unreal Engine", ["анріл", "ue5", "Unreal Engine 5", "Unreal Engine 4", "гра на Unreal", "игра на Unreal", "Blueprints", "Unreal C++", "розробка гри на Unreal", "Анрил"], { related: { game: 0.7 } }),
  t("blender", "Blender", ["блендер", "3d модель", "3д модель", "Blender 3D", "моделювання в Blender", "моделирование в Blender", "рендер у Blender", "рендер в Blender", "зробити 3D модель", "створити low poly"]),

  // Типи застосунків і систем, яких бракувало (рев'ю TookenClub, 30.09.2026)
  t("vector-database", "Векторна база даних", ["векторна бд", "векторне сховище", "pinecone", "qdrant", "chroma db", "weaviate", "векторный поиск", "векторні ембеддинги", "векторные эмбеддинги", "зберігати embeddings", "nearest neighbor search", "ChromaDB"]),
  t("ollama", "Ollama", ["оллама", "локальна llm", "запустити модель локально", "модель ші на своєму комп'ютері", "ollama api", "локальний штучний інтелект", "Ollama models", "ollama run", "запустити Llama локально", "локальна мовна модель", "локальная языковая модель", "LLM без хмари", "модель без інтернету"]),
  t("langfuse", "Langfuse", ["лангфьюз", "langfuse tracing", "логування запитів до llm", "моніторинг llm", "оцінювання відповідей ші", "спостережуваність ai", "Langfuse traces", "Langfuse evaluations", "трейси LLM", "трейсинг LLM", "оцінка LLM відповідей", "LLM observability", "відстеження промптів"]),
];
