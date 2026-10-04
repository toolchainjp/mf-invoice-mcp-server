import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileTokenStore, defaultTokenFile } from "../../src/token-store.js";

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "mf-invoice-token-"));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("FileTokenStore", () => {
  it("保存したトークンを読み込める（ディレクトリが無ければ作る）", () => {
    const path = join(tempDir(), "nested", "dir", "token.json");
    const store = new FileTokenStore(path);
    store.save({ client_id: "c", refresh_token: "r", access_token: "a", expires_at: 123 });
    expect(store.load()).toMatchObject({
      client_id: "c",
      refresh_token: "r",
      access_token: "a",
      expires_at: 123,
    });
    expect(store.load()?.updated_at).toEqual(expect.any(String));
    expect(JSON.parse(readFileSync(path, "utf8")).refresh_token).toBe("r");
  });

  it("本人だけが読み書きできる権限（0600）で保存する", () => {
    const path = join(tempDir(), "token.json");
    new FileTokenStore(path).save({ refresh_token: "r" });
    // Windows は POSIX のパーミッションを持たないため、POSIX 環境でだけ確認する
    if (process.platform !== "win32") expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it("上書き保存できる", () => {
    const store = new FileTokenStore(join(tempDir(), "token.json"));
    store.save({ refresh_token: "r1" });
    store.save({ refresh_token: "r2" });
    expect(store.load()?.refresh_token).toBe("r2");
  });

  it("ファイルが無い・壊れている・refresh_token が無い場合は undefined", () => {
    const dir = tempDir();
    expect(new FileTokenStore(join(dir, "missing.json")).load()).toBeUndefined();
    writeFileSync(join(dir, "broken.json"), "{not json");
    expect(new FileTokenStore(join(dir, "broken.json")).load()).toBeUndefined();
    writeFileSync(join(dir, "empty.json"), JSON.stringify({ access_token: "a" }));
    expect(new FileTokenStore(join(dir, "empty.json")).load()).toBeUndefined();
  });
});

describe("defaultTokenFile", () => {
  it("XDG_CONFIG_HOME があればその下", () => {
    expect(defaultTokenFile({ XDG_CONFIG_HOME: "/xdg" }, "/home/u")).toBe(
      join("/xdg", "mf-invoice-mcp-server", "token.json"),
    );
  });

  it("無ければホームディレクトリの .config の下", () => {
    expect(defaultTokenFile({}, "/home/u")).toBe(
      join("/home/u", ".config", "mf-invoice-mcp-server", "token.json"),
    );
  });
});
