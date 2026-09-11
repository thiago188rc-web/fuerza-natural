ALTER TABLE "app"."students" DROP CONSTRAINT "students_forma_pago_habitual_check";--> statement-breakpoint
ALTER TABLE "app"."students" DROP CONSTRAINT "students_modalidad_habitual_check";--> statement-breakpoint
ALTER TABLE "app"."students" DROP CONSTRAINT "students_genero_check";--> statement-breakpoint
ALTER TABLE "app"."students" DROP COLUMN "forma_pago_habitual";--> statement-breakpoint
ALTER TABLE "app"."students" DROP COLUMN "modalidad_habitual";--> statement-breakpoint
ALTER TABLE "app"."students" ADD CONSTRAINT "students_genero_check" CHECK ("app"."students"."genero" is null or "app"."students"."genero" in ('FEMENINO','MASCULINO'));