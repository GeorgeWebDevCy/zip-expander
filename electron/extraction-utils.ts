import { constants, promises as fs } from "node:fs";
import path from "node:path";

export const isZipFile = (filePath: string): boolean =>
  path.extname(filePath).toLowerCase() === ".zip";

export const pathExists = async (targetPath: string): Promise<boolean> => {
  try {
    await fs.access(targetPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

export const getCollisionName = (originalName: string, index: number): string => {
  const parsed = path.parse(originalName);
  return `${parsed.name} (${index})${parsed.ext}`;
};

export const getUniqueDestinationPath = async (
  destinationRoot: string,
  originalName: string
): Promise<{ filePath: string; renamed: boolean }> => {
  let counter = 0;
  let candidateName = originalName;

  while (await pathExists(path.join(destinationRoot, candidateName))) {
    counter += 1;
    candidateName = getCollisionName(originalName, counter);
  }

  return {
    filePath: path.join(destinationRoot, candidateName),
    renamed: counter > 0
  };
};

export const toIsoSafeTimestamp = (date: Date): string =>
  date.toISOString().replace(/[:.]/g, "-");

