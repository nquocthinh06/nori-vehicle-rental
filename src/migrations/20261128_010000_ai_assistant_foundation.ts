import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-sqlite'

function buildPayloadRelsTableSql(tableName: string): string[] {
  return [
    `CREATE TABLE IF NOT EXISTS \`${tableName}_rels\` (
      \`id\` integer PRIMARY KEY NOT NULL,
      \`order\` integer,
      \`parent_id\` text(36) NOT NULL,
      \`path\` text NOT NULL,
      \`admins_id\` text(36),
      \`users_id\` text(36),
      FOREIGN KEY (\`parent_id\`) REFERENCES \`${tableName}\`(\`id\`) ON UPDATE no action ON DELETE cascade,
      FOREIGN KEY (\`admins_id\`) REFERENCES \`admins\`(\`id\`) ON UPDATE no action ON DELETE cascade,
      FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
    );`,
    `CREATE INDEX IF NOT EXISTS \`${tableName}_rels_order_idx\` ON \`${tableName}_rels\` (\`order\`);`,
    `CREATE INDEX IF NOT EXISTS \`${tableName}_rels_parent_idx\` ON \`${tableName}_rels\` (\`parent_id\`);`,
    `CREATE INDEX IF NOT EXISTS \`${tableName}_rels_path_idx\` ON \`${tableName}_rels\` (\`path\`);`,
    `CREATE INDEX IF NOT EXISTS \`${tableName}_rels_admins_id_idx\` ON \`${tableName}_rels\` (\`admins_id\`);`,
    `CREATE INDEX IF NOT EXISTS \`${tableName}_rels_users_id_idx\` ON \`${tableName}_rels\` (\`users_id\`);`,
  ]
}

export const AI_ASSISTANT_TABLES_AND_INDEXES_SQL = [
  `CREATE TABLE IF NOT EXISTS \`ai_settings\` (
    \`id\` text(36) PRIMARY KEY NOT NULL,
    \`enabled\` integer DEFAULT 1,
    \`greeting_message\` text,
    \`max_output_tokens\` numeric DEFAULT 1000,
    \`max_tool_rounds\` numeric DEFAULT 5,
    \`rate_limit_per_minute\` numeric DEFAULT 5,
    \`rate_limit_per_day\` numeric DEFAULT 30,
    \`daily_budget_usd\` numeric DEFAULT 5,
    \`weight_budget\` numeric DEFAULT 35,
    \`weight_purpose\` numeric DEFAULT 25,
    \`weight_capacity\` numeric DEFAULT 20,
    \`weight_rating\` numeric DEFAULT 10,
    \`weight_fuel\` numeric DEFAULT 10,
    \`knowledge_note\` text,
    \`updated_by_email\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );`,
  `CREATE TABLE IF NOT EXISTS \`ai_settings_quick_suggestions\` (
    \`_order\` integer NOT NULL,
    \`_parent_id\` text(36) NOT NULL,
    \`id\` text PRIMARY KEY NOT NULL,
    \`label\` text NOT NULL,
    \`prompt\` text NOT NULL,
    FOREIGN KEY (\`_parent_id\`) REFERENCES \`ai_settings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );`,
  `CREATE INDEX IF NOT EXISTS \`ai_settings_quick_suggestions_order_idx\` ON \`ai_settings_quick_suggestions\` (\`_order\`);`,
  `CREATE INDEX IF NOT EXISTS \`ai_settings_quick_suggestions_parent_id_idx\` ON \`ai_settings_quick_suggestions\` (\`_parent_id\`);`,

  `CREATE TABLE IF NOT EXISTS \`ai_usage_logs\` (
    \`id\` text(36) PRIMARY KEY NOT NULL,
    \`request_id\` text NOT NULL,
    \`event_type\` text DEFAULT 'CHAT' NOT NULL,
    \`status\` text DEFAULT 'SUCCESS' NOT NULL,
    \`provider\` text DEFAULT 'openai',
    \`model\` text,
    \`user_type\` text DEFAULT 'GUEST',
    \`user_id\` text,
    \`session_hash\` text,
    \`intent\` text,
    \`tools_called\` text,
    \`recommended_model_slugs\` text,
    \`clicked_model_slug\` text,
    \`no_result_found\` integer DEFAULT 0,
    \`input_tokens\` numeric DEFAULT 0,
    \`output_tokens\` numeric DEFAULT 0,
    \`total_tokens\` numeric DEFAULT 0,
    \`estimated_cost_usd\` numeric DEFAULT 0,
    \`latency_ms\` numeric DEFAULT 0,
    \`error_code\` text,
    \`error_category\` text,
    \`guardrail_triggered\` text,
    \`query_summary\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS \`ai_usage_logs_request_id_idx\` ON \`ai_usage_logs\` (\`request_id\`);`,
  `CREATE INDEX IF NOT EXISTS \`ai_usage_logs_event_type_idx\` ON \`ai_usage_logs\` (\`event_type\`);`,
  `CREATE INDEX IF NOT EXISTS \`ai_usage_logs_status_idx\` ON \`ai_usage_logs\` (\`status\`);`,
  `CREATE INDEX IF NOT EXISTS \`ai_usage_logs_model_idx\` ON \`ai_usage_logs\` (\`model\`);`,
  `CREATE INDEX IF NOT EXISTS \`ai_usage_logs_session_hash_idx\` ON \`ai_usage_logs\` (\`session_hash\`);`,
  `CREATE INDEX IF NOT EXISTS \`ai_usage_logs_intent_idx\` ON \`ai_usage_logs\` (\`intent\`);`,
  `CREATE INDEX IF NOT EXISTS \`ai_usage_logs_clicked_model_slug_idx\` ON \`ai_usage_logs\` (\`clicked_model_slug\`);`,
  `CREATE INDEX IF NOT EXISTS \`ai_usage_logs_no_result_found_idx\` ON \`ai_usage_logs\` (\`no_result_found\`);`,
  `CREATE INDEX IF NOT EXISTS \`ai_usage_logs_guardrail_triggered_idx\` ON \`ai_usage_logs\` (\`guardrail_triggered\`);`,
  `CREATE INDEX IF NOT EXISTS \`ai_usage_logs_event_created_idx\` ON \`ai_usage_logs\` (\`event_type\`, \`created_at\` DESC);`,
  `CREATE INDEX IF NOT EXISTS \`ai_usage_logs_status_created_idx\` ON \`ai_usage_logs\` (\`status\`, \`created_at\` DESC);`,
  `CREATE INDEX IF NOT EXISTS \`ai_usage_logs_updated_at_idx\` ON \`ai_usage_logs\` (\`updated_at\`);`,
  `CREATE INDEX IF NOT EXISTS \`ai_usage_logs_created_at_idx\` ON \`ai_usage_logs\` (\`created_at\`);`,

  `CREATE TABLE IF NOT EXISTS \`ai_feedback\` (
    \`id\` text(36) PRIMARY KEY NOT NULL,
    \`request_id\` text NOT NULL,
    \`rating\` text NOT NULL,
    \`reason_category\` text DEFAULT 'OTHER',
    \`comment\` text,
    \`recommended_slugs\` text,
    \`user_type\` text DEFAULT 'GUEST',
    \`review_status\` text DEFAULT 'NEW',
    \`admin_note\` text,
    \`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
    \`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS \`ai_feedback_request_id_idx\` ON \`ai_feedback\` (\`request_id\`);`,
  `CREATE INDEX IF NOT EXISTS \`ai_feedback_rating_idx\` ON \`ai_feedback\` (\`rating\`);`,
  `CREATE INDEX IF NOT EXISTS \`ai_feedback_review_status_idx\` ON \`ai_feedback\` (\`review_status\`);`,
  `CREATE INDEX IF NOT EXISTS \`ai_feedback_updated_at_idx\` ON \`ai_feedback\` (\`updated_at\`);`,
  `CREATE INDEX IF NOT EXISTS \`ai_feedback_created_at_idx\` ON \`ai_feedback\` (\`created_at\`);`,

  ...buildPayloadRelsTableSql('ai_settings'),
  ...buildPayloadRelsTableSql('ai_usage_logs'),
  ...buildPayloadRelsTableSql('ai_feedback'),
]

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const stmt of AI_ASSISTANT_TABLES_AND_INDEXES_SQL) {
    await db.run(sql.raw(stmt))
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  const dropTables = [
    'ai_feedback_rels',
    'ai_feedback',
    'ai_usage_logs_rels',
    'ai_usage_logs',
    'ai_settings_rels',
    'ai_settings_quick_suggestions',
    'ai_settings',
  ]
  for (const tbl of dropTables) {
    await db.run(sql.raw(`DROP TABLE IF EXISTS \`${tbl}\`;`))
  }
}
