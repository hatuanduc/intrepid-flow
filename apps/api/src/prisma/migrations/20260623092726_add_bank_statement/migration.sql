-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" TEXT NOT NULL,
    "account_number" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "bank_name" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_sync_jobs" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "triggered_by" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "error_message" TEXT,
    "logs" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_sync_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_sync_job_accounts" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "bank_account_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rows_downloaded" INTEGER NOT NULL DEFAULT 0,
    "rows_inserted" INTEGER NOT NULL DEFAULT 0,
    "rows_duplicate" INTEGER NOT NULL DEFAULT 0,
    "rows_synced" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_sync_job_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transactions" (
    "id" TEXT NOT NULL,
    "bank_account_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "post_date" TIMESTAMP(3) NOT NULL,
    "narrative" TEXT,
    "bank_reference" TEXT,
    "customer_reference" TEXT,
    "trn_type" TEXT,
    "credit_amount" DECIMAL(18,2),
    "debit_amount" DECIMAL(18,2),
    "balance" DECIMAL(18,2),
    "data_hash" TEXT NOT NULL,
    "raw_data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_download_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "headers" JSONB NOT NULL,
    "header_hash" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_download_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_country_mappings" (
    "id" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_country_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_gsheet_configs" (
    "id" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "spreadsheet_id" TEXT NOT NULL,
    "spreadsheet_url" TEXT,
    "template_sheet_name" TEXT,
    "service_key_json" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_gsheet_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_job_settings" (
    "id" TEXT NOT NULL,
    "schedule_cron" TEXT NOT NULL DEFAULT '30 9 * * *',
    "is_scheduled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_job_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bank_accounts_account_number_key" ON "bank_accounts"("account_number");

-- CreateIndex
CREATE UNIQUE INDEX "bank_transactions_bank_account_id_data_hash_key" ON "bank_transactions"("bank_account_id", "data_hash");

-- CreateIndex
CREATE UNIQUE INDEX "bank_download_templates_name_key" ON "bank_download_templates"("name");

-- CreateIndex
CREATE UNIQUE INDEX "bank_country_mappings_company_name_key" ON "bank_country_mappings"("company_name");

-- CreateIndex
CREATE UNIQUE INDEX "bank_gsheet_configs_country_code_key" ON "bank_gsheet_configs"("country_code");

-- AddForeignKey
ALTER TABLE "bank_sync_job_accounts" ADD CONSTRAINT "bank_sync_job_accounts_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "bank_sync_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_sync_job_accounts" ADD CONSTRAINT "bank_sync_job_accounts_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transactions" ADD CONSTRAINT "bank_transactions_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "bank_sync_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
