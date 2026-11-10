-- Motivos de baja VIAJE y ENFERMEDAD (pedido del dueño). Se agregan al catálogo
-- de cada gimnasio justo antes de "Otro", sin duplicar si ya existen. Solo datos:
-- no cambia el esquema.
UPDATE "app"."gym_settings" gs
SET "motivos_baja" = (
  SELECT jsonb_agg(
    jsonb_set(m.elem, '{orden}', to_jsonb(m.rn::int))
    ORDER BY m.rn
  )
  FROM (
    SELECT elem, row_number() OVER (ORDER BY grupo, ord) AS rn
    FROM (
      SELECT e.elem,
             CASE WHEN e.elem->>'codigo' = 'OTRO' THEN 1 ELSE 0 END AS grupo,
             e.ord
      FROM jsonb_array_elements(gs."motivos_baja" || (
        SELECT COALESCE(jsonb_agg(n.elem), '[]'::jsonb)
        FROM (VALUES
          ('{"codigo":"VIAJE","etiqueta":"Viaje","activo":true}'::jsonb),
          ('{"codigo":"ENFERMEDAD","etiqueta":"Enfermedad","activo":true}'::jsonb)
        ) AS n(elem)
        WHERE NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(gs."motivos_baja") x
          WHERE x->>'codigo' = n.elem->>'codigo'
        )
      )) WITH ORDINALITY AS e(elem, ord)
    ) t
  ) m
)
WHERE jsonb_typeof(gs."motivos_baja") = 'array';
