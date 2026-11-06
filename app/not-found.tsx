import type { Metadata } from "next";
import Link from "next/link";
import { ProblemPage } from "@/components/problem-page";

export const metadata: Metadata = { title: "Сторінку не знайдено", robots: { index: false } };

/** Неіснуюча адреса: коротко кажемо про це й ведемо на карту. */
const NotFound = () => (
  <ProblemPage
    title="Сторінку не знайдено"
    hint="Можливо, посилання застаріло або в адресі помилка. Поверніться на карту: там усі виконавці й запити."
    action={
      <Link href="/" className="auth-primary px-5">
        На карту
      </Link>
    }
  />
);

export default NotFound;
