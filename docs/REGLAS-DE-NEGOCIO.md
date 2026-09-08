# REGLAS DE NEGOCIO — Fuerza Natural

Reglas **confirmadas por Diego (dueño)**. Este documento es la fuente de
verdad del negocio: si el código y este archivo discrepan, el que está mal
es el código.

Cada regla dice quién la confirmó y cuándo. Lo que NO fue confirmado está
marcado explícitamente como pendiente — y no se implementa hasta que lo
esté. Inventar un valor plausible acá es peor que no tenerlo: un dato
inventado se ve exactamente igual que uno real seis meses después.

---

## 1. Plan "LIBRE"

**Confirmado por Diego — 2026-09-07.**

> "LIBRE" significa 5 días o más por semana, e incluye los sábados.

Los planes del gimnasio son cinco:

| Plan | Días | `acceso` |
|---|---|---|
| 2 días | 2 | `DIAS_FIJOS` |
| 3 días | 3 | `DIAS_FIJOS` |
| 4 días | 4 | `DIAS_FIJOS` |
| 5 días | 5 | `DIAS_FIJOS` |
| LIBRE | 5 (piso) | `LIBRE` |

**LIBRE es una modalidad superior a 5 días, no un plan independiente ni un
alias de "5 días".** Que históricamente haya costado lo mismo que el plan
de 5 días NO lo convierte en el mismo plan: son cosas distintas que hoy
coinciden en precio.

Implementación: `app.plans.acceso` (`DIAS_FIJOS` | `LIBRE`). Para LIBRE,
`dias_semana` se lee como el **piso** de días, no como el total. Un
`dias_semana` solo no podía expresar esto: 5 afirmaría "exactamente 5" y
6 sería inventar un número que nadie confirmó.

LIBRE se muestra como una opción diferenciada en la interfaz, igual que
cualquier otro plan, porque sale de la tabla `plans` — no hay ninguna
lista de planes en el código.

---

## 2. Precios

**Confirmado por Diego — 2026-09-07.** Son los precios **actuales**.

| Modalidad | Precio actual |
|---|---|
| 2 días | $50.000 |
| 3 días | $55.000 |
| 4 días | $60.000 |
| 5 días | $65.000 |
| 1/2 MES | $45.000 |
| **LIBRE** | **PENDIENTE — no confirmado** |

### Los precios NO son constantes del código

Viven como datos del gimnasio:

- Planes → `app.plans.precio_actual`
- 1/2 MES → `app.gym_settings.precio_medio_mes`

Se editan desde Configuración. No hay ningún importe hardcodeado en
`src/` (verificable: `grep -rE "\b(50000|55000|60000|65000|45000)\b" src/`
no devuelve nada).

### Los precios NO aplican retroactivamente

Cada pago guarda su propio **snapshot**: `payments.monto`,
`plan_nombre_snapshot`, `plan_dias_snapshot`. Cambiar un precio hoy no
altera un solo pago ya registrado, y ningún cálculo histórico usa
`plans.precio_actual`. El Data Discovery mostró que los precios subieron
3 veces en 7 meses: recalcular con el precio actual falsearía el historial.

`payments` es inmutable salvo anulación, garantizado por trigger. Corregir
un pago = anular + volver a registrar.

### "Precio no confirmado" es un estado real

`plans.precio_actual` y `gym_settings.precio_medio_mes` son **nullable**.
Hoy LIBRE está en NULL. Un 0 en su lugar diría "este plan es gratis", y
Fase 2 lo autocompletaría como monto del pago.

---

## 3. Modalidad "1/2 MES"

**Confirmado por Diego — 2026-09-07.**

- Precio: $45.000.
- Cubre **15 días / 2 semanas consecutivas**.
- Puede empezar **al principio, en el medio o al final del mes**. La fecha
  de inicio es seleccionable: **NO** se asume el día 1 ni el día 15.
- Se usa cuando la persona no puede asistir el mes completo (viaje, u otro
  motivo).

### NO es un plan

Es una **modalidad temporal de cobertura de un pago**, independiente del
plan habitual del alumno.

Por eso su precio vive en `gym_settings` y **no** como fila de `plans`:
`students.plan_id` referencia `plans`, así que un "1/2 MES" ahí dentro
podría asignarse como plan habitual de alguien — exactamente lo que esta
regla prohíbe. La restricción es estructural, no una convención.

### Qué registra el sistema

Un pago con modalidad `MEDIO_MES` guarda:

| Dato | Dónde |
|---|---|
| Alumno | `payments.student_id` |
| Fecha en que se registró el pago | `payments.fecha_pago` |
| Importe | `payments.monto` (snapshot) |
| Modalidad | `payments.modalidad` = `MEDIO_MES` |
| Plan habitual en ese momento | `payments.plan_id` + `plan_*_snapshot` |
| Fecha de inicio de cobertura | `payment_periods.cubre_desde` |
| Fecha de fin de cobertura | `payment_periods.cubre_hasta` |
| Método de pago | `payments.metodo` |
| Gimnasio | `payments.gym_id` |
| Timestamps | `payments.created_at` |

---

## 4. Un pago NO cambia el plan del alumno

**Confirmado por Diego — 2026-09-07.**

Registrar un pago con una modalidad determinada **no modifica** el plan
habitual del alumno.

Ejemplo confirmado:

```
Alumno con plan habitual: 5 días
Registra:                 1/2 MES ($45.000)
Resultado:
  · Su plan habitual sigue siendo 5 días.
  · El pago cubre 15 días.
  · El plan permanente NO se toca.
```

Esto es coherente con la regla que ya regía desde Fase 1: **ninguna
transición de estado ocurre automáticamente**. Cambiar el plan de un
alumno es una edición explícita de su ficha, y queda registrada como
`CAMBIO_PLAN` en su historial.

---

## 5. Cobertura por período real, nunca "último pago + 30 días"

Un pago cubre un **período**, y ese período se registra con fechas reales
en `payment_periods`:

- `periodo` — el día 1 del mes al que se imputa el tramo. Hace que
  "¿quién tiene cubierto septiembre?" sea un `WHERE` indexado.
- `cubre_desde` / `cubre_hasta` — el rango real cubierto.

Para un mes completo el rango es del día 1 al último día del mes. Para
medio mes, los 15 días que Diego elija. Si un medio mes cruza el fin de
mes (empieza el 25), se genera una fila por cada mes tocado; un CHECK en
la base garantiza que `periodo` es siempre el mes en el que arranca ese
tramo.

El modelo soporta naturalmente meses **no consecutivos** (alguien que en
noviembre paga septiembre y noviembre, salteando octubre).

---

## 6. Estado de la relación ≠ situación de pago

Regla vigente desde Fase 1, **sin cambios**.

- **Estado de la relación** (`students.vinculo`): `ACTIVO`, `PAUSADO`,
  `BAJA`. Es el único estado persistido, y solo cambia por una acción
  humana explícita.
- **Situación de pago**: se **deriva** de `payments` + `payment_periods`
  en el momento de consultarla. No existe, ni va a existir, una columna
  `moroso`, `vencido`, `perdido` o `inactivo`.

Un alumno puede estar `ACTIVO` sin ningún pago registrado, y eso es
correcto.

---

## PENDIENTE DE CONFIRMAR CON DIEGO

1. **Precio de LIBRE.** Es lo único que bloquea que LIBRE sea usable de
   punta a punta. Hoy está en NULL y la interfaz lo mostrará como "precio
   sin configurar". **No inventar un valor** (en particular, no asumir
   $65.000 por analogía con 5 días).

2. **¿Un "1/2 MES" puede cruzar el fin de mes?** Diego dijo "15 días
   consecutivos" y "puede usarse al final del mes". Si alguien empieza el
   25 de septiembre, la cobertura termina el 9 de octubre. El modelo lo
   soporta; falta confirmar si es un caso que ocurre en la práctica o si
   siempre queda dentro del mes.

3. **¿"15 días" son 15 días corridos exactos, o "medio mes"?** Un medio
   mes de febrero (14 días) o de un mes de 31 (15,5) no es exactamente 15.
   Hoy el sistema toma la fecha de fin como un dato explícito, así que no
   necesita decidirlo — pero conviene confirmarlo antes de autocompletar
   la fecha de fin en el formulario de Fase 2.

4. **¿Se pueden encadenar dos "1/2 MES" en el mismo mes?** El modelo lo
   permite (no hay UNIQUE por alumno+período). Falta confirmar si cubrir
   el mes con dos medios meses debe tratarse igual que un mes completo a
   efectos de la situación de pago.

5. **¿LIBRE incluye domingos?** Diego confirmó "5 días o más, incluye
   sábados". No dijo nada de domingos ni de si el gimnasio abre. No se
   asumió nada.
