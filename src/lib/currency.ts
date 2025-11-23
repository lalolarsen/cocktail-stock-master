/**
 * Formatea un número como peso chileno (CLP)
 * Ejemplo: 15000 -> "$15.000"
 */
export const formatCLP = (amount: number): string => {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};
