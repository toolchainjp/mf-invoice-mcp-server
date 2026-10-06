# ツール一覧

> このファイルは `npm run generate` が `document.yaml` から生成しています。直接編集しないでください。

仕様書: Money Forward Invoice API v3.6.0。全 45 ツール（参照系 16、書き込み系 29）。`MF_READ_ONLY=true` のときは参照系だけが、`MF_EXCLUDE_TOOLS` に書いたツールは除いて公開されます。

| ツール名                                    | 種別 | 概要                                       | HTTP                                                        | 必須引数                      |
| ------------------------------------------- | ---- | ------------------------------------------ | ----------------------------------------------------------- | ----------------------------- |
| `get_office`                                | 参照 | 事業者情報の取得                           | `GET /office`                                               | —                             |
| `put_office`                                | 更新 | 事業者情報の更新                           | `PUT /office`                                               | —                             |
| `put_office_registration_code`              | 更新 | 適格請求書発行事業者番号の作成・更新       | `PUT /office/registration_code`                             | `body`                        |
| `delete_office_registration_code`           | 削除 | 適格請求書発行事業者番号の削除             | `DELETE /office/registration_code`                          | —                             |
| `get_partners`                              | 参照 | 取引先一覧の取得                           | `GET /partners`                                             | —                             |
| `post_partners`                             | 登録 | 取引先の作成                               | `POST /partners`                                            | `body`                        |
| `get_partners_id`                           | 参照 | 取引先の取得                               | `GET /partners/{partner_id}`                                | `partner_id`                  |
| `put_partners_id`                           | 更新 | 取引先の更新                               | `PUT /partners/{partner_id}`                                | `partner_id`                  |
| `delete_partners_id`                        | 削除 | 取引先の削除                               | `DELETE /partners/{partner_id}`                             | `partner_id`                  |
| `get_partners_id_partner_departments`       | 参照 | 取引先部署一覧の取得                       | `GET /partners/{partner_id}/departments`                    | `partner_id`                  |
| `post_partners_id_departments`              | 登録 | 取引先部署の作成                           | `POST /partners/{partner_id}/departments`                   | `partner_id`                  |
| `get_partners_partner_id_departments_id`    | 参照 | 取引先部署の取得                           | `GET /partners/{partner_id}/departments/{department_id}`    | `partner_id`, `department_id` |
| `put_partners_partner_id_departments_id`    | 更新 | 取引先部署の更新                           | `PUT /partners/{partner_id}/departments/{department_id}`    | `partner_id`, `department_id` |
| `delete_partners_partner_id_departments_id` | 削除 | 取引先部署の削除                           | `DELETE /partners/{partner_id}/departments/{department_id}` | `partner_id`, `department_id` |
| `get_items`                                 | 参照 | 品目一覧の取得                             | `GET /items`                                                | —                             |
| `post_items`                                | 登録 | 品目の作成                                 | `POST /items`                                               | `body`                        |
| `get_items_id`                              | 参照 | 品目の取得                                 | `GET /items/{item_id}`                                      | `item_id`                     |
| `put_items_id`                              | 更新 | 品目の更新                                 | `PUT /items/{item_id}`                                      | `item_id`                     |
| `delete_items_id`                           | 削除 | 品目の削除                                 | `DELETE /items/{item_id}`                                   | `item_id`                     |
| `get_billings`                              | 参照 | 請求書の取得                               | `GET /billings`                                             | —                             |
| `post_invoice_template_billings`            | 登録 | インボイス制度に対応した形式の請求書の作成 | `POST /invoice_template_billings`                           | `body`                        |
| `get_billings_id`                           | 参照 | 請求書の取得                               | `GET /billings/{billing_id}`                                | `billing_id`                  |
| `put_billings_id`                           | 更新 | 請求書の更新                               | `PUT /billings/{billing_id}`                                | `billing_id`                  |
| `delete_billings_id`                        | 削除 | 請求書の削除                               | `DELETE /billings/{billing_id}`                             | `billing_id`                  |
| `get_billings_id_items`                     | 参照 | 請求書に紐づく品目一覧の取得               | `GET /billings/{billing_id}/items`                          | `billing_id`                  |
| `post_billings_id_items`                    | 登録 | 請求書に品目を追加                         | `POST /billings/{billing_id}/items`                         | `billing_id`                  |
| `get_billings_billing_id_items_id`          | 参照 | 請求書に紐づく品目の取得                   | `GET /billings/{billing_id}/items/{item_id}`                | `billing_id`, `item_id`       |
| `delete_billings_billing_id_items_id`       | 削除 | 請求書に紐づく品目の削除                   | `DELETE /billings/{billing_id}/items/{item_id}`             | `billing_id`, `item_id`       |
| `put_billings_billing_id_payment_status`    | 更新 | 請求書の入金ステータス変更                 | `PUT /billings/{billing_id}/payment_status`                 | `billing_id`, `body`          |
| `post_billings_billing_id_posting`          | 登録 | 請求書の郵送依頼（料金が発生する場合あり） | `POST /billings/{billing_id}/posting`                       | `billing_id`                  |
| `delete_billings_billing_id_posting`        | 削除 | 請求書の郵送キャンセル                     | `DELETE /billings/{billing_id}/posting`                     | `billing_id`                  |
| `get_quotes`                                | 参照 | 見積書一覧の取得                           | `GET /quotes`                                               | —                             |
| `post_quotes`                               | 登録 | 見積書の作成                               | `POST /quotes`                                              | `body`                        |
| `get_quotes_quote_id`                       | 参照 | 見積書の取得                               | `GET /quotes/{quote_id}`                                    | `quote_id`                    |
| `put_quotes_quote_id`                       | 更新 | 見積書の更新                               | `PUT /quotes/{quote_id}`                                    | `quote_id`                    |
| `delete_quotes_quote_id`                    | 削除 | 見積書の削除                               | `DELETE /quotes/{quote_id}`                                 | `quote_id`                    |
| `get_quotes_id_items`                       | 参照 | 見積書に紐づく品目一覧の取得               | `GET /quotes/{quote_id}/items`                              | `quote_id`                    |
| `post_quotes_quote_id_items`                | 登録 | 見積書に品目を追加                         | `POST /quotes/{quote_id}/items`                             | `quote_id`                    |
| `get_quotes_quote_id_items_id`              | 参照 | 見積書に紐づく品目を取得                   | `GET /quotes/{quote_id}/items/{item_id}`                    | `quote_id`, `item_id`         |
| `delete_quotes_quote_id_items_id`           | 削除 | 見積書に紐づく品目を削除                   | `DELETE /quotes/{quote_id}/items/{item_id}`                 | `quote_id`, `item_id`         |
| `post_quotes_quote_id_posting`              | 登録 | 見積書の郵送依頼（料金が発生する場合あり） | `POST /quotes/{quote_id}/posting`                           | `quote_id`                    |
| `delete_quotes_quote_id_posting`            | 削除 | 見積書の郵送キャンセル                     | `DELETE /quotes/{quote_id}/posting`                         | `quote_id`                    |
| `put_quote_quote_id_order_status`           | 更新 | 見積書のステータス更新                     | `PUT /quotes/{quote_id}/order_status`                       | `quote_id`, `body`            |
| `post_quotes_quote_id_convert_to_billing`   | 登録 | 見積書を請求書に変換                       | `POST /quotes/{quote_id}/convert_to_billing`                | `quote_id`                    |
| `get_sent_histories`                        | 参照 | 送付履歴一覧の取得                         | `GET /sent_histories`                                       | —                             |

## 各ツールの詳細

### `get_office`

ログイン中の事業者（自社）の情報を取得する。法人・個人事業主いずれかの形態に応じた情報を返す。

- 使う場面: 自社の事業者情報（名称・住所・適格請求書発行事業者番号など）を確認する場合。
- HTTP: `GET /office`（operationId: `get-office`）
- スコープ: `mfc/invoice/data.write`, `mfc/invoice/data.read`

引数なし。

### `put_office`

ログイン中の事業者（自社）の情報を更新する。

- 使う場面: 自社の事業者情報を変更・更新する場合。
- HTTP: `PUT /office`（operationId: `put-office`）
- スコープ: `mfc/invoice/data.write`

| 引数   | 型     | 必須 | 説明                                         |
| ------ | ------ | ---- | -------------------------------------------- |
| `body` | object |      | リクエストボディ（JSON）。項目は仕様書を参照 |

### `put_office_registration_code`

自社の適格請求書発行事業者番号（インボイス登録番号、T+13桁）を作成・更新する。

- 使う場面: インボイス制度の適格請求書発行事業者番号を新規登録または変更する場合。
- 使わない場面: 登録番号を削除する場合はdelete_office_registration_codeを使用。
- HTTP: `PUT /office/registration_code`（operationId: `put-office-registration-code`）
- スコープ: `mfc/invoice/data.write`

| 引数   | 型     | 必須 | 説明                                         |
| ------ | ------ | ---- | -------------------------------------------- |
| `body` | object | ○    | リクエストボディ（JSON）。項目は仕様書を参照 |

### `delete_office_registration_code`

自社の適格請求書発行事業者番号（インボイス登録番号）を削除する。

- 使う場面: 登録済みの適格請求書発行事業者番号を削除する場合。この操作は元に戻せない。
- 使わない場面: 登録番号を新規作成・更新する場合はput_office_registration_codeを使用。
- HTTP: `DELETE /office/registration_code`（operationId: `delete-office-registration_code`）
- スコープ: `mfc/invoice/data.write`

引数なし。

### `get_partners`

取引先の一覧を取得する。取引先名・顧客コード・カナ・担当者名などで絞り込み可能。ページネーション対応。

- 使う場面: 複数の取引先を一覧・検索する場合。取引先名や顧客コードで取引先を探す場合。
- 使わない場面: 取引先IDが既知で1件だけ取得する場合はget_partners_idを使用。
- HTTP: `GET /partners`（operationId: `get-partners`）
- スコープ: `mfc/invoice/data.write`, `mfc/invoice/data.read`

| 引数          | 型      | 必須 | 説明                                                           |
| ------------- | ------- | ---- | -------------------------------------------------------------- |
| `name`        | string  |      | 取引先名で絞り込む。部分一致検索。カンマ区切りで複数指定可能。 |
| `code`        | string  |      | 顧客コードで絞り込む。カンマ区切りで複数指定可能。             |
| `name_kana`   | string  |      | 取引先名（カナ）で絞り込む。カンマ区切りで複数指定可能。       |
| `partner_pic` | string  |      | 取引先側の担当者名で絞り込む。カンマ区切りで複数指定可能。     |
| `office_pic`  | string  |      | 自社側の部署担当者名で絞り込む。カンマ区切りで複数指定可能。   |
| `page`        | integer |      | 取得するページ番号。1以上の整数。default: 1。                  |
| `per_page`    | integer |      | 1ページあたりの取得件数。1〜100の整数。default: 100。          |

### `post_partners`

取引先を新規作成する。部署情報を含めて登録可能。

- 使う場面: 新しい取引先を登録する場合。
- 使わない場面: 既存の取引先情報を更新する場合はput_partners_idを使用。
- HTTP: `POST /partners`（operationId: `post-partners`）
- スコープ: `mfc/invoice/data.write`

| 引数   | 型     | 必須 | 説明                                         |
| ------ | ------ | ---- | -------------------------------------------- |
| `body` | object | ○    | リクエストボディ（JSON）。項目は仕様書を参照 |

### `get_partners_id`

指定したIDの取引先を1件取得する。部署情報を含む。

- 使う場面: 取引先IDが既知で、その1件の詳細を取得する場合。
- 使わない場面: 複数件の一覧・検索が必要な場合はget_partnersを使用。
- HTTP: `GET /partners/{partner_id}`（operationId: `get-partners-id`）
- スコープ: `mfc/invoice/data.write`, `mfc/invoice/data.read`

| 引数         | 型     | 必須 | 説明                                                                 |
| ------------ | ------ | ---- | -------------------------------------------------------------------- |
| `partner_id` | string | ○    | 取引先ID。get_partnersで取得可能。必須。存在しないIDの場合はエラー。 |

### `put_partners_id`

指定したIDの取引先情報を更新する。

- 使う場面: 既存の取引先の情報を変更する場合。
- 使わない場面: 新しい取引先を作成する場合はpost_partnersを使用。
- HTTP: `PUT /partners/{partner_id}`（operationId: `put-partners-id`）
- スコープ: `mfc/invoice/data.write`

| 引数         | 型     | 必須 | 説明                                                                 |
| ------------ | ------ | ---- | -------------------------------------------------------------------- |
| `partner_id` | string | ○    | 取引先ID。get_partnersで取得可能。必須。存在しないIDの場合はエラー。 |
| `body`       | object |      | リクエストボディ（JSON）。項目は仕様書を参照                         |

### `delete_partners_id`

指定したIDの取引先を削除する。

- 使う場面: 取引先を削除する場合。この操作は元に戻せない。
- HTTP: `DELETE /partners/{partner_id}`（operationId: `delete-partners-id`）
- スコープ: `mfc/invoice/data.write`

| 引数         | 型     | 必須 | 説明                                                                 |
| ------------ | ------ | ---- | -------------------------------------------------------------------- |
| `partner_id` | string | ○    | 取引先ID。get_partnersで取得可能。必須。存在しないIDの場合はエラー。 |

### `get_partners_id_partner_departments`

指定した取引先に紐づく部署の一覧を取得する。ページネーション対応。

- 使う場面: ある取引先に登録された複数の部署を一覧・検索する場合。
- 使わない場面: 部署IDが既知で1件取得する場合はget_partners_partner_id_departments_idを使用。
- HTTP: `GET /partners/{partner_id}/departments`（operationId: `get-partners-id-partner-departments`）
- スコープ: `mfc/invoice/data.write`, `mfc/invoice/data.read`

| 引数         | 型     | 必須 | 説明                                                                 |
| ------------ | ------ | ---- | -------------------------------------------------------------------- |
| `partner_id` | string | ○    | 取引先ID。get_partnersで取得可能。必須。存在しないIDの場合はエラー。 |

### `post_partners_id_departments`

指定した取引先に新しい部署を作成する。

- 使う場面: 取引先に新しい部署を追加する場合。
- 使わない場面: 既存の部署を更新する場合はput_partners_partner_id_departments_idを使用。
- HTTP: `POST /partners/{partner_id}/departments`（operationId: `post-partners-id-departments`）
- スコープ: `mfc/invoice/data.write`

| 引数         | 型     | 必須 | 説明                                                                 |
| ------------ | ------ | ---- | -------------------------------------------------------------------- |
| `partner_id` | string | ○    | 取引先ID。get_partnersで取得可能。必須。存在しないIDの場合はエラー。 |
| `body`       | object |      | リクエストボディ（JSON）。項目は仕様書を参照                         |

### `get_partners_partner_id_departments_id`

指定した取引先の指定IDの部署を1件取得する。

- 使う場面: 取引先IDと部署IDが既知で、その部署の詳細を取得する場合。
- 使わない場面: 部署を一覧・検索する場合はget_partners_id_partner_departmentsを使用。
- HTTP: `GET /partners/{partner_id}/departments/{department_id}`（operationId: `get-partners-partner_id-departments-id`）
- スコープ: `mfc/invoice/data.write`, `mfc/invoice/data.read`

| 引数            | 型     | 必須 | 説明                                                                                            |
| --------------- | ------ | ---- | ----------------------------------------------------------------------------------------------- |
| `partner_id`    | string | ○    | 取引先ID。get_partnersで取得可能。必須。存在しないIDの場合はエラー。                            |
| `department_id` | string | ○    | 取引先部署ID。get_partners_id_partner_departmentsで取得可能。必須。存在しないIDの場合はエラー。 |

### `put_partners_partner_id_departments_id`

指定した取引先の指定IDの部署情報を更新する。

- 使う場面: 既存の部署情報を変更する場合。
- HTTP: `PUT /partners/{partner_id}/departments/{department_id}`（operationId: `put-partners-partner_id-departments-id`）
- スコープ: `mfc/invoice/data.write`

| 引数            | 型     | 必須 | 説明                                                                                            |
| --------------- | ------ | ---- | ----------------------------------------------------------------------------------------------- |
| `partner_id`    | string | ○    | 取引先ID。get_partnersで取得可能。必須。存在しないIDの場合はエラー。                            |
| `department_id` | string | ○    | 取引先部署ID。get_partners_id_partner_departmentsで取得可能。必須。存在しないIDの場合はエラー。 |
| `body`          | object |      | リクエストボディ（JSON）。項目は仕様書を参照                                                    |

### `delete_partners_partner_id_departments_id`

指定した取引先の指定IDの部署を削除する。

- 使う場面: 部署を削除する場合。この操作は元に戻せない。
- HTTP: `DELETE /partners/{partner_id}/departments/{department_id}`（operationId: `delete-partners-partner_id-departments-id`）
- スコープ: `mfc/invoice/data.write`

| 引数            | 型     | 必須 | 説明                                                                                            |
| --------------- | ------ | ---- | ----------------------------------------------------------------------------------------------- |
| `partner_id`    | string | ○    | 取引先ID。get_partnersで取得可能。必須。存在しないIDの場合はエラー。                            |
| `department_id` | string | ○    | 取引先部署ID。get_partners_id_partner_departmentsで取得可能。必須。存在しないIDの場合はエラー。 |

### `get_items`

品目（商品・サービス）の一覧を取得する。名称・コードで絞り込み可能。ページネーション対応。

- 使う場面: 複数の品目を一覧・検索する場合。名称やコードで品目を探す場合。
- 使わない場面: 品目IDが既知で1件だけ取得する場合はget_items_idを使用。
- HTTP: `GET /items`（operationId: `get-items`）
- スコープ: `mfc/invoice/data.write`, `mfc/invoice/data.read`

| 引数       | 型      | 必須 | 説明                                                         |
| ---------- | ------- | ---- | ------------------------------------------------------------ |
| `name`     | string  |      | 品目名で絞り込む。部分一致検索。カンマ区切りで複数指定可能。 |
| `code`     | string  |      | 品目コードで絞り込む。カンマ区切りで複数指定可能。           |
| `page`     | integer |      | 取得するページ番号。1以上の整数。default: 1。                |
| `per_page` | integer |      | 1ページあたりの取得件数。default: 100。                      |

### `post_items`

品目（商品・サービス）を新規作成する。

- 使う場面: 新しい品目を登録する場合。
- 使わない場面: 既存の品目を更新する場合はput_items_idを使用。
- HTTP: `POST /items`（operationId: `post-items`）
- スコープ: `mfc/invoice/data.write`

| 引数   | 型     | 必須 | 説明                                         |
| ------ | ------ | ---- | -------------------------------------------- |
| `body` | object | ○    | リクエストボディ（JSON）。項目は仕様書を参照 |

### `get_items_id`

指定したIDの品目を1件取得する。

- 使う場面: 品目IDが既知で、その1件の詳細を取得する場合。
- 使わない場面: 複数件の一覧・検索が必要な場合はget_itemsを使用。
- HTTP: `GET /items/{item_id}`（operationId: `get-items-id`）
- スコープ: `mfc/invoice/data.write`, `mfc/invoice/data.read`

| 引数      | 型     | 必須 | 説明                                                            |
| --------- | ------ | ---- | --------------------------------------------------------------- |
| `item_id` | string | ○    | 品目ID。get_itemsで取得可能。必須。存在しないIDの場合はエラー。 |

### `put_items_id`

指定したIDの品目情報を更新する。

- 使う場面: 既存の品目情報を変更する場合。
- HTTP: `PUT /items/{item_id}`（operationId: `put-items-id`）
- スコープ: `mfc/invoice/data.write`

| 引数      | 型     | 必須 | 説明                                                            |
| --------- | ------ | ---- | --------------------------------------------------------------- |
| `item_id` | string | ○    | 品目ID。get_itemsで取得可能。必須。存在しないIDの場合はエラー。 |
| `body`    | object |      | リクエストボディ（JSON）。項目は仕様書を参照                    |

### `delete_items_id`

指定したIDの品目を削除する。

- 使う場面: 品目を削除する場合。この操作は元に戻せない。
- HTTP: `DELETE /items/{item_id}`（operationId: `delete-items-id`）
- スコープ: `mfc/invoice/data.write`

| 引数      | 型     | 必須 | 説明                                                            |
| --------- | ------ | ---- | --------------------------------------------------------------- |
| `item_id` | string | ○    | 品目ID。get_itemsで取得可能。必須。存在しないIDの場合はエラー。 |

### `get_billings`

請求書の一覧を取得する。期間・ステータス・取引先・請求書番号・タグなどで絞り込み可能。ページネーション対応。

- 使う場面: 複数の請求書を一覧・検索する場合。期間やステータス、取引先で絞り込む場合。
- 使わない場面: 請求書IDが既知で1件取得する場合はget_billings_idを使用。
- HTTP: `GET /billings`（operationId: `get-billings`）
- スコープ: `mfc/invoice/data.write`, `mfc/invoice/data.read`

| 引数              | 型            | 必須 | 説明                                                                                                                                                                                                                                          |
| ----------------- | ------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page`            | integer       |      | 取得するページ番号。1以上の整数。default: 1。                                                                                                                                                                                                 |
| `per_page`        | integer       |      | 1ページあたりの取得件数。1〜100の整数。default: 100。                                                                                                                                                                                         |
| `range_key`       | string        |      | 期間絞込の対象日付項目。from/toと併用する。指定可能な値: billing_date(請求日), due_date(支払期限日), sales_date(売上計上日), created_at(作成日), updated_at(更新日)。（"billing_date", "due_date", "sales_date", "created_at", "updated_at"） |
| `from`            | string (date) |      | 期間絞込の開始日。YYYY-MM-DD形式。range_keyで指定した日付項目が対象。                                                                                                                                                                         |
| `to`              | string (date) |      | 期間絞込の終了日。YYYY-MM-DD形式。range_keyで指定した日付項目が対象。                                                                                                                                                                         |
| `q`               | string        |      | 横断検索文字列。取引先(完全一致)・ステータス・件名などを対象に検索する。指定するとdocument_number/status/partner_name/tagsは検索に使用されない。                                                                                              |
| `partner_id`      | string        |      | 取引先IDで絞り込む。get_partnersで取得可能。                                                                                                                                                                                                  |
| `document_number` | string        |      | 請求書番号で絞り込む。qが指定されている場合このパラメータは検索に使用されない。                                                                                                                                                               |
| `status`          | string        |      | ステータスで絞り込む（例: 下書き, ロック中, 未ロック）。qが指定されている場合このパラメータは検索に使用されない。                                                                                                                             |
| `partner_name`    | string        |      | 取引先名で絞り込む。qが指定されている場合このパラメータは検索に使用されない。                                                                                                                                                                 |
| `tags`            | string        |      | タグで絞り込む（例: タグ1, タグ2）。qが指定されている場合このパラメータは検索に使用されない。                                                                                                                                                 |

### `post_invoice_template_billings`

インボイス制度（適格請求書）に対応した形式の請求書を新規作成する。

- 使う場面: インボイス制度対応形式の請求書を新規作成する場合。
- 使わない場面: 既存の請求書を更新する場合はput_billings_idを使用。
- HTTP: `POST /invoice_template_billings`（operationId: `post-invoice-template-billings`）
- スコープ: `mfc/invoice/data.write`

| 引数   | 型     | 必須 | 説明                                         |
| ------ | ------ | ---- | -------------------------------------------- |
| `body` | object | ○    | リクエストボディ（JSON）。項目は仕様書を参照 |

### `get_billings_id`

指定したIDの請求書を1件取得する。

- 使う場面: 請求書IDが既知で、その1件の詳細を取得する場合。
- 使わない場面: 複数件の一覧・検索が必要な場合はget_billingsを使用。
- HTTP: `GET /billings/{billing_id}`（operationId: `get-billings-id`）
- スコープ: `mfc/invoice/data.write`, `mfc/invoice/data.read`

| 引数         | 型     | 必須 | 説明                                                                 |
| ------------ | ------ | ---- | -------------------------------------------------------------------- |
| `billing_id` | string | ○    | 請求書ID。get_billingsで取得可能。必須。存在しないIDの場合はエラー。 |

### `put_billings_id`

指定したIDの請求書の内容を更新する。

- 使う場面: 既存の請求書の内容を変更する場合。
- 使わない場面: 入金ステータスのみ変更する場合はput_billings_billing_id_payment_statusを使用。
- HTTP: `PUT /billings/{billing_id}`（operationId: `put-billings-id`）
- スコープ: `mfc/invoice/data.write`

| 引数         | 型     | 必須 | 説明                                                                 |
| ------------ | ------ | ---- | -------------------------------------------------------------------- |
| `billing_id` | string | ○    | 請求書ID。get_billingsで取得可能。必須。存在しないIDの場合はエラー。 |
| `body`       | object |      | リクエストボディ（JSON）。項目は仕様書を参照                         |

### `delete_billings_id`

指定したIDの請求書を削除する。

- 使う場面: 請求書を削除する場合。この操作は元に戻せない。
- HTTP: `DELETE /billings/{billing_id}`（operationId: `delete-billings-id`）
- スコープ: `mfc/invoice/data.write`

| 引数         | 型     | 必須 | 説明                                                                 |
| ------------ | ------ | ---- | -------------------------------------------------------------------- |
| `billing_id` | string | ○    | 請求書ID。get_billingsで取得可能。必須。存在しないIDの場合はエラー。 |

### `get_billings_id_items`

指定した請求書に紐づく品目の一覧を取得する。ページネーション対応。

- 使う場面: ある請求書に登録された品目を一覧で取得する場合。
- 使わない場面: 請求書内の特定品目を1件取得する場合はget_billings_billing_id_items_idを使用。
- HTTP: `GET /billings/{billing_id}/items`（operationId: `get-billings-id-items`）
- スコープ: `mfc/invoice/data.write`, `mfc/invoice/data.read`

| 引数         | 型     | 必須 | 説明                                                                 |
| ------------ | ------ | ---- | -------------------------------------------------------------------- |
| `billing_id` | string | ○    | 請求書ID。get_billingsで取得可能。必須。存在しないIDの場合はエラー。 |

### `post_billings_id_items`

指定した請求書に品目を追加する。

- 使う場面: 請求書に品目を追加する場合。
- 使わない場面: 請求書から品目を削除する場合はdelete_billings_billing_id_items_idを使用。
- HTTP: `POST /billings/{billing_id}/items`（operationId: `post-billings-id-items`）
- スコープ: `mfc/invoice/data.write`

| 引数         | 型     | 必須 | 説明                                                                 |
| ------------ | ------ | ---- | -------------------------------------------------------------------- |
| `billing_id` | string | ○    | 請求書ID。get_billingsで取得可能。必須。存在しないIDの場合はエラー。 |
| `body`       | object |      | リクエストボディ（JSON）。項目は仕様書を参照                         |

### `get_billings_billing_id_items_id`

指定した請求書に紐づく指定IDの品目を1件取得する。

- 使う場面: 請求書内の特定の品目の詳細を取得する場合。
- 使わない場面: 請求書内の品目を一覧で取得する場合はget_billings_id_itemsを使用。
- HTTP: `GET /billings/{billing_id}/items/{item_id}`（operationId: `get-billings-billing_id-items-id`）
- スコープ: `mfc/invoice/data.write`, `mfc/invoice/data.read`

| 引数         | 型     | 必須 | 説明                                                                                              |
| ------------ | ------ | ---- | ------------------------------------------------------------------------------------------------- |
| `billing_id` | string | ○    | 請求書ID。get_billingsで取得可能。必須。存在しないIDの場合はエラー。                              |
| `item_id`    | string | ○    | 品目ID（請求書に紐づくもの）。get_billings_id_itemsで取得可能。必須。存在しないIDの場合はエラー。 |

### `delete_billings_billing_id_items_id`

指定した請求書から指定IDの品目を削除する。

- 使う場面: 請求書から品目を削除する場合。この操作は元に戻せない。
- HTTP: `DELETE /billings/{billing_id}/items/{item_id}`（operationId: `delete-billings-billing_id-items-id`）
- スコープ: `mfc/invoice/data.write`

| 引数         | 型     | 必須 | 説明                                                                                              |
| ------------ | ------ | ---- | ------------------------------------------------------------------------------------------------- |
| `billing_id` | string | ○    | 請求書ID。get_billingsで取得可能。必須。存在しないIDの場合はエラー。                              |
| `item_id`    | string | ○    | 品目ID（請求書に紐づくもの）。get_billings_id_itemsで取得可能。必須。存在しないIDの場合はエラー。 |

### `put_billings_billing_id_payment_status`

指定した請求書の入金ステータスを変更する。

- 使う場面: 請求書の入金状況（未入金・入金済みなど）を更新する場合。
- 使わない場面: 請求書の内容全体を更新する場合はput_billings_idを使用。
- HTTP: `PUT /billings/{billing_id}/payment_status`（operationId: `put-billings-billing_id-payment_status`）
- スコープ: `mfc/invoice/data.write`

| 引数         | 型     | 必須 | 説明                                                                 |
| ------------ | ------ | ---- | -------------------------------------------------------------------- |
| `billing_id` | string | ○    | 請求書ID。get_billingsで取得可能。必須。存在しないIDの場合はエラー。 |
| `body`       | object | ○    | リクエストボディ（JSON）。項目は仕様書を参照                         |

### `post_billings_billing_id_posting`

指定した請求書の郵送を依頼する。クラウドBoxへの保存可否を指定可能。

- 使う場面: 請求書を郵送依頼する場合。
- 使わない場面: 郵送依頼をキャンセルする場合はdelete_billings_billing_id_postingを使用。
- HTTP: `POST /billings/{billing_id}/posting`（operationId: `post-billings-billing_id-posting`）
- スコープ: `mfc/invoice/data.write`
- 注意: 郵送料などの料金が発生する場合があります（HTTP 402）

| 引数         | 型     | 必須 | 説明                                                                 |
| ------------ | ------ | ---- | -------------------------------------------------------------------- |
| `billing_id` | string | ○    | 請求書ID。get_billingsで取得可能。必須。存在しないIDの場合はエラー。 |
| `body`       | object |      | リクエストボディ（JSON）。項目は仕様書を参照                         |

### `delete_billings_billing_id_posting`

指定した請求書の郵送依頼をキャンセルする。

- 使う場面: 請求書の郵送依頼を取り消す場合。
- 使わない場面: 郵送を新たに依頼する場合はpost_billings_billing_id_postingを使用。
- HTTP: `DELETE /billings/{billing_id}/posting`（operationId: `delete-billings-billing_id-posting`）
- スコープ: `mfc/invoice/data.write`

| 引数         | 型     | 必須 | 説明                                                                 |
| ------------ | ------ | ---- | -------------------------------------------------------------------- |
| `billing_id` | string | ○    | 請求書ID。get_billingsで取得可能。必須。存在しないIDの場合はエラー。 |

### `get_quotes`

見積書の一覧を取得する。期間・ステータス・取引先・見積書番号・タグなどで絞り込み可能。ページネーション対応。

- 使う場面: 複数の見積書を一覧・検索する場合。期間やステータス、取引先で絞り込む場合。
- 使わない場面: 見積書IDが既知で1件取得する場合はget_quotes_quote_idを使用。
- HTTP: `GET /quotes`（operationId: `get-quotes`）
- スコープ: `mfc/invoice/data.write`, `mfc/invoice/data.read`

| 引数              | 型            | 必須 | 説明                                                                                                                                                                                                          |
| ----------------- | ------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page`            | integer       |      | 取得するページ番号。1以上の整数。default: 1。                                                                                                                                                                 |
| `per_page`        | integer       |      | 1ページあたりの取得件数。1〜100の整数。default: 100。                                                                                                                                                         |
| `range_key`       | string        |      | 期間絞込の対象日付項目。from/toと併用する。指定可能な値: quote_date(見積日), expired_date(有効期限), created_at(作成日時), updated_at(更新日時)。（"quote_date", "expired_date", "created_at", "updated_at"） |
| `from`            | string (date) |      | 期間絞込の開始日。YYYY-MM-DD形式。range_keyで指定した日付項目が対象。                                                                                                                                         |
| `to`              | string (date) |      | 期間絞込の終了日。YYYY-MM-DD形式。range_keyで指定した日付項目が対象。                                                                                                                                         |
| `q`               | string        |      | 横断検索文字列。取引先(完全一致)・ステータス・件名などを対象に検索する。指定するとdocument_number/status/partner_name/tagsは検索に使用されない。                                                              |
| `partner_id`      | string        |      | 取引先IDで絞り込む。get_partnersで取得可能。                                                                                                                                                                  |
| `document_number` | string        |      | 見積書番号で絞り込む。qが指定されている場合このパラメータは検索に使用されない。                                                                                                                               |
| `status`          | string        |      | ステータスで絞り込む（例: 下書き, ロック中, 未ロック）。qが指定されている場合このパラメータは検索に使用されない。                                                                                             |
| `partner_name`    | string        |      | 取引先名で絞り込む。qが指定されている場合このパラメータは検索に使用されない。                                                                                                                                 |
| `tags`            | string        |      | タグで絞り込む（例: タグ1, タグ2）。qが指定されている場合このパラメータは検索に使用されない。                                                                                                                 |

### `post_quotes`

見積書を新規作成する。

- 使う場面: 新しい見積書を作成する場合。
- 使わない場面: 既存の見積書を更新する場合はput_quotes_quote_idを使用。
- HTTP: `POST /quotes`（operationId: `post-quotes`）
- スコープ: `mfc/invoice/data.write`

| 引数   | 型     | 必須 | 説明                                         |
| ------ | ------ | ---- | -------------------------------------------- |
| `body` | object | ○    | リクエストボディ（JSON）。項目は仕様書を参照 |

### `get_quotes_quote_id`

指定したIDの見積書を1件取得する。

- 使う場面: 見積書IDが既知で、その1件の詳細を取得する場合。
- 使わない場面: 複数件の一覧・検索が必要な場合はget_quotesを使用。
- HTTP: `GET /quotes/{quote_id}`（operationId: `get-quotes-quote_id`）
- スコープ: `mfc/invoice/data.write`, `mfc/invoice/data.read`

| 引数       | 型     | 必須 | 説明                                                               |
| ---------- | ------ | ---- | ------------------------------------------------------------------ |
| `quote_id` | string | ○    | 見積書ID。get_quotesで取得可能。必須。存在しないIDの場合はエラー。 |

### `put_quotes_quote_id`

指定したIDの見積書の内容を更新する。

- 使う場面: 既存の見積書の内容を変更する場合。
- 使わない場面: 受注ステータスのみ変更する場合はput_quote_quote_id_order_statusを使用。
- HTTP: `PUT /quotes/{quote_id}`（operationId: `put-quotes-quote_id`）
- スコープ: `mfc/invoice/data.write`

| 引数       | 型     | 必須 | 説明                                                               |
| ---------- | ------ | ---- | ------------------------------------------------------------------ |
| `quote_id` | string | ○    | 見積書ID。get_quotesで取得可能。必須。存在しないIDの場合はエラー。 |
| `body`     | object |      | リクエストボディ（JSON）。項目は仕様書を参照                       |

### `delete_quotes_quote_id`

指定したIDの見積書を削除する。

- 使う場面: 見積書を削除する場合。この操作は元に戻せない。
- HTTP: `DELETE /quotes/{quote_id}`（operationId: `delete-quotes-quote_id`）
- スコープ: `mfc/invoice/data.write`

| 引数       | 型     | 必須 | 説明                                                               |
| ---------- | ------ | ---- | ------------------------------------------------------------------ |
| `quote_id` | string | ○    | 見積書ID。get_quotesで取得可能。必須。存在しないIDの場合はエラー。 |

### `get_quotes_id_items`

指定した見積書に紐づく品目の一覧を取得する。ページネーション対応。

- 使う場面: ある見積書に登録された品目を一覧で取得する場合。
- 使わない場面: 見積書内の特定品目を1件取得する場合はget_quotes_quote_id_items_idを使用。
- HTTP: `GET /quotes/{quote_id}/items`（operationId: `get-quotes-id-items`）
- スコープ: `mfc/invoice/data.write`, `mfc/invoice/data.read`

| 引数       | 型     | 必須 | 説明                                                               |
| ---------- | ------ | ---- | ------------------------------------------------------------------ |
| `quote_id` | string | ○    | 見積書ID。get_quotesで取得可能。必須。存在しないIDの場合はエラー。 |

### `post_quotes_quote_id_items`

指定した見積書に品目を追加する。

- 使う場面: 見積書に品目を追加する場合。
- 使わない場面: 見積書から品目を削除する場合はdelete_quotes_quote_id_items_idを使用。
- HTTP: `POST /quotes/{quote_id}/items`（operationId: `post-quotes-quote_id-items`）
- スコープ: `mfc/invoice/data.write`

| 引数       | 型     | 必須 | 説明                                                               |
| ---------- | ------ | ---- | ------------------------------------------------------------------ |
| `quote_id` | string | ○    | 見積書ID。get_quotesで取得可能。必須。存在しないIDの場合はエラー。 |
| `body`     | object |      | リクエストボディ（JSON）。項目は仕様書を参照                       |

### `get_quotes_quote_id_items_id`

指定した見積書に紐づく指定IDの品目を1件取得する。

- 使う場面: 見積書内の特定の品目の詳細を取得する場合。
- 使わない場面: 見積書内の品目を一覧で取得する場合はget_quotes_id_itemsを使用。
- HTTP: `GET /quotes/{quote_id}/items/{item_id}`（operationId: `get-quotes-quote_id-items-id`）
- スコープ: `mfc/invoice/data.write`, `mfc/invoice/data.read`

| 引数       | 型     | 必須 | 説明                                                                                            |
| ---------- | ------ | ---- | ----------------------------------------------------------------------------------------------- |
| `quote_id` | string | ○    | 見積書ID。get_quotesで取得可能。必須。存在しないIDの場合はエラー。                              |
| `item_id`  | string | ○    | 品目ID（見積書に紐づくもの）。get_quotes_id_itemsで取得可能。必須。存在しないIDの場合はエラー。 |

### `delete_quotes_quote_id_items_id`

指定した見積書から指定IDの品目を削除する。

- 使う場面: 見積書から品目を削除する場合。この操作は元に戻せない。
- HTTP: `DELETE /quotes/{quote_id}/items/{item_id}`（operationId: `delete-quotes-quote_id-items-id`）
- スコープ: `mfc/invoice/data.write`

| 引数       | 型     | 必須 | 説明                                                                                            |
| ---------- | ------ | ---- | ----------------------------------------------------------------------------------------------- |
| `quote_id` | string | ○    | 見積書ID。get_quotesで取得可能。必須。存在しないIDの場合はエラー。                              |
| `item_id`  | string | ○    | 品目ID（見積書に紐づくもの）。get_quotes_id_itemsで取得可能。必須。存在しないIDの場合はエラー。 |

### `post_quotes_quote_id_posting`

指定した見積書の郵送を依頼する。クラウドBoxへの保存可否を指定可能。

- 使う場面: 見積書を郵送依頼する場合。
- 使わない場面: 郵送依頼をキャンセルする場合はdelete_quotes_quote_id_postingを使用。
- HTTP: `POST /quotes/{quote_id}/posting`（operationId: `post-quotes-quote_id-posting`）
- スコープ: `mfc/invoice/data.write`
- 注意: 郵送料などの料金が発生する場合があります（HTTP 402）

| 引数       | 型     | 必須 | 説明                                                               |
| ---------- | ------ | ---- | ------------------------------------------------------------------ |
| `quote_id` | string | ○    | 見積書ID。get_quotesで取得可能。必須。存在しないIDの場合はエラー。 |
| `body`     | object |      | リクエストボディ（JSON）。項目は仕様書を参照                       |

### `delete_quotes_quote_id_posting`

指定した見積書の郵送依頼をキャンセルする。

- 使う場面: 見積書の郵送依頼を取り消す場合。
- 使わない場面: 郵送を新たに依頼する場合はpost_quotes_quote_id_postingを使用。
- HTTP: `DELETE /quotes/{quote_id}/posting`（operationId: `delete-quotes-quote_id-posting`）
- スコープ: `mfc/invoice/data.write`

| 引数       | 型     | 必須 | 説明                                                               |
| ---------- | ------ | ---- | ------------------------------------------------------------------ |
| `quote_id` | string | ○    | 見積書ID。get_quotesで取得可能。必須。存在しないIDの場合はエラー。 |

### `put_quote_quote_id_order_status`

指定した見積書の受注ステータスを更新する。受注ステータスは -1(失注), 0(未設定), 1(未受注), 2(受注済み) のいずれか。

- 使う場面: 見積書の受注ステータス（失注・未受注・受注済みなど）を変更する場合。
- 使わない場面: 見積書の内容全体を更新する場合はput_quotes_quote_idを使用。
- HTTP: `PUT /quotes/{quote_id}/order_status`（operationId: `put-quote-quote_id-order_status`）
- スコープ: `mfc/invoice/data.write`

| 引数       | 型     | 必須 | 説明                                                               |
| ---------- | ------ | ---- | ------------------------------------------------------------------ |
| `quote_id` | string | ○    | 見積書ID。get_quotesで取得可能。必須。存在しないIDの場合はエラー。 |
| `body`     | object | ○    | リクエストボディ（JSON）。項目は仕様書を参照                       |

### `post_quotes_quote_id_convert_to_billing`

指定した見積書を請求書に変換する。変換により新しい請求書が作成される。

- 使う場面: 受注した見積書をもとに請求書を作成する場合。
- HTTP: `POST /quotes/{quote_id}/convert_to_billing`（operationId: `post-quotes-quote_id-convert_to_billing`）
- スコープ: `mfc/invoice/data.write`

| 引数       | 型     | 必須 | 説明                                                               |
| ---------- | ------ | ---- | ------------------------------------------------------------------ |
| `quote_id` | string | ○    | 見積書ID。get_quotesで取得可能。必須。存在しないIDの場合はエラー。 |

### `get_sent_histories`

請求書・見積書などの書類の送付履歴（メール送付など）の一覧を取得する。ページネーション対応。

- 使う場面: 書類をいつ・どの宛先に送付したかなどの送付履歴を確認する場合。
- HTTP: `GET /sent_histories`（operationId: `get-sent_histories`）
- スコープ: `mfc/invoice/data.write`, `mfc/invoice/data.read`

| 引数       | 型      | 必須 | 説明                                                  |
| ---------- | ------- | ---- | ----------------------------------------------------- |
| `page`     | integer |      | 取得するページ番号。1以上の整数。default: 1。         |
| `per_page` | integer |      | 1ページあたりの取得件数。1〜100の整数。default: 100。 |
