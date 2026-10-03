import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Склеює класи й прибирає конфлікти Tailwind. Той самий `cn`, що в shadcn. */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
