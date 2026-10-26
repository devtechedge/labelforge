import { zipSync } from "fflate";

import type { ReleaseManifest } from "./snapshot";

export function buildReleaseBundle(input: {
  manifest: ReleaseManifest;
  jsonl: string;
  csv: string;
}): Uint8Array {
  const encoder = new TextEncoder();
  return zipSync(
    {
      "manifest.json": encoder.encode(`${JSON.stringify(input.manifest, null, 2)}\n`),
      "dataset.jsonl": encoder.encode(input.jsonl),
      "dataset.csv": encoder.encode(input.csv),
      "README.txt": encoder.encode(
        [
          "LabelForge immutable dataset release",
          "",
          "dataset.jsonl is the canonical machine-readable export.",
          "dataset.csv is the formula-safe spreadsheet representation.",
          "manifest.json records selection policy, counts, checksums, and provenance rules.",
          "",
          "Verify dataset.jsonl with the SHA-256 checksum in manifest.json before use.",
          "",
        ].join("\n"),
      ),
    },
    { mtime: new Date("1980-01-01T00:00:00Z"), level: 6 },
  );
}
