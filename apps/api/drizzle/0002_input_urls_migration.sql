ALTER TABLE "generation_runs" ADD COLUMN "input_urls" text[];--> statement-breakpoint
ALTER TABLE "generation_runs" DROP COLUMN IF EXISTS "input_url";