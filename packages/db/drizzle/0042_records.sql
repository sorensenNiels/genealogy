CREATE TABLE "record_people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"role" text DEFAULT '' NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"sex" text DEFAULT 'U' NOT NULL,
	"age" text DEFAULT '' NOT NULL,
	"marital_status" text DEFAULT '' NOT NULL,
	"occupation" text DEFAULT '' NOT NULL,
	"residence" text DEFAULT '' NOT NULL,
	"birthplace" text DEFAULT '' NOT NULL,
	"person_id" uuid,
	"event_id" uuid,
	"association_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "record_searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"census_key" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "record_searches_person_census_unique" UNIQUE("person_id","census_key")
);
--> statement-breakpoint
CREATE TABLE "records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_type" text NOT NULL,
	"census_key" text,
	"date" jsonb,
	"place" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"source_id" uuid,
	"page" text DEFAULT '' NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"union_id" uuid,
	"created_union" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "record_people" ADD CONSTRAINT "record_people_record_id_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_people" ADD CONSTRAINT "record_people_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_people" ADD CONSTRAINT "record_people_event_id_person_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."person_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_people" ADD CONSTRAINT "record_people_association_id_associations_id_fk" FOREIGN KEY ("association_id") REFERENCES "public"."associations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_searches" ADD CONSTRAINT "record_searches_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_union_id_unions_id_fk" FOREIGN KEY ("union_id") REFERENCES "public"."unions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "record_people_record_idx" ON "record_people" USING btree ("record_id","sort_order");--> statement-breakpoint
CREATE INDEX "record_people_person_idx" ON "record_people" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "records_type_idx" ON "records" USING btree ("record_type");--> statement-breakpoint
CREATE INDEX "records_census_key_idx" ON "records" USING btree ("census_key");