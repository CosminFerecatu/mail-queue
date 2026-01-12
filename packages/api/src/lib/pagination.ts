/**
 * Generic pagination helper utilities.
 *
 * Provides reusable functions for adding cursor-based pagination
 * conditions to database queries, reducing code duplication across services.
 */

import { eq, and, lt, or, type SQL } from 'drizzle-orm';
import { parseCursor } from './cursor.js';

export interface PaginationOptions {
  limit?: number;
  cursor?: string;
}

/**
 * Adds cursor-based pagination conditions to a conditions array.
 *
 * This helper encapsulates the common pattern of parsing a cursor and
 * creating the appropriate SQL conditions for descending order pagination.
 *
 * @param conditions - The existing conditions array to append to
 * @param cursor - Optional cursor string from the request
 * @param createdAtColumn - The createdAt column reference from the table
 * @param idColumn - The id column reference from the table
 *
 * @example
 * ```typescript
 * const conditions = [eq(emails.appId, appId)];
 * addPaginationConditions(conditions, cursor, emails.createdAt, emails.id);
 * ```
 */
export function addPaginationConditions<T extends SQL>(
  conditions: T[],
  cursor: string | undefined,
  createdAtColumn: Parameters<typeof eq>[0],
  idColumn: Parameters<typeof eq>[0]
): void {
  const cursorData = parseCursor(cursor);
  if (cursorData) {
    const cursorDate = new Date(cursorData.c);
    // For descending order: get items where (createdAt < cursorCreatedAt)
    // OR (createdAt = cursorCreatedAt AND id < cursorId)
    const paginationCondition = or(
      lt(createdAtColumn, cursorDate),
      and(eq(createdAtColumn, cursorDate), lt(idColumn, cursorData.i))
    );
    if (paginationCondition) {
      conditions.push(paginationCondition as T);
    }
  }
}
