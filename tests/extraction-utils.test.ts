import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getCollisionName,
  getUniqueDestinationPath,
  isZipFile
} from "../electron/extraction-utils";

const tempRoots: string[] = [];

afterEach(async () => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      await fs.rm(root, { recursive: true, force: true });
    }
  }
});

describe("isZipFile", () => {
  it("accepts .zip extension (case-insensitive)", () => {
    expect(isZipFile("archive.zip")).toBe(true);
    expect(isZipFile("ARCHIVE.ZIP")).toBe(true);
    expect(isZipFile("archive.tar")).toBe(false);
  });
});

describe("getCollisionName", () => {
  it("adds counter before extension", () => {
    expect(getCollisionName("report.pdf", 2)).toBe("report (2).pdf");
  });
});

describe("getUniqueDestinationPath", () => {
  it("returns original name when available", async () => {
    const root = path.join(os.tmpdir(), `zip-expander-test-${Date.now()}-1`);
    tempRoots.push(root);
    await fs.mkdir(root, { recursive: true });

    const result = await getUniqueDestinationPath(root, "report.txt");
    expect(path.basename(result.filePath)).toBe("report.txt");
    expect(result.renamed).toBe(false);
  });

  it("returns renamed path when collision exists", async () => {
    const root = path.join(os.tmpdir(), `zip-expander-test-${Date.now()}-2`);
    tempRoots.push(root);
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(path.join(root, "report.txt"), "x", "utf8");

    const result = await getUniqueDestinationPath(root, "report.txt");
    expect(path.basename(result.filePath)).toBe("report (1).txt");
    expect(result.renamed).toBe(true);
  });
});

