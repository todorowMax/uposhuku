// /api/admin/features — прапорці функцій. GET: поточні налаштування; PUT { feature, mode, users, totp }: змінити.
// Зміна грошових і крипто-прапорців потребує коду TOTP, лишає запис у журналі й лист власнику. Лише адміністратори.

import { problem, readJson } from "@/lib/api/problem";
import { FEATURE_MODES, isFeatureName, isMoneyFeature, parseFeatureUsers, type FeatureMode } from "@/lib/features/flags";
import { getAdmin } from "@/lib/server/admin";
import { checkSecondFactor, notifyFeatureChange } from "@/lib/server/admin-money";
import { listFeatureSettings, saveFeatureSetting } from "@/lib/server/features";
import { rateLimited } from "@/lib/server/rate-limit";
import { failure } from "@/lib/server/route";
import { logServer } from "@/lib/telemetry/log";

const HEADERS = { "cache-control": "private, no-store" };

export const GET = async (request: Request) => {
  try {
    if (!(await getAdmin())) return problem(404, "Не знайдено");
    return Response.json({ features: await listFeatureSettings() }, { headers: HEADERS });
  } catch (error) {
    return failure(error, request);
  }
};

export const PUT = async (request: Request) => {
  try {
    const admin = await getAdmin();
    if (!admin) return problem(404, "Не знайдено");
    const limited = await rateLimited("adminDecision", admin.id);
    if (limited) return limited;
    const body = await readJson(request);
    const feature = body?.feature;
    const mode = FEATURE_MODES.find((item): item is FeatureMode => item === body?.mode);
    if (!isFeatureName(feature) || !mode) return problem(400, "Невідома функція чи режим");
    const users = parseFeatureUsers(typeof body?.users === "string" ? body.users : "");
    if (mode === "allowlist" && users.length === 0) return problem(400, "Порожній список", "Для режиму зі списком вкажіть хоча б одну пошту.");
    if (isMoneyFeature(feature)) {
      const factor = await checkSecondFactor({ adminId: admin.id, code: body?.totp });
      if (!factor.ok) return problem(factor.status, factor.title, factor.detail);
    }
    await saveFeatureSetting({ name: feature, setting: { mode, users }, adminEmail: admin.email });
    logServer({ level: "info", event: "feature_changed", message: "Змінено прапорець функції", detail: { feature, mode, users: users.length, adminId: admin.id, adminEmail: admin.email } });
    if (isMoneyFeature(feature)) await notifyFeatureChange({ feature, mode, users: users.length, adminEmail: admin.email });
    return Response.json({ features: await listFeatureSettings() }, { headers: HEADERS });
  } catch (error) {
    return failure(error, request);
  }
};
