import { pageLinkClass } from "@/components/site-page/site-shell";
import type { PublicProfile } from "@/lib/profile/public";

export namespace ProfilePageWorksTypes {
  export type Props = Pick<PublicProfile, "works">;
}

/** Роботи портфоліо списком: назва, опис, посилання на живий проєкт. Без мініатюр: скриншотів у даних немає. */
export const ProfilePageWorks = ({ works }: ProfilePageWorksTypes.Props) => {
  if (works.length === 0) return null;
  return (
    <section aria-labelledby="pp-works" className="grid gap-3">
      <h2 id="pp-works" className="text-xl font-semibold text-ink">
        Роботи
      </h2>
      <ul className="grid gap-3">
        {works.map((work) => (
          <li key={work.id} className="grid gap-1 rounded-xl border border-line p-4">
            <h3 className="text-base font-semibold text-ink break-words">{work.title}</h3>
            {work.description && <p className="whitespace-pre-line text-sm leading-relaxed text-ink break-words">{work.description}</p>}
            {work.url && /^https?:\/\//i.test(work.url) && (
              <a href={work.url} rel="nofollow noopener noreferrer" className={`w-fit text-sm break-all ${pageLinkClass}`}>
                {work.url}
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};
