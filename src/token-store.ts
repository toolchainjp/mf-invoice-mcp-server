/**
 * トークンファイルの読み書き。
 * リフレッシュトークンは更新のたびに新しい値が返ることがある（ローテーション）ため、
 * 最新の値をファイルに残して、サーバーを再起動しても使えるようにする。
 */
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface StoredToken {
  /** どのアプリ（クライアント ID）で発行したトークンか */
  client_id?: string;
  access_token?: string;
  refresh_token: string;
  /** アクセストークンの有効期限（UNIX ミリ秒） */
  expires_at?: number;
  scope?: string;
  updated_at?: string;
}

export interface TokenStore {
  load(): StoredToken | undefined;
  save(token: StoredToken): void;
}

export function defaultTokenFile(env: Record<string, string | undefined>, home: string): string {
  const base = env.XDG_CONFIG_HOME?.trim() || join(home, ".config");
  return join(base, "mf-invoice-mcp-server", "token.json");
}

export class FileTokenStore implements TokenStore {
  constructor(readonly path: string) {}

  load(): StoredToken | undefined {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(this.path, "utf8"));
    } catch {
      return undefined;
    }
    if (typeof parsed !== "object" || parsed === null) return undefined;
    const token = parsed as Partial<StoredToken>;
    return typeof token.refresh_token === "string" && token.refresh_token
      ? (token as StoredToken)
      : undefined;
  }

  save(token: StoredToken): void {
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    const data = `${JSON.stringify({ ...token, updated_at: new Date().toISOString() }, null, 2)}\n`;
    // 書きかけのファイルを読まれないよう、一時ファイルに書いてから置き換える
    const tmp = `${this.path}.${process.pid}.tmp`;
    writeFileSync(tmp, data, { encoding: "utf8", mode: 0o600 });
    renameSync(tmp, this.path);
    chmodSync(this.path, 0o600);
  }
}
