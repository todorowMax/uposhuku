// /admin/features: прапорці функцій. Режим (вимкнено, за списком, всім) і список пошт для кожної. Зміна грошових і
// крипто-прапорців потребує коду TOTP.

import { notFound } from "next/navigation";
import { FeatureForm } from "@/components/admin/feature-form";
import { FEATURE_LABEL, isMoneyFeature } from "@/lib/features/flags";
import { getAdmin } from "@/lib/server/admin";
import { listFeatureSettings } from "@/lib/server/features";

const SOURCE = { db: "задано в адмінці", env: "зі змінної середовища", default: "типово" } as const;

export default async function AdminFeaturesPage() {
  if (!(await getAdmin())) notFound();
  const features = await listFeatureSettings();
  return (
    <>
      <h1 className="adm-title">Функції</h1>
      <ul className="adm-list">
        {features.map((item) => (
          <li key={item.name} className="adm-item">
            <div className="adm-item-head">
              <span className="adm-item-title">{FEATURE_LABEL[item.name]}</span>
              <span className="deal-chip" data-tone={item.setting.mode === "off" ? "todo" : "done"}>
                {item.name}
              </span>
            </div>
            <p className="adm-item-meta">Значення {SOURCE[item.source]}</p>
            <FeatureForm feature={item.name} mode={item.setting.mode} users={item.setting.users.join("\n")} needsCode={isMoneyFeature(item.name)} />
          </li>
        ))}
      </ul>
    </>
  );
}
