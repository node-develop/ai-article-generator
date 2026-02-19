DROP INDEX IF EXISTS "prompts_stage_version_idx";--> statement-breakpoint
ALTER TABLE "generation_runs" ADD COLUMN "content_type" text DEFAULT 'longread' NOT NULL;--> statement-breakpoint
ALTER TABLE "prompts" ADD COLUMN "content_type" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "prompts_stage_version_ct_idx" ON "prompts" USING btree ("stage","version","content_type");