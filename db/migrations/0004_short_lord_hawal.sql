CREATE TABLE "app"."attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gym_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"registrado_por" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."students" ADD COLUMN "genero" text;--> statement-breakpoint
ALTER TABLE "app"."attendance" ADD CONSTRAINT "attendance_gym_id_gyms_id_fk" FOREIGN KEY ("gym_id") REFERENCES "app"."gyms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."attendance" ADD CONSTRAINT "attendance_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "app"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."attendance" ADD CONSTRAINT "attendance_registrado_por_app_users_id_fk" FOREIGN KEY ("registrado_por") REFERENCES "app"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_gym_student_fecha_key" ON "app"."attendance" USING btree ("gym_id","student_id","fecha");--> statement-breakpoint
CREATE INDEX "attendance_gym_fecha_idx" ON "app"."attendance" USING btree ("gym_id","fecha");--> statement-breakpoint
ALTER TABLE "app"."students" ADD CONSTRAINT "students_genero_check" CHECK ("app"."students"."genero" is null or "app"."students"."genero" in ('FEMENINO','MASCULINO','OTRO','PREFIERO_NO_DECIR'));