import { HOURS } from "../config";
import type { Appliance } from "../types";

export function addDays(date: string, count: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + count * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function minute(clock: string) {
  return Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));
}
export function validateAppliance(value: Appliance): string | null {
  if (!/^[a-zA-Z0-9_-]{1,60}$/.test(value.id))
    return "Use a unique ID with letters, numbers, underscores, or hyphens.";
  if (!value.name.trim() || value.name.length > 80)
    return "Enter a name of at most 80 characters.";
  if (
    !Number.isFinite(value.power_kw) ||
    value.power_kw <= 0 ||
    value.power_kw > 100
  )
    return "Power must be greater than zero and at most 100 kW.";
  if (
    !Number.isInteger(value.duration_minutes) ||
    value.duration_minutes < 15 ||
    value.duration_minutes > 780 ||
    value.duration_minutes % 15
  )
    return "Duration must be a multiple of 15 minutes, from 15 to 780.";
  if (
    ![value.earliest_start, value.latest_finish, value.preferred_start].every(
      (time) => HOURS.includes(time),
    )
  )
    return "Use times from 06:00–19:00 in 15-minute steps.";
  if (
    minute(value.latest_finish) - minute(value.earliest_start) <
    value.duration_minutes
  )
    return "The time window must fit the full duration.";
  if (
    minute(value.preferred_start) < minute(value.earliest_start) ||
    minute(value.preferred_start) + value.duration_minutes >
      minute(value.latest_finish)
  )
    return "Preferred start must allow the job to finish before its deadline.";
  if (
    !Number.isInteger(value.priority) ||
    value.priority < 1 ||
    value.priority > 5
  )
    return "Priority must be 1–5.";
  if (!["daily", "weekdays", "once"].includes(value.recurrence))
    return "Repeat must be daily, weekdays, or once.";
  if (
    !Array.isArray(value.weekdays) ||
    value.weekdays.some(
      (day) => !Number.isInteger(day) || day < 0 || day > 6,
    ) ||
    new Set(value.weekdays).size !== value.weekdays.length
  )
    return "Weekdays must be unique numbers from 0 to 6.";
  if (value.recurrence === "weekdays" && !value.weekdays.length)
    return "Choose at least one weekday.";
  if (
    value.recurrence === "once" &&
    (!value.run_date ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value.run_date) ||
      !Number.isFinite(Date.parse(value.run_date)) ||
      new Date(`${value.run_date}T00:00:00Z`).toISOString().slice(0, 10) !==
        value.run_date)
  )
    return "Choose a valid date for a one-time job.";
  return null;
}
