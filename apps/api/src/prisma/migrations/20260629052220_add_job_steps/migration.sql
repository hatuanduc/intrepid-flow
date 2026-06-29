-- AlterTable
ALTER TABLE "bank_sync_jobs" ADD COLUMN     "steps" JSONB NOT NULL DEFAULT '[]';
