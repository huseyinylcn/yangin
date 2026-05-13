import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Birden fazla package-lock olduğunda üst dizin yanlış kök seçilmesin
  outputFileTracingRoot: projectRoot,
};

export default nextConfig;
