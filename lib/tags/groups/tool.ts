// lib/tags/groups/tool.ts — чим будуємо.
import { tag } from "../types";

const t = tag("tool");

export const TOOL_TAGS = [
  // Вайбкодинг: ШІ пише код
  t("lovable", "Lovable", ["ловабл", "лавабл", "lovable.dev"]),
  t("bolt-new", "Bolt.new", ["болт нью"]),
  t("v0", "v0", ["v0.dev", "в0"]),
  t("replit", "Replit", ["репліт", "реплит", "replit agent"]),
  t("cursor", "Cursor", ["курсор", "cursor ai", "cursor ide"]),
  t("windsurf", "Windsurf", ["віндсерф", "виндсерф"]),
  t("claude-code", "Claude Code", ["клод код", "claude code cli"]),
  t("codex", "OpenAI Codex", ["кодекс"]),
  t("github-copilot", "GitHub Copilot", ["copilot", "копілот", "копилот"]),
  t("base44", "Base44", ["base 44", "бейс44"]),
  t("firebase-studio", "Firebase Studio", ["project idx"]),

  // No-code і low-code
  t("bubble", "Bubble", ["бабл", "bubble.io"]),
  t("webflow", "Webflow", ["вебфлоу", "web flow"]),
  t("tilda", "Tilda", ["тільда", "тильда"]),
  t("wix", "Wix", ["вікс", "викс"]),
  t("framer", "Framer", ["фреймер"]),
  t("flutterflow", "FlutterFlow", ["flutter flow", "флаттерфлоу"]),
  t("glide", "Glide", ["глайд", "glideapps"]),
  t("softr", "Softr", ["софтр"]),
  t("adalo", "Adalo", ["адало"]),
  t("n8n", "n8n", ["н8н", "n8n workflow"]),
  t("make-com", "Make (Integromat)", ["make.com", "інтегромат"]),
  t("zapier", "Zapier", ["запієр", "запиер"]),
  t("manychat", "ManyChat", ["менічат", "меничат", "many chat"]),
  t("sendpulse-bots", "SendPulse-чатботи", ["конструктор ботів sendpulse", "sendpulse чатбот"]),
  t("retool", "Retool", ["ретул"]),

  // CMS і платформи магазинів
  t("wordpress", "WordPress", ["вордпрес", "вордпресс", "wp", "вп сайт"]),
  t("woocommerce", "WooCommerce", ["вукомерс", "woo commerce"], { related: { wordpress: 0.7 } }),
  t("shopify", "Shopify", ["шопіфай", "шопифай"]),
  t("opencart", "OpenCart", ["опенкарт", "open cart"]),

  // Фронтенд
  t("react", "React", ["реакт", "react.js", "reactjs"]),
  t("nextjs", "Next.js", ["некст", "nextjs app", "next js"], { related: { react: 0.8 } }),
  t("vue", "Vue", ["вью", "vue.js", "vuejs"]),
  t("nuxt", "Nuxt", ["накст", "nuxt.js"], { related: { vue: 0.8 } }),
  t("angular", "Angular", ["ангуляр"]),
  t("svelte", "Svelte", ["свелт", "sveltekit"]),
  t("tailwind", "Tailwind CSS", ["тейлвінд"]),
  t("typescript", "TypeScript", ["тайпскрипт", "ts"]),
  t("javascript", "JavaScript", ["джаваскрипт", "js", "vanilla js"]),

  // Бекенд
  t("nodejs", "Node.js", ["node", "нода", "express.js", "nestjs"]),
  t("python", "Python", ["пайтон", "питон"]),
  t("django", "Django", ["джанго"], { related: { python: 0.8 } }),
  t("fastapi", "FastAPI", ["fast api", "фастапі"], { related: { python: 0.8 } }),
  t("aiogram", "aiogram / python-telegram-bot", ["айограм", "python-telegram-bot", "pytelegrambotapi", "telebot"], { related: { python: 0.7, "telegram-bot": 0.7 } }),
  t("php", "PHP", ["пхп"]),
  t("laravel", "Laravel", ["ларавел", "ларавель"], { related: { php: 0.8 } }),
  t("golang", "Go (Golang)", ["go lang"]),
  t("java", "Java / Kotlin бекенд", ["джава", "spring boot"]),
  t("dotnet", ".NET / C#", [".net", "c#", "дотнет", "asp.net"]),

  // Мобільні
  t("flutter", "Flutter", ["флаттер", "dart"]),
  t("react-native", "React Native", ["реакт нейтів", "реакт натив", "rn"], { related: { react: 0.6 } }),
  t("expo", "Expo", ["експо", "expo go"], { related: { "react-native": 0.8 } }),
  t("swift", "Swift / SwiftUI", ["swiftui", "свіфт"]),
  t("kotlin", "Kotlin / Android", ["котлін", "котлин", "jetpack compose"]),

  // Дані й хостинг
  t("supabase", "Supabase", ["супабейс", "супабаза"]),
  t("firebase", "Firebase", ["файрбейс", "фаербейс"]),
  t("postgresql", "PostgreSQL", ["postgres", "постгрес", "постгре"]),
  t("mysql", "MySQL", ["майскл", "mariadb"]),
  t("mongodb", "MongoDB", ["mongo", "монго"]),
  t("cloudflare", "Cloudflare", ["клаудфлер", "cloudflare workers"]),
  t("vercel", "Vercel", ["версель", "верцел"]),
  t("aws", "AWS", ["amazon web services", "амазон вебсервіси"]),
  t("docker", "Docker", ["докер"]),

  // Дизайн і ігри
  t("figma", "Figma", ["фігма", "фигма"]),
  t("unity", "Unity", ["юніті", "юнити"]),
  t("godot", "Godot", ["годот"]),

  // Ще інструменти
  t("chatgpt", "ChatGPT", ["чатгпт", "чат гпт", "chat gpt"]),
  t("claude-ai", "Claude (чат)", ["claude", "клод"], { related: { "claude-code": 0.6 } }),
  t("gemini-cli", "Gemini CLI / Jules", ["jules"]),
  t("trae", "Trae", ["трае"]),
  t("zed", "Zed", ["зед редактор", "zed editor"]),
  t("vite", "Vite", ["віт", "vite.js"], { related: { react: 0.4 } }),
  t("astro", "Astro", ["астро", "astro.build"]),
  t("remix", "Remix / React Router", ["react router", "ремікс"], { related: { react: 0.7 } }),
  t("strapi", "Strapi / Directus / Sanity", ["directus", "sanity", "payload cms"], { related: { "content-editor": 0.6 } }),
  t("prisma", "Prisma / Drizzle", ["drizzle", "orm"]),
  t("redis", "Redis", ["редіс", "редис", "upstash"]),
  t("netlify", "Netlify / Render / Railway", ["render.com", "railway", "fly.io"]),
  t("vps", "VPS (Hetzner, DigitalOcean)", ["hetzner", "digitalocean", "впс", "виділений сервер"], { related: { devops: 0.6 } }),
  t("gcp-azure", "Google Cloud / Azure", ["google cloud", "gcp", "azure", "азур"]),
  t("kubernetes", "Kubernetes", ["k8s", "кубернетіс", "кубер"], { related: { docker: 0.7 } }),
  t("github-actions", "GitHub Actions / CI", ["гітхаб екшенс", "ci pipeline"], { related: { devops: 0.6 } }),
  t("sentry", "Sentry", ["сентрі", "sentry.io"], { related: { monitoring: 0.8 } }),
  t("sqlite", "SQLite / D1", ["d1", "cloudflare d1", "turso"]),
  t("threejs", "Three.js / WebGL", ["three.js", "webgl", "три джс"], { related: { animations: 0.6 } }),
  t("gsap", "GSAP / Framer Motion", ["гсап", "framer motion", "motion.dev"], { related: { animations: 0.8 } }),
  t("pandas", "Pandas / Jupyter", ["jupyter", "ноутбуки python", "data science"], { related: { python: 0.6, "data-analytics": 0.6 } }),
  t("langchain", "LangChain / LlamaIndex", ["llamaindex", "ленгчейн"], { related: { rag: 0.7, "ai-agent": 0.6 } }),
  t("mcp", "MCP", ["model context protocol", "мсп сервер", "mcp сервер", "mcp server"], { related: { "ai-agent": 0.6 } }),
  t("browser-automation", "Puppeteer / Playwright", ["puppeteer", "playwright", "selenium", "браузерна автоматизація"], { related: { parser: 0.7, testing: 0.5 } }),
  t("unreal", "Unreal Engine", ["анріл", "ue5"], { related: { game: 0.7 } }),
  t("blender", "Blender", ["блендер", "3d модель", "3д модель"]),
];
