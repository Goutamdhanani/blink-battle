/**
 * Utility functions for safely formatting numeric values.
 * These functions handle string values from Postgres NUMERIC fields,
 * null/undefined values, and other edge cases.
 */

/**
 * Safely formats a reaction time value to milliseconds.
 * @param value - The value to format (can be number, string, null, or undefined)
 * @returns Formatted string like "123ms" or "-" for invalid values
 */
export const formatReactionTime = (value: number | string | null | undefined): string => {
  const num = typeof value === 'number' ? value : Number(value ?? NaN);
  if (!Number.isFinite(num) || num <= 0) return '-';
  return `${num.toFixed(0)}ms`;
};

/**
 * Safely formats a win rate value to percentage.
 * @param value - The value to format (can be number, string, null, or undefined)
 * @returns Formatted string like "12.3" (without % sign) or "0.0" for invalid values
 */
export const formatWinRate = (value: number | string | null | undefined): string => {
  const num = typeof value === 'number' ? value : Number(value ?? NaN);
  if (!Number.isFinite(num) || num < 0) return '0.0';
  return (num * 100).toFixed(1);
};
