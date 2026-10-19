import type { SolarReport } from "./solar-api";

const number = (value: number | null | undefined, digits = 2) =>
  value == null || !Number.isFinite(value) ? "N/A" : value.toFixed(digits);

function printable(value: unknown) {
  return String(value)
    .replace(/°/g, " deg")
    .replace(/²/g, "2")
    .replace(/[–—−]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .replace(/[^\x20-\x7E\n]/g, " ");
}

async function imageCanvas(url: string) {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();

    element.onload = () => resolve(element);
    element.onerror = () =>
      reject(new Error("Could not load an image for the PDF."));

    element.src = url;
  });

  const scale = Math.min(
    1,
    1200 / Math.max(image.naturalWidth, image.naturalHeight),
  );

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not create the PDF image.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  return canvas;
}

export async function downloadSolarPdf(
  report: SolarReport,
  maskUrl: string,
  photoUrl?: string,
) {
  const { jsPDF } = await import("jspdf");

  const mask = await imageCanvas(maskUrl);
  const photo = photoUrl ? await imageCanvas(photoUrl) : null;

  const sun = document.createElement("canvas");
  sun.width = mask.width;
  sun.height = mask.height;

  const context = sun.getContext("2d");
  if (!context) throw new Error("Could not prepare the sun-path image.");

  context.drawImage(mask, 0, 0);
  context.save();
  context.scale(
    sun.width / report.mask_width,
    sun.height / report.mask_height,
  );

  const scale = Math.min(report.mask_width, report.mask_height);

  context.strokeStyle = "#0891b2";
  context.lineWidth = scale * 0.003;
  context.beginPath();
  context.arc(
    report.geometry.cx,
    report.geometry.cy,
    report.geometry.radius,
    0,
    Math.PI * 2,
  );
  context.stroke();

  for (const sample of report.sun_samples) {
    context.fillStyle = sample.visible ? "#16a34a" : "#ef4444";
    context.beginPath();
    context.arc(sample.x, sample.y, scale * 0.0018, 0, Math.PI * 2);
    context.fill();
  }

  context.font = `bold ${scale * 0.03}px sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineWidth = scale * 0.004;

  for (const point of report.geometry.cardinals) {
    const x = report.geometry.cx +
      (point.x - report.geometry.cx) * 0.91;
    const y = report.geometry.cy +
      (point.y - report.geometry.cy) * 0.91;

    context.strokeStyle = "#ffffff";
    context.fillStyle = "#075985";
    context.strokeText(point.label, x, y);
    context.fillText(point.label, x, y);
  }

  context.restore();

  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  pdf.setProperties({
    title: `Solar Setup — ${report.settings.year} orientation report`,
    subject: "Shading-aware solar orientation estimate",
    creator: "SOLAI Solar Setup",
  });

  const colors = {
    ink: "#19222E",
    muted: "#606B78",
    accent: "#B85A0B",
    tint: "#FFF4E7",
    surface: "#F4F6F8",
    border: "#E0E5EA",
    white: "#FFFFFF",
  };

  const left = 17;
  const width = 176;
  let y = 44;

  const generated = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: report.settings.timezone,
  }).format(new Date());

  function write(
    text: unknown,
    x: number,
    top: number,
    size = 10,
    color = colors.ink,
    bold = false,
  ) {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(size);
    pdf.setTextColor(color);
    pdf.text(printable(text), x, top);
  }

  function header(title: string) {
    pdf.setFillColor(colors.ink);
    pdf.rect(0, 0, 210, 31, "F");
    pdf.setFillColor(colors.accent);
    pdf.rect(0, 31, 210, 1.5, "F");

    write("SOLAI", left, 13, 17, colors.white, true);
    write("SOLAR SETUP", left, 22, 8, "#E9B57C", true);
    write(title, 76, 14, 13, colors.white, true);
    write(
      `${report.settings.year} analysis | ${report.settings.weather_mode.replaceAll("_", " ")}`,
      76,
      22,
      8,
      "#D3D9E1",
    );

    y = 44;
  }

  function newPage(title: string) {
    pdf.addPage();
    header(title);
  }

  function ensure(height: number) {
    if (y + height > 274) {
      newPage("Analysis details");
    }
  }

  function section(title: string, subtitle?: string) {
    ensure(subtitle ? 25 : 16);
    write(title, left, y, 14, colors.ink, true);
    y += 7;

    if (subtitle) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8.5);
      const lines = pdf.splitTextToSize(printable(subtitle), width) as string[];
      for (const line of lines) {
        write(line, left, y, 8.5, colors.muted);
        y += 4.5;
      }
    }

    y += 5;
  }

  function paragraph(text: unknown) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    const lines = pdf.splitTextToSize(printable(text), width) as string[];

    for (const line of lines) {
      ensure(5);
      write(line, left, y, 9, colors.muted);
      y += 4.8;
    }

    y += 3;
  }

  function metric(
    x: number,
    top: number,
    cardWidth: number,
    label: string,
    value: string,
    note: string,
    featured = false,
  ) {
    pdf.setFillColor(featured ? colors.tint : colors.surface);
    pdf.setDrawColor(featured ? "#E8BF94" : colors.border);
    pdf.roundedRect(x, top, cardWidth, 33, 3, 3, "FD");

    write(label, x + 5, top + 8, 8, colors.muted);
    write(
      value,
      x + 5,
      top + 20,
      cardWidth > 70 ? 23 : 16,
      featured ? colors.accent : colors.ink,
      true,
    );
    write(note, x + 5, top + 28, 7.2, colors.muted);
  }

  function table(
    headings: string[],
    rows: string[][],
    columnWidths: number[],
  ) {
    function drawRow(cells: string[], heading: boolean, index: number) {
      pdf.setFont("helvetica", heading ? "bold" : "normal");
      pdf.setFontSize(8);

      const wrapped = cells.map((cell, i) =>
        pdf.splitTextToSize(
          printable(cell),
          columnWidths[i] - 6,
        ) as string[],
      );

      const rowHeight = Math.max(
        9,
        Math.max(...wrapped.map((lines) => lines.length)) * 4 + 5,
      );

      pdf.setFillColor(
        heading
          ? colors.ink
          : index % 2 === 0
            ? colors.surface
            : colors.white,
      );
      pdf.rect(left, y, width, rowHeight, "F");

      let x = left;

      wrapped.forEach((lines, i) => {
        lines.forEach((line, lineIndex) => {
          write(
            line,
            x + 3,
            y + 5 + lineIndex * 4,
            8,
            heading ? colors.white : colors.ink,
            heading,
          );
        });

        x += columnWidths[i];
      });

      y += rowHeight;
    }

    ensure(25);
    drawRow(headings, true, 0);

    rows.forEach((row, index) => {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);

      const height = Math.max(
        9,
        Math.max(
          ...row.map((cell, i) =>
            (pdf.splitTextToSize(
              printable(cell),
              columnWidths[i] - 6,
            ) as string[]).length,
          ),
        ) * 4 + 5,
      );

      if (y + height > 274) {
        newPage("Analysis details");
        drawRow(headings, true, 0);
      }

      drawRow(row, false, index);
    });

    y += 7;
  }

  function imagePanel(
    title: string,
    canvas: HTMLCanvasElement,
    x: number,
    top: number,
    panelWidth: number,
    panelHeight: number,
  ) {
    pdf.setFillColor(colors.surface);
    pdf.setDrawColor(colors.border);
    pdf.roundedRect(x, top, panelWidth, panelHeight, 3, 3, "FD");

    write(title, x + 5, top + 8, 9, colors.ink, true);

    const availableWidth = panelWidth - 10;
    const availableHeight = panelHeight - 19;
    const ratio = Math.min(
      availableWidth / canvas.width,
      availableHeight / canvas.height,
    );
    const imageWidth = canvas.width * ratio;
    const imageHeight = canvas.height * ratio;

    pdf.addImage(
      canvas,
      "PNG",
      x + (panelWidth - imageWidth) / 2,
      top + 14 + (availableHeight - imageHeight) / 2,
      imageWidth,
      imageHeight,
    );
  }

  const normalized = ((report.selected.azimuth_deg % 360) + 360) % 360;
  const direction = [
    "North", "North-east", "East", "South-east",
    "South", "South-west", "West", "North-west",
  ][Math.round(normalized / 45) % 8];

  // PAGE 1 — Summary
  header("Your solar orientation");
  section(
    "A clearer direction for your site",
    "Recommended candidate under the selected shading, camera and weather assumptions.",
  );

  metric(
    left, y, 85, "RECOMMENDED TILT",
    `${number(report.selected.tilt_deg, 1)}°`,
    "Measured from horizontal", true,
  );
  metric(
    left + 91, y, 85, "FACING DIRECTION",
    `${number(report.selected.azimuth_deg, 1)}°`,
    `${direction} | Clockwise from true North`, true,
  );
  y += 40;

  metric(
    left, y, 56, "ANNUAL IRRADIATION",
    number(report.selected.poa_kwh_m2),
    "kWh/m2 on panel plane",
  );
  metric(
    left + 60, y, 56, "GAIN VS BASELINE",
    report.gain_percent == null
      ? "N/A"
      : `${number(report.gain_percent)}%`,
    report.gain_percent == null ? "Zero baseline" : "Same site assumptions",
  );
  metric(
    left + 120, y, 56,
    report.capacity_kwp == null ? "BASELINE" : "ESTIMATED ENERGY",
    report.capacity_kwp == null
      ? number(report.baseline.poa_kwh_m2)
      : number(report.selected.energy_kwh),
    report.capacity_kwp == null ? "kWh/m2 per year" : "kWh per year",
  );
  y += 43;

  section("Site and analysis");
  table(
    ["Detail", "Value"],
    [
      ["Coordinates", `${report.settings.latitude}, ${report.settings.longitude}`],
      ["Timezone", report.settings.timezone],
      ["Altitude", `${report.settings.altitude_m} m above sea level`],
      ["Analysis year / interval", `${report.settings.year} / ${report.settings.interval_minutes} minutes`],
      ["Weather source", report.weather_source],
      ["Selected method", report.selected_method],
      [
        "Camera geometry",
        report.settings.geometry_status === "verified"
          ? "User-declared verified"
          : "Unverified - exploratory result",
      ],
      ["Generated", `${generated} (${report.settings.timezone})`],
    ],
    [52, 124],
  );

  if (report.capacity_kwp != null) {
    paragraph(
      `Capacity: ${number(report.capacity_kwp)} kWp. Assumed performance ratio: ${number(report.settings.performance_ratio)}. Baseline energy: ${number(report.baseline.energy_kwh)} kWh/year.`,
    );
  }

  paragraph(
    "These are modelled estimates, not measured generation. Review the camera assumptions and practical mounting constraints before interpreting the recommendation.",
  );

  // PAGE 2 — Visual evidence
  newPage("Site and sun-path visuals");
  section(
    "Your site, interpreted",
    "The selected mask determines which sampled sun positions are visible or blocked.",
  );

  if (photo) {
    imagePanel("Original photograph", photo, left, y, 85, 82);
    imagePanel("Sky / obstacle mask", mask, left + 91, y, 85, 82);
  } else {
    imagePanel("Selected sky / obstacle mask", mask, 62, y, 86, 82);
  }

  y += 91;
  imagePanel("Annual sun-path preview", sun, left, y, width, 112);
  y += 120;

  paragraph(
    "Green: visible samples. Red: blocked samples. Cyan: horizon and compass directions. Preview points are thinned; calculations use all configured intervals.",
  );

  // PAGE 3 — Monthly results
  newPage("Performance across the year");
  section(
    "Monthly irradiation",
    "Selected orientation and entered baseline, using the same mask and sunlight data.",
  );

  const chartTop = y;
  const chartHeight = 43;
  const maximum = Math.max(
    1,
    ...report.monthly.flatMap((month) => [
      month.selected_poa_kwh_m2,
      month.baseline_poa_kwh_m2,
    ]),
  );

  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  pdf.setDrawColor(colors.border);
  pdf.line(left, chartTop + chartHeight, left + width, chartTop + chartHeight);

  const slot = width / 12;

  for (const month of report.monthly) {
    const x = left + (month.month - 1) * slot + 2;
    const selectedHeight =
      Math.max(0, month.selected_poa_kwh_m2 / maximum) * chartHeight;
    const baselineHeight =
      Math.max(0, month.baseline_poa_kwh_m2 / maximum) * chartHeight;

    pdf.setFillColor(colors.accent);
    pdf.rect(x, chartTop + chartHeight - selectedHeight, 4, selectedHeight, "F");

    pdf.setFillColor("#AAB4C0");
    pdf.rect(x + 5, chartTop + chartHeight - baselineHeight, 4, baselineHeight, "F");

    write(monthNames[month.month - 1], x, chartTop + chartHeight + 6, 7, colors.muted);
  }

  y += chartHeight + 15;
  write("Orange: selected orientation    Grey: baseline", left, y, 8, colors.muted);
  y += 10;

  const withEnergy = report.capacity_kwp != null;

  table(
    withEnergy
      ? ["Month", "Selected\nkWh/m2", "Baseline\nkWh/m2", "Selected\nkWh", "Baseline\nkWh"]
      : ["Month", "Selected kWh/m2", "Baseline kWh/m2"],
    report.monthly.map((month) =>
      withEnergy
        ? [
            monthNames[month.month - 1],
            number(month.selected_poa_kwh_m2),
            number(month.baseline_poa_kwh_m2),
            number(month.selected_energy_kwh),
            number(month.baseline_energy_kwh),
          ]
        : [
            monthNames[month.month - 1],
            number(month.selected_poa_kwh_m2),
            number(month.baseline_poa_kwh_m2),
          ],
    ),
    withEnergy ? [24, 38, 38, 38, 38] : [32, 72, 72],
  );

  // PAGE 4 — Methods
  newPage("Optimizer comparison");
  section(
    "Comparing the candidates",
    "Agreement between methods is an optimizer check, not validation of real electricity generation.",
  );

  table(
    ["Candidate", "Tilt °", "Azimuth °", "Annual kWh/m2"],
    [
      ["Selected", report.selected],
      ["PSO", report.pso.best],
      ["Grid", report.grid],
      ["Baseline", report.baseline],
    ].map(([label, candidate]) => {
      const value = candidate as SolarReport["selected"];
      return [
        String(label),
        number(value.tilt_deg, 1),
        number(value.azimuth_deg, 1),
        number(value.poa_kwh_m2),
      ];
    }),
    [48, 32, 36, 60],
  );

  paragraph(`Grid evaluations: ${report.grid.evaluations}`);
  paragraph(
    `PSO minus grid: ${number(report.pso_minus_grid_kwh_m2, 4)} kWh/m2.`,
  );
  paragraph(
    `DNI-weighted blocked fraction: ${number(report.dni_weighted_blocked_percent)}%. This is not electrical energy loss.`,
  );

  section("PSO runs");
  table(
    ["Seed", "Tilt °", "Azimuth °", "Annual kWh/m2"],
    report.pso.runs.map((run) => [
      String(run.seed),
      number(run.tilt_deg, 1),
      number(run.azimuth_deg, 1),
      number(run.poa_kwh_m2),
    ]),
    [32, 40, 44, 60],
  );

  if (withEnergy) {
    section("How the energy estimate is calculated");
    paragraph(
      "Annual energy = system capacity (kWp) x annual plane-of-array irradiation (kWh/m2) / reference irradiance (1 kW/m2) x assumed performance ratio.",
    );
    paragraph(
      "The selected and baseline cases use the same capacity and performance ratio. The estimate does not independently validate inverter output, outages or operational losses.",
    );
  }

  // Appendix — Settings and assumptions
  newPage("Settings and assumptions");
  section("Calculation inputs");

  table(
    ["Setting", "Value"],
    Object.entries(report.settings).map(([key, value]) => [
      key.replaceAll("_", " "),
      value == null ? "Not provided" : String(value),
    ]),
    [83, 93],
  );

  section("Interpretation notes");

  paragraph(
    report.settings.geometry_status === "verified"
      ? "Camera geometry was declared verified by the user. The application does not independently calibrate the image."
      : "Camera geometry is unverified. Treat the orientation recommendation as exploratory.",
  );

  paragraph(
    "A single capture point does not model the entire array or inter-row shading. The 7-degree reference, where used, is a project baseline rather than a universal best angle.",
  );

  for (const warning of report.warnings) {
    paragraph(`- ${warning}`);
  }

  if (report.settings.weather_mode === "historical") {
    paragraph(
      "Weather attribution: Open-Meteo / Copernicus ERA5, CC BY 4.0. https://open-meteo.com/ . Regional historical estimates are not rooftop measurements or future forecasts.",
    );
  }

  const pages = pdf.getNumberOfPages();

  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    pdf.setDrawColor(colors.border);
    pdf.line(left, 282, left + width, 282);

    write("SOLAI / SOLAR SETUP", left, 288, 7.5, colors.muted, true);
    write("Modelled estimates", 91, 288, 7.5, colors.muted);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(colors.muted);
    pdf.text(`${page} / ${pages}`, 193, 288, { align: "right" });
  }

  pdf.save(`Solar_Setup_Report_${report.settings.year}.pdf`);
}