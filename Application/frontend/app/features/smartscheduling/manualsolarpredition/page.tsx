import type { Metadata } from "next";
import { connection } from "next/server";
import { SolarPredictionForm } from "./prediction-form";

export const metadata: Metadata = {
  title: "Solar prediction | SOLAI",
  description:
    "Explore solar generation with local weather and site conditions.",
};

export default async function ManualSolarPredictionPage() {
  await connection();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (name: string) =>
    parts.find((value) => value.type === name)?.value;
  const today = `${part("year")}-${part("month")}-${part("day")}`;

  return <SolarPredictionForm initialDate={today} />;
}
