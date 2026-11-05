/**
 * EL N.º DE CADA PAGO EN EL LISTADO — un número para contar, no un id.
 *
 * Es posicional: 1 para el primer pago que se ve, N para el último, en el
 * orden y con el filtro que tenga la pantalla. No se guarda en ningún
 * lado y no reemplaza al id del pago: si se anula o se agrega uno, los
 * números se vuelven a contar solos.
 *
 * Los anulados NO llevan número. Siguen a la vista (el historial es un
 * registro contable), pero si contaran, el último N.º diría más pagos que
 * "Pagos registrados" — y el número existe justamente para que esas dos
 * cuentas se puedan verificar una contra la otra.
 *
 * `inicio` existe para el día que el listado tenga páginas: la página 2
 * arranca donde terminó la 1, no en 1.
 */
export function numeracionVisual(
  pagosEnOrden: readonly { id: string; anulado: boolean }[],
  inicio = 1,
): Map<string, number> {
  const numeros = new Map<string, number>();
  let siguiente = inicio;
  for (const pago of pagosEnOrden) {
    if (pago.anulado) continue;
    numeros.set(pago.id, siguiente++);
  }
  return numeros;
}
