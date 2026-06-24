-- AlterTable
ALTER TABLE "bank_sync_jobs" ADD COLUMN     "is_deleted" BOOLEAN NOT NULL DEFAULT false;
