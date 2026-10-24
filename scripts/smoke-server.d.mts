import type { Server } from "node:http";

export function resolveInside(base: string, relative: string): string | null;

export function createSmokeServer(options: {
  distDir: string;
  modelsDir: string;
  csp: string;
}): Server;
