// Export/import demo evidence for reproducibility
import { DemoExport } from './app.d';

export function exportDemo(data: DemoExport): string {
  return JSON.stringify(data, null, 2);
}

export function importDemo(json: string): DemoExport {
  const data = JSON.parse(json);
  // Add validation as needed
  return data;
}

export const exportWarning =
  'Exported demo data may include generated private-key or attack material. Do not use with real keys.';
