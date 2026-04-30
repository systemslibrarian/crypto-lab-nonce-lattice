// Types for export/import demo evidence
export interface DemoExport {
  curve: string;
  mode: string;
  publicKey: string;
  signatures: any[];
  messageHashes: string[];
  leakMetadata: any;
  latticeParams: any;
  recoveryDiagnostics: string;
  presetName: string;
  fixtureSeed?: string;
}
