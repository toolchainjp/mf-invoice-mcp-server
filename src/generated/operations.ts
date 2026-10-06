// このファイルは scripts/generate-operations.ts が document.yaml から生成しています。直接編集しないでください。
// 再生成: npm run generate
import type { OperationDef } from "../openapi/convert.js";

export const operations: readonly OperationDef[] = [
  {
    "operationId": "get-office",
    "toolName": "get_office",
    "method": "GET",
    "path": "/office",
    "kind": "read",
    "summary": "Get my office",
    "mcp": {
      "description": "ログイン中の事業者（自社）の情報を取得する。法人・個人事業主いずれかの形態に応じた情報を返す。",
      "useWhen": "自社の事業者情報（名称・住所・適格請求書発行事業者番号など）を確認する場合。"
    },
    "tags": [
      "Office"
    ],
    "parameters": [],
    "scopes": [
      "mfc/invoice/data.write",
      "mfc/invoice/data.read"
    ],
    "responseStatuses": [
      "200",
      "404"
    ],
    "description": "事業者情報の取得"
  },
  {
    "operationId": "put-office",
    "toolName": "put_office",
    "method": "PUT",
    "path": "/office",
    "kind": "update",
    "summary": "Update my office",
    "mcp": {
      "description": "ログイン中の事業者（自社）の情報を更新する。",
      "useWhen": "自社の事業者情報を変更・更新する場合。"
    },
    "tags": [
      "Office"
    ],
    "parameters": [],
    "scopes": [
      "mfc/invoice/data.write"
    ],
    "responseStatuses": [
      "200",
      "400"
    ],
    "description": "事業者情報の更新",
    "requestBody": {
      "required": false,
      "schema": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "maxLength": 35
          },
          "zip": {
            "type": "string",
            "minLength": 7,
            "maxLength": 8,
            "pattern": "^\\d{3}-?\\d{4}$"
          },
          "prefecture": {
            "type": "string"
          },
          "address1": {
            "type": "string",
            "maxLength": 35
          },
          "address2": {
            "type": "string",
            "maxLength": 35
          },
          "tel": {
            "type": "string",
            "pattern": "^(\\+|＋)?[0-9０-９\\-|－|ー|−]+\\s*$",
            "minLength": 7,
            "maxLength": 30
          },
          "fax": {
            "type": "string",
            "minLength": 7,
            "maxLength": 30,
            "pattern": "^(\\+|＋)?[0-9０-９\\-|－|ー|−]+\\s*$"
          }
        }
      },
      "description": "Request body for updating a Office"
    }
  },
  {
    "operationId": "put-office-registration-code",
    "toolName": "put_office_registration_code",
    "method": "PUT",
    "path": "/office/registration_code",
    "kind": "update",
    "summary": "Update registration code of my office",
    "mcp": {
      "description": "自社の適格請求書発行事業者番号（インボイス登録番号、T+13桁）を作成・更新する。",
      "useWhen": "インボイス制度の適格請求書発行事業者番号を新規登録または変更する場合。",
      "doNotUseWhen": "登録番号を削除する場合はdelete_office_registration_codeを使用。"
    },
    "tags": [
      "Office"
    ],
    "parameters": [],
    "scopes": [
      "mfc/invoice/data.write"
    ],
    "responseStatuses": [
      "200",
      "400"
    ],
    "description": "適格請求書発行事業者番号の作成・更新",
    "requestBody": {
      "required": false,
      "schema": {
        "type": "object",
        "properties": {
          "registration_code": {
            "type": "string",
            "pattern": "^T\\d{13}$"
          }
        },
        "required": [
          "registration_code"
        ]
      }
    }
  },
  {
    "operationId": "delete-office-registration_code",
    "toolName": "delete_office_registration_code",
    "method": "DELETE",
    "path": "/office/registration_code",
    "kind": "delete",
    "summary": "Delete registration code of my office",
    "mcp": {
      "description": "自社の適格請求書発行事業者番号（インボイス登録番号）を削除する。",
      "useWhen": "登録済みの適格請求書発行事業者番号を削除する場合。この操作は元に戻せない。",
      "doNotUseWhen": "登録番号を新規作成・更新する場合はput_office_registration_codeを使用。"
    },
    "tags": [
      "Office"
    ],
    "parameters": [],
    "scopes": [
      "mfc/invoice/data.write"
    ],
    "responseStatuses": [
      "204"
    ],
    "description": "適格請求書発行事業者番号の削除"
  },
  {
    "operationId": "get-partners",
    "toolName": "get_partners",
    "method": "GET",
    "path": "/partners",
    "kind": "read",
    "summary": "Get partners",
    "mcp": {
      "description": "取引先の一覧を取得する。取引先名・顧客コード・カナ・担当者名などで絞り込み可能。ページネーション対応。",
      "useWhen": "複数の取引先を一覧・検索する場合。取引先名や顧客コードで取引先を探す場合。",
      "doNotUseWhen": "取引先IDが既知で1件だけ取得する場合はget_partners_idを使用。"
    },
    "tags": [
      "Partner"
    ],
    "parameters": [
      {
        "name": "name",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string"
        },
        "description": "取引先名で絞り込む。部分一致検索。カンマ区切りで複数指定可能。"
      },
      {
        "name": "code",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string"
        },
        "description": "顧客コードで絞り込む。カンマ区切りで複数指定可能。"
      },
      {
        "name": "name_kana",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string"
        },
        "description": "取引先名（カナ）で絞り込む。カンマ区切りで複数指定可能。"
      },
      {
        "name": "partner_pic",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string"
        },
        "description": "取引先側の担当者名で絞り込む。カンマ区切りで複数指定可能。"
      },
      {
        "name": "office_pic",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string"
        },
        "description": "自社側の部署担当者名で絞り込む。カンマ区切りで複数指定可能。"
      },
      {
        "name": "page",
        "in": "query",
        "required": false,
        "schema": {
          "type": "integer",
          "minimum": 1
        },
        "description": "取得するページ番号。1以上の整数。default: 1。"
      },
      {
        "name": "per_page",
        "in": "query",
        "required": false,
        "schema": {
          "type": "integer",
          "minimum": 1,
          "maximum": 100
        },
        "description": "1ページあたりの取得件数。1〜100の整数。default: 100。"
      }
    ],
    "scopes": [
      "mfc/invoice/data.write",
      "mfc/invoice/data.read"
    ],
    "responseStatuses": [
      "200"
    ],
    "description": "取引先一覧の取得"
  },
  {
    "operationId": "post-partners",
    "toolName": "post_partners",
    "method": "POST",
    "path": "/partners",
    "kind": "create",
    "summary": "Create new partner",
    "mcp": {
      "description": "取引先を新規作成する。部署情報を含めて登録可能。",
      "useWhen": "新しい取引先を登録する場合。",
      "doNotUseWhen": "既存の取引先情報を更新する場合はput_partners_idを使用。"
    },
    "tags": [
      "Partner"
    ],
    "parameters": [],
    "scopes": [
      "mfc/invoice/data.write"
    ],
    "responseStatuses": [
      "201",
      "400"
    ],
    "description": "取引先の作成",
    "requestBody": {
      "required": false,
      "schema": {
        "type": "object",
        "properties": {
          "code": {
            "type": "string",
            "maxLength": 30
          },
          "name": {
            "type": "string",
            "maxLength": 100
          },
          "name_kana": {
            "type": "string",
            "maxLength": 350
          },
          "name_suffix": {
            "type": "string"
          },
          "memo": {
            "type": "string",
            "maxLength": 500
          },
          "departments": {
            "description": "Array of objects, maximum 10 items. Fill in at least one parameter",
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "zip": {
                  "type": "string",
                  "minLength": 7,
                  "maxLength": 8,
                  "pattern": "^\\d{3}-?\\d{4}$"
                },
                "tel": {
                  "type": "string",
                  "pattern": "^(\\+|＋)?[0-9０-９\\-|－|ー|−]+\\s*$",
                  "minLength": 7,
                  "maxLength": 30
                },
                "prefecture": {
                  "type": "string"
                },
                "address1": {
                  "type": "string",
                  "maxLength": 80
                },
                "address2": {
                  "type": "string",
                  "maxLength": 80
                },
                "person_name": {
                  "type": "string",
                  "maxLength": 35
                },
                "person_title": {
                  "type": "string",
                  "maxLength": 35
                },
                "person_dept": {
                  "type": "string",
                  "maxLength": 35
                },
                "office_member_name": {
                  "type": "string",
                  "maxLength": 40
                },
                "email": {
                  "type": "string",
                  "maxLength": 255
                },
                "cc_emails": {
                  "type": "string",
                  "maxLength": 500
                },
                "peppol_id": {
                  "type": "string",
                  "pattern": "^((0088|0188):[0-9]{13}|0221:T[0-9]{13})$"
                }
              }
            }
          },
          "payment_deadline_setting": {
            "type": "object",
            "properties": {
              "due_month": {
                "type": "string",
                "description": "支払期日（月）:\n  * `this_month` - 当月\n  * `next_month` - 翌月\n  * `two_months_after` - 2ヶ月後\n  * `three_months_after` - 3ヶ月後\n  * `four_months_after` - 4ヶ月後\n  * `five_months_after` - 5ヶ月後\n  * `six_months_after` - 6ヶ月後\n",
                "enum": [
                  "this_month",
                  "next_month",
                  "two_months_after",
                  "three_months_after",
                  "four_months_after",
                  "five_months_after",
                  "six_months_after"
                ]
              },
              "due_date": {
                "type": "integer",
                "description": "Enter the payment due date.\nIf you want to set it to the last day of the month, set it to \"-1\".\nIf you want to set it to a specific day, set it to a number between 1 and 31.\nNote: 0 is not a valid value.\nIf no corresponding day exists, the last day of the month will be automatically set.\n",
                "minimum": -1,
                "maximum": 31
              },
              "contingency_day": {
                "type": "string",
                "description": "支払期日が休日の場合の処理:\n  * `move_to_earlier_day` - 前倒し\n  * `keep_as_is` - そのまま\n  * `move_to_later_day` - 後倒し\n",
                "enum": [
                  "move_to_earlier_day",
                  "keep_as_is",
                  "move_to_later_day"
                ]
              }
            },
            "required": [
              "due_month",
              "due_date",
              "contingency_day"
            ]
          }
        },
        "required": [
          "name"
        ]
      },
      "description": "Request body for creating a Partner"
    }
  },
  {
    "operationId": "get-partners-id",
    "toolName": "get_partners_id",
    "method": "GET",
    "path": "/partners/{partner_id}",
    "kind": "read",
    "summary": "Get a partner",
    "mcp": {
      "description": "指定したIDの取引先を1件取得する。部署情報を含む。",
      "useWhen": "取引先IDが既知で、その1件の詳細を取得する場合。",
      "doNotUseWhen": "複数件の一覧・検索が必要な場合はget_partnersを使用。"
    },
    "tags": [
      "Partner"
    ],
    "parameters": [
      {
        "name": "partner_id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string"
        },
        "description": "取引先ID。get_partnersで取得可能。必須。存在しないIDの場合はエラー。"
      }
    ],
    "scopes": [
      "mfc/invoice/data.write",
      "mfc/invoice/data.read"
    ],
    "responseStatuses": [
      "200",
      "404"
    ],
    "description": "取引先の取得"
  },
  {
    "operationId": "put-partners-id",
    "toolName": "put_partners_id",
    "method": "PUT",
    "path": "/partners/{partner_id}",
    "kind": "update",
    "summary": "Update a partner",
    "mcp": {
      "description": "指定したIDの取引先情報を更新する。",
      "useWhen": "既存の取引先の情報を変更する場合。",
      "doNotUseWhen": "新しい取引先を作成する場合はpost_partnersを使用。"
    },
    "tags": [
      "Partner"
    ],
    "parameters": [
      {
        "name": "partner_id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string"
        },
        "description": "取引先ID。get_partnersで取得可能。必須。存在しないIDの場合はエラー。"
      }
    ],
    "scopes": [
      "mfc/invoice/data.write"
    ],
    "responseStatuses": [
      "200",
      "400"
    ],
    "description": "取引先の更新",
    "requestBody": {
      "required": false,
      "schema": {
        "type": "object",
        "properties": {
          "code": {
            "type": "string",
            "maxLength": 30
          },
          "name": {
            "type": "string",
            "maxLength": 100
          },
          "name_kana": {
            "type": "string",
            "maxLength": 350
          },
          "name_suffix": {
            "type": "string"
          },
          "memo": {
            "type": "string",
            "maxLength": 500
          },
          "payment_deadline_setting": {
            "type": "object",
            "properties": {
              "due_month": {
                "type": "string",
                "description": "支払期日（月）:\n  * `this_month` - 当月\n  * `next_month` - 翌月\n  * `two_months_after` - 2ヶ月後\n  * `three_months_after` - 3ヶ月後\n  * `four_months_after` - 4ヶ月後\n  * `five_months_after` - 5ヶ月後\n  * `six_months_after` - 6ヶ月後\n",
                "enum": [
                  "this_month",
                  "next_month",
                  "two_months_after",
                  "three_months_after",
                  "four_months_after",
                  "five_months_after",
                  "six_months_after"
                ]
              },
              "due_date": {
                "type": "integer",
                "description": "Enter the payment due date.\nIf you want to set it to the last day of the month, set it to \"-1\".\nIf you want to set it to a specific day, set it to a number between 1 and 31.\nNote: 0 is not a valid value.\nIf no corresponding day exists, the last day of the month will be automatically set.\n",
                "minimum": -1,
                "maximum": 31
              },
              "contingency_day": {
                "type": "string",
                "description": "支払期日が休日の場合の処理:\n  * `move_to_earlier_day` - 前倒し\n  * `keep_as_is` - そのまま\n  * `move_to_later_day` - 後倒し\n",
                "enum": [
                  "move_to_earlier_day",
                  "keep_as_is",
                  "move_to_later_day"
                ]
              }
            },
            "required": [
              "due_month",
              "due_date",
              "contingency_day"
            ]
          }
        }
      },
      "description": "Request body for updating a Partner"
    }
  },
  {
    "operationId": "delete-partners-id",
    "toolName": "delete_partners_id",
    "method": "DELETE",
    "path": "/partners/{partner_id}",
    "kind": "delete",
    "summary": "Delete a partner",
    "mcp": {
      "description": "指定したIDの取引先を削除する。",
      "useWhen": "取引先を削除する場合。この操作は元に戻せない。"
    },
    "tags": [
      "Partner"
    ],
    "parameters": [
      {
        "name": "partner_id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string"
        },
        "description": "取引先ID。get_partnersで取得可能。必須。存在しないIDの場合はエラー。"
      }
    ],
    "scopes": [
      "mfc/invoice/data.write"
    ],
    "responseStatuses": [
      "204",
      "400"
    ],
    "description": "取引先の削除"
  },
  {
    "operationId": "get-partners-id-partner-departments",
    "toolName": "get_partners_id_partner_departments",
    "method": "GET",
    "path": "/partners/{partner_id}/departments",
    "kind": "read",
    "summary": "Get departments",
    "mcp": {
      "description": "指定した取引先に紐づく部署の一覧を取得する。ページネーション対応。",
      "useWhen": "ある取引先に登録された複数の部署を一覧・検索する場合。",
      "doNotUseWhen": "部署IDが既知で1件取得する場合はget_partners_partner_id_departments_idを使用。"
    },
    "tags": [
      "Department"
    ],
    "parameters": [
      {
        "name": "partner_id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string"
        },
        "description": "取引先ID。get_partnersで取得可能。必須。存在しないIDの場合はエラー。"
      }
    ],
    "scopes": [
      "mfc/invoice/data.write",
      "mfc/invoice/data.read"
    ],
    "responseStatuses": [
      "200",
      "404"
    ],
    "description": "取引先部署一覧の取得"
  },
  {
    "operationId": "post-partners-id-departments",
    "toolName": "post_partners_id_departments",
    "method": "POST",
    "path": "/partners/{partner_id}/departments",
    "kind": "create",
    "summary": "Create new department",
    "mcp": {
      "description": "指定した取引先に新しい部署を作成する。",
      "useWhen": "取引先に新しい部署を追加する場合。",
      "doNotUseWhen": "既存の部署を更新する場合はput_partners_partner_id_departments_idを使用。"
    },
    "tags": [
      "Department"
    ],
    "parameters": [
      {
        "name": "partner_id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string"
        },
        "description": "取引先ID。get_partnersで取得可能。必須。存在しないIDの場合はエラー。"
      }
    ],
    "scopes": [
      "mfc/invoice/data.write"
    ],
    "responseStatuses": [
      "201",
      "400",
      "404"
    ],
    "description": "取引先部署の作成",
    "requestBody": {
      "required": false,
      "schema": {
        "description": "Fill in at least one parameter.",
        "type": "object",
        "properties": {
          "zip": {
            "type": "string",
            "minLength": 7,
            "maxLength": 8,
            "pattern": "^\\d{3}-?\\d{4}$"
          },
          "tel": {
            "type": "string",
            "pattern": "^(\\+|＋)?[0-9０-９\\-|－|ー|−]+\\s*$",
            "minLength": 7,
            "maxLength": 30
          },
          "prefecture": {
            "type": "string"
          },
          "address1": {
            "type": "string",
            "maxLength": 80
          },
          "address2": {
            "type": "string",
            "maxLength": 80
          },
          "person_name": {
            "type": "string",
            "maxLength": 35
          },
          "person_title": {
            "type": "string",
            "maxLength": 35
          },
          "person_dept": {
            "type": "string",
            "maxLength": 35
          },
          "office_member_name": {
            "type": "string",
            "maxLength": 40
          },
          "email": {
            "type": "string",
            "maxLength": 255
          },
          "cc_emails": {
            "type": "string",
            "maxLength": 500
          },
          "peppol_id": {
            "type": "string",
            "pattern": "^((0088|0188):[0-9]{13}|0221:T[0-9]{13})$"
          }
        }
      },
      "description": "Request body for creating a department"
    }
  },
  {
    "operationId": "get-partners-partner_id-departments-id",
    "toolName": "get_partners_partner_id_departments_id",
    "method": "GET",
    "path": "/partners/{partner_id}/departments/{department_id}",
    "kind": "read",
    "summary": "Get a department",
    "mcp": {
      "description": "指定した取引先の指定IDの部署を1件取得する。",
      "useWhen": "取引先IDと部署IDが既知で、その部署の詳細を取得する場合。",
      "doNotUseWhen": "部署を一覧・検索する場合はget_partners_id_partner_departmentsを使用。"
    },
    "tags": [
      "Department"
    ],
    "parameters": [
      {
        "name": "partner_id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string"
        },
        "description": "取引先ID。get_partnersで取得可能。必須。存在しないIDの場合はエラー。"
      },
      {
        "name": "department_id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string"
        },
        "description": "取引先部署ID。get_partners_id_partner_departmentsで取得可能。必須。存在しないIDの場合はエラー。"
      }
    ],
    "scopes": [
      "mfc/invoice/data.write",
      "mfc/invoice/data.read"
    ],
    "responseStatuses": [
      "200",
      "404"
    ],
    "description": "取引先部署の取得"
  },
  {
    "operationId": "put-partners-partner_id-departments-id",
    "toolName": "put_partners_partner_id_departments_id",
    "method": "PUT",
    "path": "/partners/{partner_id}/departments/{department_id}",
    "kind": "update",
    "summary": "Update a department",
    "mcp": {
      "description": "指定した取引先の指定IDの部署情報を更新する。",
      "useWhen": "既存の部署情報を変更する場合。"
    },
    "tags": [
      "Department"
    ],
    "parameters": [
      {
        "name": "partner_id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string"
        },
        "description": "取引先ID。get_partnersで取得可能。必須。存在しないIDの場合はエラー。"
      },
      {
        "name": "department_id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string"
        },
        "description": "取引先部署ID。get_partners_id_partner_departmentsで取得可能。必須。存在しないIDの場合はエラー。"
      }
    ],
    "scopes": [
      "mfc/invoice/data.write"
    ],
    "responseStatuses": [
      "200",
      "400",
      "404"
    ],
    "description": "取引先部署の更新",
    "requestBody": {
      "required": false,
      "schema": {
        "type": "object",
        "properties": {
          "zip": {
            "type": "string",
            "minLength": 7,
            "maxLength": 8,
            "pattern": "^\\d{3}-?\\d{4}$"
          },
          "tel": {
            "type": "string",
            "pattern": "^(\\+|＋)?[0-9０-９\\-|－|ー|−]+\\s*$",
            "minLength": 7,
            "maxLength": 30
          },
          "prefecture": {
            "type": "string"
          },
          "address1": {
            "type": "string",
            "maxLength": 80
          },
          "address2": {
            "type": "string",
            "maxLength": 80
          },
          "person_name": {
            "type": "string",
            "maxLength": 35
          },
          "person_title": {
            "type": "string",
            "maxLength": 35
          },
          "person_dept": {
            "type": "string",
            "maxLength": 35
          },
          "office_member_name": {
            "type": "string",
            "maxLength": 40
          },
          "email": {
            "type": "string",
            "maxLength": 255
          },
          "cc_emails": {
            "type": "string",
            "maxLength": 500
          },
          "peppol_id": {
            "type": "string",
            "pattern": "^((0088|0188):[0-9]{13}|0221:T[0-9]{13})$"
          }
        }
      },
      "description": "Request body for updating a department, Fill in at least one parameter."
    }
  },
  {
    "operationId": "delete-partners-partner_id-departments-id",
    "toolName": "delete_partners_partner_id_departments_id",
    "method": "DELETE",
    "path": "/partners/{partner_id}/departments/{department_id}",
    "kind": "delete",
    "summary": "Delete a department",
    "mcp": {
      "description": "指定した取引先の指定IDの部署を削除する。",
      "useWhen": "部署を削除する場合。この操作は元に戻せない。"
    },
    "tags": [
      "Department"
    ],
    "parameters": [
      {
        "name": "partner_id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string"
        },
        "description": "取引先ID。get_partnersで取得可能。必須。存在しないIDの場合はエラー。"
      },
      {
        "name": "department_id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string"
        },
        "description": "取引先部署ID。get_partners_id_partner_departmentsで取得可能。必須。存在しないIDの場合はエラー。"
      }
    ],
    "scopes": [
      "mfc/invoice/data.write"
    ],
    "responseStatuses": [
      "204",
      "400",
      "404"
    ],
    "description": "取引先部署の削除"
  },
  {
    "operationId": "get-items",
    "toolName": "get_items",
    "method": "GET",
    "path": "/items",
    "kind": "read",
    "summary": "Get items",
    "mcp": {
      "description": "品目（商品・サービス）の一覧を取得する。名称・コードで絞り込み可能。ページネーション対応。",
      "useWhen": "複数の品目を一覧・検索する場合。名称やコードで品目を探す場合。",
      "doNotUseWhen": "品目IDが既知で1件だけ取得する場合はget_items_idを使用。"
    },
    "tags": [
      "Item"
    ],
    "parameters": [
      {
        "name": "name",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string"
        },
        "description": "品目名で絞り込む。部分一致検索。カンマ区切りで複数指定可能。"
      },
      {
        "name": "code",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string"
        },
        "description": "品目コードで絞り込む。カンマ区切りで複数指定可能。"
      },
      {
        "name": "page",
        "in": "query",
        "required": false,
        "schema": {
          "type": "integer"
        },
        "description": "取得するページ番号。1以上の整数。default: 1。"
      },
      {
        "name": "per_page",
        "in": "query",
        "required": false,
        "schema": {
          "type": "integer"
        },
        "description": "1ページあたりの取得件数。default: 100。"
      }
    ],
    "scopes": [
      "mfc/invoice/data.write",
      "mfc/invoice/data.read"
    ],
    "responseStatuses": [
      "200"
    ],
    "description": "品目一覧の取得"
  },
  {
    "operationId": "post-items",
    "toolName": "post_items",
    "method": "POST",
    "path": "/items",
    "kind": "create",
    "summary": "Create new item",
    "mcp": {
      "description": "品目（商品・サービス）を新規作成する。",
      "useWhen": "新しい品目を登録する場合。",
      "doNotUseWhen": "既存の品目を更新する場合はput_items_idを使用。"
    },
    "tags": [
      "Item"
    ],
    "parameters": [],
    "scopes": [
      "mfc/invoice/data.write"
    ],
    "responseStatuses": [
      "201",
      "400"
    ],
    "description": "品目の作成",
    "requestBody": {
      "required": false,
      "schema": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "minLength": 1,
            "maxLength": 450
          },
          "code": {
            "type": "string",
            "minLength": 1,
            "maxLength": 30
          },
          "detail": {
            "type": "string",
            "maxLength": 200
          },
          "unit": {
            "type": "string",
            "maxLength": 20
          },
          "price": {
            "type": "number",
            "minimum": "-10_000_000_000",
            "maximum": "10_000_000_000"
          },
          "quantity": {
            "type": "number",
            "minimum": "-10_000_000_000",
            "maximum": "10_000_000_000"
          },
          "is_deduct_withholding_tax": {
            "type": "boolean",
            "description": "源泉徴収税額の有り無し:\n  * 事業者が法人の時: null\n  * 事業者が個人事業主: true or false\n"
          },
          "excise": {
            "type": "string",
            "description": "税率:\n  * `untaxable` - 不課税\n  * `non_taxable` - 非課税\n  * `tax_exemption` - 免税\n  * `five_percent` - 5%\n  * `eight_percent` - 8%\n  * `eight_percent_as_reduced_tax_rate` - 8%(軽減税率)\n  * `ten_percent` - 10%\n",
            "enum": [
              "untaxable",
              "non_taxable",
              "tax_exemption",
              "five_percent",
              "eight_percent",
              "eight_percent_as_reduced_tax_rate",
              "ten_percent"
            ]
          }
        },
        "required": [
          "name",
          "excise"
        ]
      },
      "description": "Request body for creating a Item"
    }
  },
  {
    "operationId": "get-items-id",
    "toolName": "get_items_id",
    "method": "GET",
    "path": "/items/{item_id}",
    "kind": "read",
    "summary": "Get an item",
    "mcp": {
      "description": "指定したIDの品目を1件取得する。",
      "useWhen": "品目IDが既知で、その1件の詳細を取得する場合。",
      "doNotUseWhen": "複数件の一覧・検索が必要な場合はget_itemsを使用。"
    },
    "tags": [
      "Item"
    ],
    "parameters": [
      {
        "name": "item_id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string"
        },
        "description": "品目ID。get_itemsで取得可能。必須。存在しないIDの場合はエラー。"
      }
    ],
    "scopes": [
      "mfc/invoice/data.write",
      "mfc/invoice/data.read"
    ],
    "responseStatuses": [
      "200",
      "404"
    ],
    "description": "品目の取得"
  },
  {
    "operationId": "put-items-id",
    "toolName": "put_items_id",
    "method": "PUT",
    "path": "/items/{item_id}",
    "kind": "update",
    "summary": "Update an item",
    "mcp": {
      "description": "指定したIDの品目情報を更新する。",
      "useWhen": "既存の品目情報を変更する場合。"
    },
    "tags": [
      "Item"
    ],
    "parameters": [
      {
        "name": "item_id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string"
        },
        "description": "品目ID。get_itemsで取得可能。必須。存在しないIDの場合はエラー。"
      }
    ],
    "scopes": [
      "mfc/invoice/data.write"
    ],
    "responseStatuses": [
      "200",
      "400"
    ],
    "description": "品目の更新",
    "requestBody": {
      "required": false,
      "schema": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "minLength": 1,
            "maxLength": 450
          },
          "code": {
            "type": "string",
            "minLength": 1,
            "maxLength": 30
          },
          "detail": {
            "type": "string",
            "maxLength": 200
          },
          "unit": {
            "type": "string",
            "maxLength": 20
          },
          "price": {
            "type": "number",
            "minimum": "-10_000_000_000",
            "maximum": "10_000_000_000"
          },
          "quantity": {
            "type": "number",
            "minimum": "-10_000_000_000",
            "maximum": "10_000_000_000"
          },
          "is_deduct_withholding_tax": {
            "type": "boolean",
            "description": "源泉徴収税額の有り無し:\n  * 事業者が法人の時: null\n  * 事業者が個人事業主: true or false\n"
          },
          "excise": {
            "type": "string",
            "description": "税率:\n  * `untaxable` - 不課税\n  * `non_taxable` - 非課税\n  * `tax_exemption` - 免税\n  * `five_percent` - 5%\n  * `eight_percent` - 8%\n  * `eight_percent_as_reduced_tax_rate` - 8%(軽減税率)\n  * `ten_percent` - 10%\n",
            "enum": [
              "untaxable",
              "non_taxable",
              "tax_exemption",
              "five_percent",
              "eight_percent",
              "eight_percent_as_reduced_tax_rate",
              "ten_percent"
            ]
          }
        }
      },
      "description": "Request body for updating a Item"
    }
  },
  {
    "operationId": "delete-items-id",
    "toolName": "delete_items_id",
    "method": "DELETE",
    "path": "/items/{item_id}",
    "kind": "delete",
    "summary": "Delete an item",
    "mcp": {
      "description": "指定したIDの品目を削除する。",
      "useWhen": "品目を削除する場合。この操作は元に戻せない。"
    },
    "tags": [
      "Item"
    ],
    "parameters": [
      {
        "name": "item_id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string"
        },
        "description": "品目ID。get_itemsで取得可能。必須。存在しないIDの場合はエラー。"
      }
    ],
    "scopes": [
      "mfc/invoice/data.write"
    ],
    "responseStatuses": [
      "204",
      "400"
    ],
    "description": "品目の削除"
  },
  {
    "operationId": "get-billings",
    "toolName": "get_billings",
    "method": "GET",
    "path": "/billings",
    "kind": "read",
    "summary": "Get billings",
    "mcp": {
      "description": "請求書の一覧を取得する。期間・ステータス・取引先・請求書番号・タグなどで絞り込み可能。ページネーション対応。",
      "useWhen": "複数の請求書を一覧・検索する場合。期間やステータス、取引先で絞り込む場合。",
      "doNotUseWhen": "請求書IDが既知で1件取得する場合はget_billings_idを使用。"
    },
    "tags": [
      "Billing"
    ],
    "parameters": [
      {
        "name": "page",
        "in": "query",
        "required": false,
        "schema": {
          "type": "integer",
          "minimum": 1
        },
        "description": "取得するページ番号。1以上の整数。default: 1。"
      },
      {
        "name": "per_page",
        "in": "query",
        "required": false,
        "schema": {
          "type": "integer",
          "minimum": 1,
          "maximum": 100
        },
        "description": "1ページあたりの取得件数。1〜100の整数。default: 100。"
      },
      {
        "name": "range_key",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string",
          "enum": [
            "billing_date",
            "due_date",
            "sales_date",
            "created_at",
            "updated_at"
          ]
        },
        "description": "期間絞込の対象日付項目。from/toと併用する。指定可能な値: billing_date(請求日), due_date(支払期限日), sales_date(売上計上日), created_at(作成日), updated_at(更新日)。"
      },
      {
        "name": "from",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string",
          "format": "date"
        },
        "description": "期間絞込の開始日。YYYY-MM-DD形式。range_keyで指定した日付項目が対象。"
      },
      {
        "name": "to",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string",
          "format": "date"
        },
        "description": "期間絞込の終了日。YYYY-MM-DD形式。range_keyで指定した日付項目が対象。"
      },
      {
        "name": "q",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string"
        },
        "description": "横断検索文字列。取引先(完全一致)・ステータス・件名などを対象に検索する。指定するとdocument_number/status/partner_name/tagsは検索に使用されない。"
      },
      {
        "name": "partner_id",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string"
        },
        "description": "取引先IDで絞り込む。get_partnersで取得可能。"
      },
      {
        "name": "document_number",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string"
        },
        "description": "請求書番号で絞り込む。qが指定されている場合このパラメータは検索に使用されない。"
      },
      {
        "name": "status",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string"
        },
        "description": "ステータスで絞り込む（例: 下書き, ロック中, 未ロック）。qが指定されている場合このパラメータは検索に使用されない。"
      },
      {
        "name": "partner_name",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string"
        },
        "description": "取引先名で絞り込む。qが指定されている場合このパラメータは検索に使用されない。"
      },
      {
        "name": "tags",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string"
        },
        "description": "タグで絞り込む（例: タグ1, タグ2）。qが指定されている場合このパラメータは検索に使用されない。"
      }
    ],
    "scopes": [
      "mfc/invoice/data.write",
      "mfc/invoice/data.read"
    ],
    "responseStatuses": [
      "200"
    ],
    "description": "請求書の取得"
  },
  {
    "operationId": "post-invoice-template-billings",
    "toolName": "post_invoice_template_billings",
    "method": "POST",
    "path": "/invoice_template_billings",
    "kind": "create",
    "summary": "Create new invoice template billing",
    "mcp": {
      "description": "インボイス制度（適格請求書）に対応した形式の請求書を新規作成する。",
      "useWhen": "インボイス制度対応形式の請求書を新規作成する場合。",
      "doNotUseWhen": "既存の請求書を更新する場合はput_billings_idを使用。"
    },
    "tags": [
      "Billing"
    ],
    "parameters": [],
    "scopes": [
      "mfc/invoice/data.write"
    ],
    "responseStatuses": [
      "201",
      "400"
    ],
    "description": "インボイス制度に対応した形式の請求書の作成",
    "requestBody": {
      "required": false,
      "schema": {
        "type": "object",
        "properties": {
          "department_id": {
            "type": "string"
          },
          "title": {
            "type": "string",
            "maxLength": 200
          },
          "memo": {
            "type": "string",
            "maxLength": 450
          },
          "payment_condition": {
            "type": "string",
            "maxLength": 250
          },
          "billing_date": {
            "type": "string",
            "format": "date"
          },
          "due_date": {
            "type": "string",
            "format": "date",
            "description": "If due_date is blank and the customer has a payment due date, the payment due date will be set based on billing_date.\nIf due_date is blank and the customer does not have a payment due date, an error will occur.\n"
          },
          "sales_date": {
            "type": "string",
            "format": "date"
          },
          "billing_number": {
            "type": "string",
            "maxLength": 30
          },
          "note": {
            "type": "string",
            "maxLength": 2000
          },
          "document_name": {
            "type": "string",
            "maxLength": 25
          },
          "tag_names": {
            "type": "array",
            "items": {
              "type": "string",
              "maxLength": 255
            }
          },
          "items": {
            "type": "array",
            "description": "`item_id`を指定しない場合、`excise`は必須となります。",
            "items": {
              "type": "object",
              "properties": {
                "item_id": {
                  "type": "string"
                },
                "name": {
                  "type": "string",
                  "description": "`item_id`を指定した場合は、こちらの`name`を指定しても、`item_id`に紐づいたマスタitemのnameで登録します。",
                  "minLength": 1,
                  "maxLength": 450
                },
                "delivery_number": {
                  "type": "string",
                  "maxLength": 30
                },
                "delivery_date": {
                  "type": "string",
                  "format": "date"
                },
                "detail": {
                  "type": "string",
                  "maxLength": 200
                },
                "unit": {
                  "type": "string",
                  "maxLength": 20
                },
                "price": {
                  "type": "number",
                  "minimum": "-10_000_000_000",
                  "maximum": "10_000_000_000"
                },
                "quantity": {
                  "type": "number",
                  "minimum": "-10_000_000_000",
                  "maximum": "10_000_000_000"
                },
                "is_deduct_withholding_tax": {
                  "type": "boolean",
                  "description": "源泉徴収税額の有り無し:\n  * 事業者が法人の時: null\n  * 事業者が個人事業主: true or false\n"
                },
                "excise": {
                  "type": "string",
                  "enum": [
                    "untaxable",
                    "non_taxable",
                    "tax_exemption",
                    "five_percent",
                    "eight_percent",
                    "eight_percent_as_reduced_tax_rate",
                    "ten_percent"
                  ]
                }
              }
            }
          }
        },
        "required": [
          "department_id",
          "billing_date"
        ]
      },
      "description": "Request body for creating a billing"
    }
  },
  {
    "operationId": "get-billings-id",
    "toolName": "get_billings_id",
    "method": "GET",
    "path": "/billings/{billing_id}",
    "kind": "read",
    "summary": "Get a billing",
    "mcp": {
      "description": "指定したIDの請求書を1件取得する。",
      "useWhen": "請求書IDが既知で、その1件の詳細を取得する場合。",
      "doNotUseWhen": "複数件の一覧・検索が必要な場合はget_billingsを使用。"
    },
    "tags": [
      "Billing"
    ],
    "parameters": [
      {
        "name": "billing_id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string"
        },
        "description": "請求書ID。get_billingsで取得可能。必須。存在しないIDの場合はエラー。"
      }
    ],
    "scopes": [
      "mfc/invoice/data.write",
      "mfc/invoice/data.read"
    ],
    "responseStatuses": [
      "200",
      "404"
    ],
    "description": "請求書の取得"
  },
  {
    "operationId": "put-billings-id",
    "toolName": "put_billings_id",
    "method": "PUT",
    "path": "/billings/{billing_id}",
    "kind": "update",
    "summary": "Update a billing",
    "mcp": {
      "description": "指定したIDの請求書の内容を更新する。",
      "useWhen": "既存の請求書の内容を変更する場合。",
      "doNotUseWhen": "入金ステータスのみ変更する場合はput_billings_billing_id_payment_statusを使用。"
    },
    "tags": [
      "Billing"
    ],
    "parameters": [
      {
        "name": "billing_id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string"
        },
        "description": "請求書ID。get_billingsで取得可能。必須。存在しないIDの場合はエラー。"
      }
    ],
    "scopes": [
      "mfc/invoice/data.write"
    ],
    "responseStatuses": [
      "200"
    ],
    "description": "請求書の更新",
    "requestBody": {
      "required": false,
      "schema": {
        "type": "object",
        "properties": {
          "department_id": {
            "type": "string"
          },
          "title": {
            "type": "string",
            "minLength": 1,
            "maxLength": 200
          },
          "memo": {
            "type": "string",
            "maxLength": 450
          },
          "payment_condition": {
            "type": "string",
            "maxLength": 250
          },
          "billing_date": {
            "type": "string",
            "format": "date"
          },
          "due_date": {
            "type": "string",
            "format": "date"
          },
          "sales_date": {
            "type": "string",
            "format": "date"
          },
          "billing_number": {
            "type": "string",
            "maxLength": 30
          },
          "note": {
            "type": "string",
            "maxLength": 2000
          },
          "document_name": {
            "type": "string",
            "maxLength": 25
          },
          "tag_names": {
            "type": "array",
            "items": {
              "type": "string",
              "maxLength": 255
            }
          }
        }
      },
      "description": "Request body for updating a billing"
    }
  },
  {
    "operationId": "delete-billings-id",
    "toolName": "delete_billings_id",
    "method": "DELETE",
    "path": "/billings/{billing_id}",
    "kind": "delete",
    "summary": "Delete a billing",
    "mcp": {
      "description": "指定したIDの請求書を削除する。",
      "useWhen": "請求書を削除する場合。この操作は元に戻せない。"
    },
    "tags": [
      "Billing"
    ],
    "parameters": [
      {
        "name": "billing_id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string"
        },
        "description": "請求書ID。get_billingsで取得可能。必須。存在しないIDの場合はエラー。"
      }
    ],
    "scopes": [
      "mfc/invoice/data.write"
    ],
    "responseStatuses": [
      "204"
    ],
    "description": "請求書の削除"
  },
  {
    "operationId": "get-billings-id-items",
    "toolName": "get_billings_id_items",
    "method": "GET",
    "path": "/billings/{billing_id}/items",
    "kind": "read",
    "summary": "Get BillingItems of a billing",
    "mcp": {
      "description": "指定した請求書に紐づく品目の一覧を取得する。ページネーション対応。",
      "useWhen": "ある請求書に登録された品目を一覧で取得する場合。",
      "doNotUseWhen": "請求書内の特定品目を1件取得する場合はget_billings_billing_id_items_idを使用。"
    },
    "tags": [
      "Billing"
    ],
    "parameters": [
      {
        "name": "billing_id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string"
        },
        "description": "請求書ID。get_billingsで取得可能。必須。存在しないIDの場合はエラー。"
      }
    ],
    "scopes": [
      "mfc/invoice/data.write",
      "mfc/invoice/data.read"
    ],
    "responseStatuses": [
      "200",
      "404"
    ],
    "description": "請求書に紐づく品目一覧の取得"
  },
  {
    "operationId": "post-billings-id-items",
    "toolName": "post_billings_id_items",
    "method": "POST",
    "path": "/billings/{billing_id}/items",
    "kind": "create",
    "summary": "Attach a BillingItem into a billing",
    "mcp": {
      "description": "指定した請求書に品目を追加する。",
      "useWhen": "請求書に品目を追加する場合。",
      "doNotUseWhen": "請求書から品目を削除する場合はdelete_billings_billing_id_items_idを使用。"
    },
    "tags": [
      "Billing"
    ],
    "parameters": [
      {
        "name": "billing_id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string"
        },
        "description": "請求書ID。get_billingsで取得可能。必須。存在しないIDの場合はエラー。"
      }
    ],
    "scopes": [
      "mfc/invoice/data.write"
    ],
    "responseStatuses": [
      "201",
      "400",
      "404"
    ],
    "description": "請求書に品目を追加",
    "requestBody": {
      "required": false,
      "schema": {
        "type": "object",
        "description": "`item_id`を指定しない場合、`excise`は必須となります。",
        "properties": {
          "item_id": {
            "type": "string"
          },
          "name": {
            "type": "string",
            "description": "`item_id`を指定した場合は、こちらの`name`を指定しても、`item_id`に紐づいたマスタitemのnameで登録します。",
            "minLength": 1,
            "maxLength": 450
          },
          "delivery_number": {
            "type": "string",
            "maxLength": 30
          },
          "delivery_date": {
            "type": "string",
            "format": "date"
          },
          "detail": {
            "type": "string",
            "maxLength": 200
          },
          "unit": {
            "type": "string",
            "maxLength": 20
          },
          "price": {
            "type": "number",
            "minimum": "-10_000_000_000",
            "maximum": "10_000_000_000"
          },
          "quantity": {
            "type": "number",
            "minimum": "-10_000_000_000",
            "maximum": "10_000_000_000"
          },
          "is_deduct_withholding_tax": {
            "type": "boolean",
            "description": "源泉徴収税額の有り無し:\n  * 事業者が法人の時: null\n  * 事業者が個人事業主: true or false\n"
          },
          "excise": {
            "type": "string",
            "enum": [
              "untaxable",
              "non_taxable",
              "tax_exemption",
              "five_percent",
              "eight_percent",
              "eight_percent_as_reduced_tax_rate",
              "ten_percent"
            ]
          }
        }
      }
    }
  },
  {
    "operationId": "get-billings-billing_id-items-id",
    "toolName": "get_billings_billing_id_items_id",
    "method": "GET",
    "path": "/billings/{billing_id}/items/{item_id}",
    "kind": "read",
    "summary": "Get a BillingItem if a billing has",
    "mcp": {
      "description": "指定した請求書に紐づく指定IDの品目を1件取得する。",
      "useWhen": "請求書内の特定の品目の詳細を取得する場合。",
      "doNotUseWhen": "請求書内の品目を一覧で取得する場合はget_billings_id_itemsを使用。"
    },
    "tags": [
      "Billing"
    ],
    "parameters": [
      {
        "name": "billing_id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string"
        },
        "description": "請求書ID。get_billingsで取得可能。必須。存在しないIDの場合はエラー。"
      },
      {
        "name": "item_id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string"
        },
        "description": "品目ID（請求書に紐づくもの）。get_billings_id_itemsで取得可能。必須。存在しないIDの場合はエラー。"
      }
    ],
    "scopes": [
      "mfc/invoice/data.write",
      "mfc/invoice/data.read"
    ],
    "responseStatuses": [
      "200",
      "404"
    ],
    "description": "請求書に紐づく品目の取得"
  },
  {
    "operationId": "delete-billings-billing_id-items-id",
    "toolName": "delete_billings_billing_id_items_id",
    "method": "DELETE",
    "path": "/billings/{billing_id}/items/{item_id}",
    "kind": "delete",
    "summary": "Detach a BillingItem from a billing",
    "mcp": {
      "description": "指定した請求書から指定IDの品目を削除する。",
      "useWhen": "請求書から品目を削除する場合。この操作は元に戻せない。"
    },
    "tags": [
      "Billing"
    ],
    "parameters": [
      {
        "name": "billing_id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string"
        },
        "description": "請求書ID。get_billingsで取得可能。必須。存在しないIDの場合はエラー。"
      },
      {
        "name": "item_id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string"
        },
        "description": "品目ID（請求書に紐づくもの）。get_billings_id_itemsで取得可能。必須。存在しないIDの場合はエラー。"
      }
    ],
    "scopes": [
      "mfc/invoice/data.write"
    ],
    "responseStatuses": [
      "204",
      "400",
      "404"
    ],
    "description": "請求書に紐づく品目の削除"
  },
  {
    "operationId": "put-billings-billing_id-payment_status",
    "toolName": "put_billings_billing_id_payment_status",
    "method": "PUT",
    "path": "/billings/{billing_id}/payment_status",
    "kind": "update",
    "summary": "Update payment status of a billing",
    "mcp": {
      "description": "指定した請求書の入金ステータスを変更する。",
      "useWhen": "請求書の入金状況（未入金・入金済みなど）を更新する場合。",
      "doNotUseWhen": "請求書の内容全体を更新する場合はput_billings_idを使用。"
    },
    "tags": [
      "Billing"
    ],
    "parameters": [
      {
        "name": "billing_id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string"
        },
        "description": "請求書ID。get_billingsで取得可能。必須。存在しないIDの場合はエラー。"
      }
    ],
    "scopes": [
      "mfc/invoice/data.write"
    ],
    "responseStatuses": [
      "200",
      "400",
      "404"
    ],
    "description": "請求書の入金ステータス変更",
    "requestBody": {
      "required": false,
      "schema": {
        "type": "object",
        "required": [
          "payment_status"
        ],
        "properties": {
          "payment_status": {
            "type": "string",
            "description": "入金ステータス::\n  * `0` -  未設定\n  * `1` -  未入金\n  * `2` - 入金済み\n",
            "enum": [
              "0",
              "1",
              "2"
            ]
          }
        }
      }
    }
  },
  {
    "operationId": "post-billings-billing_id-posting",
    "toolName": "post_billings_billing_id_posting",
    "method": "POST",
    "path": "/billings/{billing_id}/posting",
    "kind": "create",
    "summary": "Apply to post the billing",
    "mcp": {
      "description": "指定した請求書の郵送を依頼する。クラウドBoxへの保存可否を指定可能。",
      "useWhen": "請求書を郵送依頼する場合。",
      "doNotUseWhen": "郵送依頼をキャンセルする場合はdelete_billings_billing_id_postingを使用。"
    },
    "tags": [
      "Billing"
    ],
    "parameters": [
      {
        "name": "billing_id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string"
        },
        "description": "請求書ID。get_billingsで取得可能。必須。存在しないIDの場合はエラー。"
      }
    ],
    "scopes": [
      "mfc/invoice/data.write"
    ],
    "responseStatuses": [
      "201",
      "400",
      "402",
      "404",
      "422"
    ],
    "description": "請求書の郵送依頼",
    "requestBody": {
      "required": false,
      "schema": {
        "type": "object",
        "properties": {
          "upload_to_cloud_box": {
            "type": "boolean",
            "default": true,
            "description": "クラウドBoxに保存するかどうか\n  * `true` - クラウドBoxに保存する\n  * `false` - クラウドBoxに保存しない\n"
          }
        }
      }
    }
  },
  {
    "operationId": "delete-billings-billing_id-posting",
    "toolName": "delete_billings_billing_id_posting",
    "method": "DELETE",
    "path": "/billings/{billing_id}/posting",
    "kind": "delete",
    "summary": "Cancel to post the billing",
    "mcp": {
      "description": "指定した請求書の郵送依頼をキャンセルする。",
      "useWhen": "請求書の郵送依頼を取り消す場合。",
      "doNotUseWhen": "郵送を新たに依頼する場合はpost_billings_billing_id_postingを使用。"
    },
    "tags": [
      "Billing"
    ],
    "parameters": [
      {
        "name": "billing_id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string"
        },
        "description": "請求書ID。get_billingsで取得可能。必須。存在しないIDの場合はエラー。"
      }
    ],
    "scopes": [
      "mfc/invoice/data.write"
    ],
    "responseStatuses": [
      "204",
      "400",
      "404"
    ],
    "description": "請求書の郵送キャンセル"
  },
  {
    "operationId": "get-quotes",
    "toolName": "get_quotes",
    "method": "GET",
    "path": "/quotes",
    "kind": "read",
    "summary": "Get quotes",
    "mcp": {
      "description": "見積書の一覧を取得する。期間・ステータス・取引先・見積書番号・タグなどで絞り込み可能。ページネーション対応。",
      "useWhen": "複数の見積書を一覧・検索する場合。期間やステータス、取引先で絞り込む場合。",
      "doNotUseWhen": "見積書IDが既知で1件取得する場合はget_quotes_quote_idを使用。"
    },
    "tags": [
      "Quote"
    ],
    "parameters": [
      {
        "name": "page",
        "in": "query",
        "required": false,
        "schema": {
          "type": "integer",
          "minimum": 1
        },
        "description": "取得するページ番号。1以上の整数。default: 1。"
      },
      {
        "name": "per_page",
        "in": "query",
        "required": false,
        "schema": {
          "type": "integer",
          "maximum": 100,
          "minimum": 1
        },
        "description": "1ページあたりの取得件数。1〜100の整数。default: 100。"
      },
      {
        "name": "range_key",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string",
          "enum": [
            "quote_date",
            "expired_date",
            "created_at",
            "updated_at"
          ]
        },
        "description": "期間絞込の対象日付項目。from/toと併用する。指定可能な値: quote_date(見積日), expired_date(有効期限), created_at(作成日時), updated_at(更新日時)。"
      },
      {
        "name": "from",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string",
          "format": "date"
        },
        "description": "期間絞込の開始日。YYYY-MM-DD形式。range_keyで指定した日付項目が対象。"
      },
      {
        "name": "to",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string",
          "format": "date"
        },
        "description": "期間絞込の終了日。YYYY-MM-DD形式。range_keyで指定した日付項目が対象。"
      },
      {
        "name": "q",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string"
        },
        "description": "横断検索文字列。取引先(完全一致)・ステータス・件名などを対象に検索する。指定するとdocument_number/status/partner_name/tagsは検索に使用されない。"
      },
      {
        "name": "partner_id",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string"
        },
        "description": "取引先IDで絞り込む。get_partnersで取得可能。"
      },
      {
        "name": "document_number",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string"
        },
        "description": "見積書番号で絞り込む。qが指定されている場合このパラメータは検索に使用されない。"
      },
      {
        "name": "status",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string"
        },
        "description": "ステータスで絞り込む（例: 下書き, ロック中, 未ロック）。qが指定されている場合このパラメータは検索に使用されない。"
      },
      {
        "name": "partner_name",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string"
        },
        "description": "取引先名で絞り込む。qが指定されている場合このパラメータは検索に使用されない。"
      },
      {
        "name": "tags",
        "in": "query",
        "required": false,
        "schema": {
          "type": "string"
        },
        "description": "タグで絞り込む（例: タグ1, タグ2）。qが指定されている場合このパラメータは検索に使用されない。"
      }
    ],
    "scopes": [
      "mfc/invoice/data.write",
      "mfc/invoice/data.read"
    ],
    "responseStatuses": [
      "200"
    ],
    "description": "見積書一覧の取得"
  },
  {
    "operationId": "post-quotes",
    "toolName": "post_quotes",
    "method": "POST",
    "path": "/quotes",
    "kind": "create",
    "summary": "Create new quote",
    "mcp": {
      "description": "見積書を新規作成する。",
      "useWhen": "新しい見積書を作成する場合。",
      "doNotUseWhen": "既存の見積書を更新する場合はput_quotes_quote_idを使用。"
    },
    "tags": [
      "Quote"
    ],
    "parameters": [],
    "scopes": [
      "mfc/invoice/data.write"
    ],
    "responseStatuses": [
      "201",
      "400"
    ],
    "description": "見積書の作成",
    "requestBody": {
      "required": false,
      "schema": {
        "type": "object",
        "properties": {
          "department_id": {
            "type": "string"
          },
          "quote_number": {
            "type": "string",
            "maxLength": 30
          },
          "title": {
            "type": "string",
            "maxLength": 200
          },
          "memo": {
            "type": "string",
            "maxLength": 450
          },
          "quote_date": {
            "type": "string",
            "format": "date"
          },
          "expired_date": {
            "type": "string",
            "format": "date"
          },
          "note": {
            "type": "string",
            "maxLength": 2000
          },
          "tag_names": {
            "type": "array",
            "items": {
              "type": "string",
              "maxLength": 255
            }
          },
          "document_name": {
            "type": "string",
            "maxLength": 25
          },
          "items": {
            "type": "array",
            "description": "`item_id`を指定しない場合、`excise`は必須となります。",
            "items": {
              "type": "object",
              "properties": {
                "item_id": {
                  "type": "string"
                },
                "name": {
                  "type": "string",
                  "description": "`item_id`を指定した場合は、こちらの`name`を指定しても、`item_id`に紐づいたマスタitemのnameで登録します。",
                  "minLength": 1,
                  "maxLength": 450
                },
                "detail": {
                  "type": "string",
                  "maxLength": 200
                },
                "unit": {
                  "type": "string",
                  "maxLength": 20
                },
                "price": {
                  "type": "number",
                  "minimum": "-10_000_000_000",
                  "maximum": "10_000_000_000"
                },
                "quantity": {
                  "type": "number",
                  "minimum": "-10_000_000_000",
                  "maximum": "10_000_000_000"
                },
                "is_deduct_withholding_tax": {
                  "type": "boolean",
                  "description": "源泉徴収税額の有り無し:\n  * 事業者が法人の時: null\n  * 事業者が個人事業主: true or false\n"
                },
                "excise": {
                  "type": "string",
                  "enum": [
                    "untaxable",
                    "non_taxable",
                    "tax_exemption",
                    "five_percent",
                    "eight_percent",
                    "eight_percent_as_reduced_tax_rate",
                    "ten_percent"
                  ]
                }
              }
            }
          }
        },
        "required": [
          "department_id",
          "quote_date",
          "expired_date"
        ]
      },
      "description": "Request body for creating a quote"
    }
  },
  {
    "operationId": "get-quotes-quote_id",
    "toolName": "get_quotes_quote_id",
    "method": "GET",
    "path": "/quotes/{quote_id}",
    "kind": "read",
    "summary": "Get a quote",
    "mcp": {
      "description": "指定したIDの見積書を1件取得する。",
      "useWhen": "見積書IDが既知で、その1件の詳細を取得する場合。",
      "doNotUseWhen": "複数件の一覧・検索が必要な場合はget_quotesを使用。"
    },
    "tags": [
      "Quote"
    ],
    "parameters": [
      {
        "name": "quote_id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string"
        },
        "description": "見積書ID。get_quotesで取得可能。必須。存在しないIDの場合はエラー。"
      }
    ],
    "scopes": [
      "mfc/invoice/data.write",
      "mfc/invoice/data.read"
    ],
    "responseStatuses": [
      "200",
      "404"
    ],
    "description": "見積書の取得"
  },
  {
    "operationId": "put-quotes-quote_id",
    "toolName": "put_quotes_quote_id",
    "method": "PUT",
    "path": "/quotes/{quote_id}",
    "kind": "update",
    "summary": "Update a quote",
    "mcp": {
      "description": "指定したIDの見積書の内容を更新する。",
      "useWhen": "既存の見積書の内容を変更する場合。",
      "doNotUseWhen": "受注ステータスのみ変更する場合はput_quote_quote_id_order_statusを使用。"
    },
    "tags": [
      "Quote"
    ],
    "parameters": [
      {
        "name": "quote_id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string"
        },
        "description": "見積書ID。get_quotesで取得可能。必須。存在しないIDの場合はエラー。"
      }
    ],
    "scopes": [
      "mfc/invoice/data.write"
    ],
    "responseStatuses": [
      "200",
      "400",
      "404"
    ],
    "description": "見積書の更新",
    "requestBody": {
      "required": false,
      "schema": {
        "type": "object",
        "properties": {
          "department_id": {
            "type": "string"
          },
          "quote_number": {
            "type": "string",
            "maxLength": 30
          },
          "title": {
            "type": "string",
            "minLength": 1,
            "maxLength": 200
          },
          "memo": {
            "type": "string",
            "maxLength": 450
          },
          "quote_date": {
            "type": "string",
            "format": "date"
          },
          "expired_date": {
            "type": "string",
            "format": "date"
          },
          "note": {
            "type": "string",
            "maxLength": 2000
          },
          "tag_names": {
            "type": "array",
            "items": {
              "type": "string",
              "maxLength": 255
            }
          },
          "document_name": {
            "type": "string",
            "maxLength": 25
          }
        }
      },
      "description": "Request body for updating a quote"
    }
  },
  {
    "operationId": "delete-quotes-quote_id",
    "toolName": "delete_quotes_quote_id",
    "method": "DELETE",
    "path": "/quotes/{quote_id}",
    "kind": "delete",
    "summary": "Delete a quote",
    "mcp": {
      "description": "指定したIDの見積書を削除する。",
      "useWhen": "見積書を削除する場合。この操作は元に戻せない。"
    },
    "tags": [
      "Quote"
    ],
    "parameters": [
      {
        "name": "quote_id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string"
        },
        "description": "見積書ID。get_quotesで取得可能。必須。存在しないIDの場合はエラー。"
      }
    ],
    "scopes": [
      "mfc/invoice/data.write"
    ],
    "responseStatuses": [
      "204",
      "400",
      "404"
    ],
    "description": "見積書の削除"
  },
  {
    "operationId": "get-quotes-id-items",
    "toolName": "get_quotes_id_items",
    "method": "GET",
    "path": "/quotes/{quote_id}/items",
    "kind": "read",
    "summary": "Get items of a quote",
    "mcp": {
      "description": "指定した見積書に紐づく品目の一覧を取得する。ページネーション対応。",
      "useWhen": "ある見積書に登録された品目を一覧で取得する場合。",
      "doNotUseWhen": "見積書内の特定品目を1件取得する場合はget_quotes_quote_id_items_idを使用。"
    },
    "tags": [
      "Quote"
    ],
    "parameters": [
      {
        "name": "quote_id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string"
        },
        "description": "見積書ID。get_quotesで取得可能。必須。存在しないIDの場合はエラー。"
      }
    ],
    "scopes": [
      "mfc/invoice/data.write",
      "mfc/invoice/data.read"
    ],
    "responseStatuses": [
      "200",
      "404"
    ],
    "description": "見積書に紐づく品目一覧の取得"
  },
  {
    "operationId": "post-quotes-quote_id-items",
    "toolName": "post_quotes_quote_id_items",
    "method": "POST",
    "path": "/quotes/{quote_id}/items",
    "kind": "create",
    "summary": "Attach an item into a quote",
    "mcp": {
      "description": "指定した見積書に品目を追加する。",
      "useWhen": "見積書に品目を追加する場合。",
      "doNotUseWhen": "見積書から品目を削除する場合はdelete_quotes_quote_id_items_idを使用。"
    },
    "tags": [
      "Quote"
    ],
    "parameters": [
      {
        "name": "quote_id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string"
        },
        "description": "見積書ID。get_quotesで取得可能。必須。存在しないIDの場合はエラー。"
      }
    ],
    "scopes": [
      "mfc/invoice/data.write"
    ],
    "responseStatuses": [
      "201",
      "400",
      "404"
    ],
    "description": "見積書に品目を追加",
    "requestBody": {
      "required": false,
      "schema": {
        "type": "object",
        "description": "`item_id`を指定しない場合、`excise`は必須となります。",
        "properties": {
          "item_id": {
            "type": "string"
          },
          "name": {
            "type": "string",
            "description": "`item_id`を指定した場合は、こちらの`name`を指定しても、`item_id`に紐づいたマスタitemのnameで登録します。",
            "minLength": 1,
            "maxLength": 450
          },
          "detail": {
            "type": "string",
            "maxLength": 200
          },
          "unit": {
            "type": "string",
            "maxLength": 20
          },
          "price": {
            "type": "number",
            "minimum": "-10_000_000_000",
            "maximum": "10_000_000_000"
          },
          "quantity": {
            "type": "number",
            "minimum": "-10_000_000_000",
            "maximum": "10_000_000_000"
          },
          "is_deduct_withholding_tax": {
            "type": "boolean",
            "description": "源泉徴収税額の有り無し:\n  * 事業者が法人の時: null\n  * 事業者が個人事業主: true or false\n"
          },
          "excise": {
            "type": "string",
            "enum": [
              "untaxable",
              "non_taxable",
              "tax_exemption",
              "five_percent",
              "eight_percent",
              "eight_percent_as_reduced_tax_rate",
              "ten_percent"
            ]
          }
        }
      }
    }
  },
  {
    "operationId": "get-quotes-quote_id-items-id",
    "toolName": "get_quotes_quote_id_items_id",
    "method": "GET",
    "path": "/quotes/{quote_id}/items/{item_id}",
    "kind": "read",
    "summary": "Get an item if a quote has",
    "mcp": {
      "description": "指定した見積書に紐づく指定IDの品目を1件取得する。",
      "useWhen": "見積書内の特定の品目の詳細を取得する場合。",
      "doNotUseWhen": "見積書内の品目を一覧で取得する場合はget_quotes_id_itemsを使用。"
    },
    "tags": [
      "Quote"
    ],
    "parameters": [
      {
        "name": "quote_id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string"
        },
        "description": "見積書ID。get_quotesで取得可能。必須。存在しないIDの場合はエラー。"
      },
      {
        "name": "item_id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string"
        },
        "description": "品目ID（見積書に紐づくもの）。get_quotes_id_itemsで取得可能。必須。存在しないIDの場合はエラー。"
      }
    ],
    "scopes": [
      "mfc/invoice/data.write",
      "mfc/invoice/data.read"
    ],
    "responseStatuses": [
      "200",
      "404"
    ],
    "description": "見積書に紐づく品目を取得"
  },
  {
    "operationId": "delete-quotes-quote_id-items-id",
    "toolName": "delete_quotes_quote_id_items_id",
    "method": "DELETE",
    "path": "/quotes/{quote_id}/items/{item_id}",
    "kind": "delete",
    "summary": "Detach the item from a quote",
    "mcp": {
      "description": "指定した見積書から指定IDの品目を削除する。",
      "useWhen": "見積書から品目を削除する場合。この操作は元に戻せない。"
    },
    "tags": [
      "Quote"
    ],
    "parameters": [
      {
        "name": "quote_id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string"
        },
        "description": "見積書ID。get_quotesで取得可能。必須。存在しないIDの場合はエラー。"
      },
      {
        "name": "item_id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string"
        },
        "description": "品目ID（見積書に紐づくもの）。get_quotes_id_itemsで取得可能。必須。存在しないIDの場合はエラー。"
      }
    ],
    "scopes": [
      "mfc/invoice/data.write"
    ],
    "responseStatuses": [
      "204",
      "400",
      "404"
    ],
    "description": "見積書に紐づく品目を削除"
  },
  {
    "operationId": "post-quotes-quote_id-posting",
    "toolName": "post_quotes_quote_id_posting",
    "method": "POST",
    "path": "/quotes/{quote_id}/posting",
    "kind": "create",
    "summary": "Apply to post the quote",
    "mcp": {
      "description": "指定した見積書の郵送を依頼する。クラウドBoxへの保存可否を指定可能。",
      "useWhen": "見積書を郵送依頼する場合。",
      "doNotUseWhen": "郵送依頼をキャンセルする場合はdelete_quotes_quote_id_postingを使用。"
    },
    "tags": [
      "Quote"
    ],
    "parameters": [
      {
        "name": "quote_id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string"
        },
        "description": "見積書ID。get_quotesで取得可能。必須。存在しないIDの場合はエラー。"
      }
    ],
    "scopes": [
      "mfc/invoice/data.write"
    ],
    "responseStatuses": [
      "201",
      "400",
      "402",
      "404",
      "422"
    ],
    "description": "見積書の郵送依頼",
    "requestBody": {
      "required": false,
      "schema": {
        "type": "object",
        "properties": {
          "upload_to_cloud_box": {
            "type": "boolean",
            "default": true,
            "description": "クラウドBoxに保存するかどうか\n  * `true` - クラウドBoxに保存する\n  * `false` - クラウドBoxに保存しない\n"
          }
        }
      }
    }
  },
  {
    "operationId": "delete-quotes-quote_id-posting",
    "toolName": "delete_quotes_quote_id_posting",
    "method": "DELETE",
    "path": "/quotes/{quote_id}/posting",
    "kind": "delete",
    "summary": "Cancel to post the quote",
    "mcp": {
      "description": "指定した見積書の郵送依頼をキャンセルする。",
      "useWhen": "見積書の郵送依頼を取り消す場合。",
      "doNotUseWhen": "郵送を新たに依頼する場合はpost_quotes_quote_id_postingを使用。"
    },
    "tags": [
      "Quote"
    ],
    "parameters": [
      {
        "name": "quote_id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string"
        },
        "description": "見積書ID。get_quotesで取得可能。必須。存在しないIDの場合はエラー。"
      }
    ],
    "scopes": [
      "mfc/invoice/data.write"
    ],
    "responseStatuses": [
      "204",
      "400",
      "404"
    ],
    "description": "見積書の郵送キャンセル"
  },
  {
    "operationId": "put-quote-quote_id-order_status",
    "toolName": "put_quote_quote_id_order_status",
    "method": "PUT",
    "path": "/quotes/{quote_id}/order_status",
    "kind": "update",
    "summary": "Update order status of the quote",
    "mcp": {
      "description": "指定した見積書の受注ステータスを更新する。受注ステータスは -1(失注), 0(未設定), 1(未受注), 2(受注済み) のいずれか。",
      "useWhen": "見積書の受注ステータス（失注・未受注・受注済みなど）を変更する場合。",
      "doNotUseWhen": "見積書の内容全体を更新する場合はput_quotes_quote_idを使用。"
    },
    "tags": [
      "Quote"
    ],
    "parameters": [
      {
        "name": "quote_id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string"
        },
        "description": "見積書ID。get_quotesで取得可能。必須。存在しないIDの場合はエラー。"
      }
    ],
    "scopes": [
      "mfc/invoice/data.write"
    ],
    "responseStatuses": [
      "200"
    ],
    "description": "見積書のステータス更新",
    "requestBody": {
      "required": false,
      "schema": {
        "type": "object",
        "properties": {
          "order_status": {
            "type": "string",
            "description": "受注ステータス:\n* `-1` - 失注\n* `0` -  未設定\n* `1` - 未受注\n* `2` -  受注済み\n",
            "enum": [
              "-1",
              "0",
              "1",
              "2"
            ]
          }
        },
        "required": [
          "order_status"
        ]
      }
    }
  },
  {
    "operationId": "post-quotes-quote_id-convert_to_billing",
    "toolName": "post_quotes_quote_id_convert_to_billing",
    "method": "POST",
    "path": "/quotes/{quote_id}/convert_to_billing",
    "kind": "create",
    "summary": "Convert the quote to billing",
    "mcp": {
      "description": "指定した見積書を請求書に変換する。変換により新しい請求書が作成される。",
      "useWhen": "受注した見積書をもとに請求書を作成する場合。"
    },
    "tags": [
      "Quote"
    ],
    "parameters": [
      {
        "name": "quote_id",
        "in": "path",
        "required": true,
        "schema": {
          "type": "string"
        },
        "description": "見積書ID。get_quotesで取得可能。必須。存在しないIDの場合はエラー。"
      }
    ],
    "scopes": [
      "mfc/invoice/data.write"
    ],
    "responseStatuses": [
      "201",
      "404"
    ],
    "description": "見積書を請求書に変換"
  },
  {
    "operationId": "get-sent_histories",
    "toolName": "get_sent_histories",
    "method": "GET",
    "path": "/sent_histories",
    "kind": "read",
    "summary": "Get sent histories",
    "mcp": {
      "description": "請求書・見積書などの書類の送付履歴（メール送付など）の一覧を取得する。ページネーション対応。",
      "useWhen": "書類をいつ・どの宛先に送付したかなどの送付履歴を確認する場合。"
    },
    "tags": [
      "SentHistory"
    ],
    "parameters": [
      {
        "name": "page",
        "in": "query",
        "required": false,
        "schema": {
          "type": "integer",
          "minimum": 1
        },
        "description": "取得するページ番号。1以上の整数。default: 1。"
      },
      {
        "name": "per_page",
        "in": "query",
        "required": false,
        "schema": {
          "type": "integer",
          "minimum": 1,
          "maximum": 100
        },
        "description": "1ページあたりの取得件数。1〜100の整数。default: 100。"
      }
    ],
    "scopes": [
      "mfc/invoice/data.write",
      "mfc/invoice/data.read"
    ],
    "responseStatuses": [
      "200"
    ],
    "description": "送付履歴一覧の取得"
  }
];
