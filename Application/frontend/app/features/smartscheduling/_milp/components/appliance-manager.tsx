"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Download,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Choice } from "./controls";
import { CSV_COLUMNS, downloadCsv, importAppliances } from "../utils/csv";
import { useScheduler } from "../state/store";
import { addDays, validateAppliance } from "../utils/appliances";
import { HOURS, WEEKDAYS } from "../config";
import { type Appliance } from "../types";

function blank(): Appliance {
  return {
    id: "",
    name: "",
    power_kw: 0.5,
    duration_minutes: 60,
    earliest_start: "06:00",
    latest_finish: "19:00",
    preferred_start: "09:00",
    priority: 3,
    recurrence: "daily",
    weekdays: [],
    run_date: null,
    enabled: true,
  };
}
function csvRows(items: Appliance[]) {
  return [
    CSV_COLUMNS,
    ...items.map((item) => [
      item.id,
      item.name,
      item.power_kw,
      item.duration_minutes,
      item.earliest_start,
      item.latest_finish,
      item.preferred_start,
      item.priority,
      item.recurrence,
      item.weekdays.join(";"),
      item.run_date,
      item.enabled,
    ]),
  ];
}

export function ApplianceManager() {
  const store = useScheduler();
  const [form, setForm] = useState<Appliance>(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [imported, setImported] = useState<Appliance[] | null>(null);
  const upload = useRef<HTMLInputElement>(null);
  const set = <K extends keyof Appliance>(key: K, value: Appliance[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }));
  const timeOptions = HOURS.map((time) => ({ value: time, label: time }));
  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const candidate = {
      ...form,
      id: editing ?? `appliance_${crypto.randomUUID().slice(0, 8)}`,
      name: form.name.trim(),
    };
    const issue = validateAppliance(candidate);
    if (issue) {
      setError(issue);
      return;
    }
    if (!editing && store.appliances.length >= 30) {
      setError("Maximum 30 appliances.");
      return;
    }
    store.update({
      appliances: editing
        ? store.appliances.map((item) =>
            item.id === editing ? candidate : item,
          )
        : [...store.appliances, candidate],
    });
    setForm(blank());
    setEditing(null);
    setError("");
  }
  function numeric(
    key: "power_kw" | "duration_minutes",
    title: string,
    min: number,
    step: number,
  ) {
    return (
      <Field>
        <FieldLabel htmlFor={key}>{title}</FieldLabel>
        <Input
          id={key}
          type="number"
          required
          value={form[key]}
          min={min}
          step={step}
          onChange={(event) => set(key, Number(event.target.value))}
          className="h-11 rounded-xl"
        />
      </Field>
    );
  }
  return (
    <main className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs tracking-widest text-muted-foreground">
            YOUR HOME / APPLIANCES
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Give every appliance a plan.
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Set power, runtime, availability, and repeat rules. Every enabled
            job is mandatory on the dates you choose.
          </p>
        </div>
        <Button
          nativeButton={false}
          render={<Link href="/features/smartscheduling/scheduler" />}
        >
          Open scheduler <ArrowRight className="size-4" />
        </Button>
      </header>
      {store.storageError && <FieldError>{store.storageError}</FieldError>}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>
                Appliance library{" "}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {store.appliances.length} / 30
                </span>
              </CardTitle>
              <CardDescription>
                Saved in this browser. Export CSV to back up or move your list.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!store.ready ? (
                <p className="text-sm text-muted-foreground">
                  Loading your appliances…
                </p>
              ) : !store.appliances.length ? (
                <div className="rounded-2xl border border-dashed px-6 py-12 text-center">
                  <Plus className="mx-auto mb-3 size-8 text-primary/60" />
                  <h2 className="font-medium">
                    Start with your first appliance
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Use the form or import the CSV template below.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Enabled</TableHead>
                      <TableHead>Appliance</TableHead>
                      <TableHead>Runtime</TableHead>
                      <TableHead>Repeat</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {store.appliances.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <Switch
                            aria-label={`Enable ${item.name}`}
                            checked={item.enabled}
                            onCheckedChange={(checked) =>
                              store.update({
                                appliances: store.appliances.map((row) =>
                                  row.id === item.id
                                    ? { ...row, enabled: checked }
                                    : row,
                                ),
                              })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <p className="font-medium">{item.name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.power_kw} kW · {item.earliest_start}–
                            {item.latest_finish} · priority {item.priority}
                          </p>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {item.duration_minutes} min
                        </TableCell>
                        <TableCell className="text-xs">
                          {item.recurrence === "once"
                            ? item.run_date
                            : item.recurrence === "weekdays"
                              ? item.weekdays
                                  .map((day) => WEEKDAYS[day])
                                  .join(", ")
                              : "Every day"}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Edit ${item.name}`}
                              onClick={() => {
                                setForm({ ...item });
                                setEditing(item.id);
                                setError("");
                              }}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Delete ${item.name}`}
                              onClick={() => {
                                store.update({
                                  appliances: store.appliances.filter(
                                    (row) => row.id !== item.id,
                                  ),
                                });
                                if (editing === item.id) {
                                  setEditing(null);
                                  setForm(blank());
                                }
                              }}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Bring your list</CardTitle>
              <CardDescription>
                CSV import is validated before replacing your current list.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    downloadCsv(
                      "appliance-template.csv",
                      csvRows([
                        {
                          ...blank(),
                          id: "washing_machine",
                          name: "Example washing machine",
                        },
                      ]),
                    )
                  }
                >
                  <Download className="size-4" /> Template
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!store.appliances.length}
                  onClick={() =>
                    downloadCsv("my-appliances.csv", csvRows(store.appliances))
                  }
                >
                  <Download className="size-4" /> Export list
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!store.ready}
                  onClick={() => upload.current?.click()}
                >
                  <Upload className="size-4" /> Import CSV
                </Button>
              </div>
              <Input
                ref={upload}
                className="hidden"
                type="file"
                aria-label="Import appliance CSV"
                accept=".csv,text/csv"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  try {
                    if (file.size > 100000)
                      throw new Error("Maximum CSV size is 100 KB.");
                    setImported(importAppliances(await file.text()));
                    setError("");
                  } catch (error) {
                    setError(
                      error instanceof Error
                        ? error.message
                        : "Cannot read CSV.",
                    );
                    setImported(null);
                  }
                }}
              />
              {imported && (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
                  <p className="text-sm">
                    {imported.length} valid appliances ready to import.
                  </p>
                  <Button
                    type="button"
                    className="mt-3"
                    onClick={() => {
                      store.update({ appliances: imported });
                      setImported(null);
                      setEditing(null);
                      setForm(blank());
                    }}
                  >
                    Replace list with these appliances
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setImported(null)}
                  >
                    Cancel
                  </Button>
                </div>
              )}
              <p className="text-xs leading-5 text-muted-foreground">
                Weekdays use 0=Monday through 6=Sunday, separated by semicolons.
                Use recurrence daily, weekdays, or once. Power is kW, not watts.
                Template values are examples, not measured ratings.
              </p>
            </CardContent>
          </Card>
        </div>
        <Card className="lg:sticky lg:top-5">
          <CardHeader>
            <CardTitle>
              {editing ? "Edit appliance" : "Add an appliance"}
            </CardTitle>
            <CardDescription>
              Use actual device specifications or measured cycle power.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={save} className="space-y-5">
              <fieldset disabled={!store.ready} className="space-y-5">
                <Field>
                  <FieldLabel htmlFor="appliance-name">Name</FieldLabel>
                  <Input
                    id="appliance-name"
                    value={form.name}
                    required
                    maxLength={80}
                    onChange={(event) => set("name", event.target.value)}
                    className="h-11 rounded-xl"
                  />
                </Field>
                <FieldGroup className="grid grid-cols-2 gap-4">
                  {numeric("power_kw", "Power (kW)", 0.001, 0.001)}
                  {numeric("duration_minutes", "Runtime (min)", 15, 15)}
                </FieldGroup>
                {(
                  [
                    ["earliest_start", "Earliest start"],
                    ["latest_finish", "Latest finish"],
                    ["preferred_start", "Preferred start"],
                  ] as const
                ).map(([key, title]) => (
                  <Field key={key}>
                    <FieldLabel htmlFor={key}>{title}</FieldLabel>
                    <Choice
                      id={key}
                      value={form[key]}
                      options={timeOptions}
                      onChange={(value) => set(key, value)}
                    />
                  </Field>
                ))}
                <Field>
                  <FieldLabel htmlFor="priority">Priority</FieldLabel>
                  <Choice
                    id="priority"
                    value={String(form.priority)}
                    options={[1, 2, 3, 4, 5].map((value) => ({
                      value: String(value),
                      label: `${value}${value === 5 ? " · highest" : value === 1 ? " · lowest" : ""}`,
                    }))}
                    onChange={(value) => set("priority", Number(value))}
                  />
                  <FieldDescription className="text-xs">
                    Higher priority gives more weight to preserving the
                    preferred start. No enabled job can be skipped.
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="recurrence">Repeat</FieldLabel>
                  <Choice
                    id="recurrence"
                    value={form.recurrence}
                    options={[
                      { value: "daily", label: "Every day" },
                      { value: "weekdays", label: "Selected weekdays" },
                      { value: "once", label: "Once on a date" },
                    ]}
                    onChange={(value) =>
                      set("recurrence", value as Appliance["recurrence"])
                    }
                  />
                </Field>
                {form.recurrence === "weekdays" && (
                  <Field>
                    <FieldLabel>Run on</FieldLabel>
                    <div className="flex flex-wrap gap-3">
                      {WEEKDAYS.map((day, index) => (
                        <label
                          key={day}
                          className="flex items-center gap-1.5 text-xs"
                        >
                          <Checkbox
                            checked={form.weekdays.includes(index)}
                            onCheckedChange={(checked) =>
                              set(
                                "weekdays",
                                checked
                                  ? [...form.weekdays, index].sort()
                                  : form.weekdays.filter(
                                      (value) => value !== index,
                                    ),
                              )
                            }
                          />
                          {day}
                        </label>
                      ))}
                    </div>
                  </Field>
                )}
                {form.recurrence === "once" && (
                  <Field>
                    <FieldLabel htmlFor="run-date">Run date</FieldLabel>
                    <Input
                      id="run-date"
                      type="date"
                      required
                      min={store.settings.start_date}
                      max={addDays(store.settings.start_date, 13)}
                      value={form.run_date ?? ""}
                      onChange={(event) => set("run_date", event.target.value)}
                    />
                  </Field>
                )}
                {error && <FieldError>{error}</FieldError>}
                <Button type="submit" className="h-11 w-full rounded-xl">
                  {editing ? "Save changes" : "Add appliance"}
                </Button>
                {editing && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={() => {
                      setEditing(null);
                      setForm(blank());
                      setError("");
                    }}
                  >
                    Cancel edit
                  </Button>
                )}
              </fieldset>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
