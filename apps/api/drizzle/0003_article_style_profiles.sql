CREATE TABLE IF NOT EXISTS "article_style_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"content_type" text NOT NULL,
	"metrics" jsonb NOT NULL,
	"qualitative" jsonb,
	"structural" jsonb,
	"model_used" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "article_style_profiles_article_id_unique" UNIQUE("article_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "article_style_profiles" ADD CONSTRAINT "article_style_profiles_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "style_profiles_content_type_idx" ON "article_style_profiles" USING btree ("content_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "style_profiles_article_id_idx" ON "article_style_profiles" USING btree ("article_id");
