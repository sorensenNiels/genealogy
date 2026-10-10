CREATE TABLE "duplicate_dismissals" (
	"person_a_id" uuid NOT NULL,
	"person_b_id" uuid NOT NULL,
	"dismissed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "duplicate_dismissals_person_a_id_person_b_id_pk" PRIMARY KEY("person_a_id","person_b_id"),
	CONSTRAINT "duplicate_dismissals_ordered" CHECK ("duplicate_dismissals"."person_a_id" < "duplicate_dismissals"."person_b_id")
);
--> statement-breakpoint
ALTER TABLE "duplicate_dismissals" ADD CONSTRAINT "duplicate_dismissals_person_a_id_persons_id_fk" FOREIGN KEY ("person_a_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_dismissals" ADD CONSTRAINT "duplicate_dismissals_person_b_id_persons_id_fk" FOREIGN KEY ("person_b_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_dismissals" ADD CONSTRAINT "duplicate_dismissals_dismissed_by_user_id_fk" FOREIGN KEY ("dismissed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "duplicate_dismissals_person_b_idx" ON "duplicate_dismissals" USING btree ("person_b_id");