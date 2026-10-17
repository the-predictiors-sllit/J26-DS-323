export type Health = {
  model_loaded: boolean;
  checkpoint_epoch: number | null;
  input_size: number | null;
  message?: string | null;
};
export type SegmentationResult = {
  filename: string;
  mask: string;
  overlay: string;
  width: number;
  height: number;
  checkpoint_epoch: number;
  input_size: number;
};
export type TestReport = {
  test_metrics: {
    miou: number;
    sky_iou: number;
    obstacle_iou: number;
    pixel_accuracy: number;
  };
  evaluation_resolution: number;
};
const API = "/features/solarsetup/api";
export async function getHealth(): Promise<Health> {
  const response = await fetch(`${API}/health`, {
    signal: AbortSignal.timeout(180000),
  });
  if (!response.ok) throw new Error("Backend status check failed.");
  return response.json();
}
export async function segmentPhoto(photo: File): Promise<SegmentationResult> {
  const data = new FormData();
  data.append("photo", photo);
  const response = await fetch(`${API}/segment`, {
    method: "POST",
    body: data,
    signal: AbortSignal.timeout(180000),
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(
      typeof body.detail === "string"
        ? body.detail
        : "Could not process the photo.",
    );
  return body;
}
export function parseTestReport(text: string): TestReport {
  const report = JSON.parse(text);
  if (
    !report?.test_metrics ||
    !["miou", "sky_iou", "obstacle_iou", "pixel_accuracy"].every(
      (key) =>
        typeof report.test_metrics[key] === "number" &&
        Number.isFinite(report.test_metrics[key]) &&
        report.test_metrics[key] >= 0 &&
        report.test_metrics[key] <= 1,
    ) ||
    !Number.isInteger(report.evaluation_resolution) ||
    report.evaluation_resolution <= 0
  ) {
    throw new Error("Choose test_metrics.json exported after evaluation.");
  }
  return report;
}
