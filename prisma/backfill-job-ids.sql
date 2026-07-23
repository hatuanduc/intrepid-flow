-- One-time backfill for BankTransaction.jobIds (see prisma/schema.prisma) — populates the
-- new job_ids array from the existing job_id scalar for rows created before this column
-- existed. Safe to re-run: only touches rows where job_ids is still empty, so it's a no-op
-- once backfilled (new rows always get job_ids set on insert, see bank-sync.service.ts).
UPDATE bank_transactions
SET job_ids = ARRAY[job_id]
WHERE job_ids = '{}';
