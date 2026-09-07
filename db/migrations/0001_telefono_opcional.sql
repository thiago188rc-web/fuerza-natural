ALTER TABLE "app"."students" DROP CONSTRAINT "students_telefono_check";--> statement-breakpoint
ALTER TABLE "app"."students" ALTER COLUMN "telefono" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."students" ADD CONSTRAINT "students_telefono_check" CHECK ("app"."students"."telefono" is null or "app"."students"."telefono" ~ '^\+[1-9]\d{7,14}$');