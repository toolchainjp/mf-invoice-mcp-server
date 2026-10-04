import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { operations } from "../../src/generated/operations.js";
import { extractOperations, type OpenApiDocument } from "../../src/openapi/convert.js";

describe("src/generated/operations.ts", () => {
  it("document.yaml から生成した内容と一致する（不一致なら npm run generate を実行する）", () => {
    const spec = parse(readFileSync(new URL("../../document.yaml", import.meta.url), "utf8")) as OpenApiDocument;
    expect(operations).toEqual(extractOperations(spec));
  });

  it("docs/tools.md に全ツールが載っている（不一致なら npm run generate を実行する）", () => {
    const doc = readFileSync(new URL("../../docs/tools.md", import.meta.url), "utf8");
    for (const op of operations) expect(doc).toContain(`\`${op.toolName}\``);
  });
});
