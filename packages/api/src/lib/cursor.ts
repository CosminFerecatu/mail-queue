/**
 * Cursor-based pagination utilities.
 *
 * Cursors encode the position in a result set using the last item's
 * createdAt timestamp and id for stable, consistent pagination.
 *
 * Benefits over offset pagination:
 * - No skipped/duplicated items when data changes between pages
 * - O(1) performance regardless of page depth
 * - Works well with real-time data
 */

export interface CursorData {
  /** ISO timestamp of the last item */
  c: string;
  /** ID of the last item (for tie-breaking) */
  i: string;
}

export interface PaginationResult<T> {
  items: T[];
  cursor: string | null;
  hasMore: boolean;
}

/**
 * Encode pagination position into an opaque cursor string.
 */
export function encodeCursor(createdAt: Date, id: string): string {
  const data: CursorData = {
    c: createdAt.toISOString(),
    i: id,
  };
  return Buffer.from(JSON.stringify(data)).toString('base64url');
}

/**
 * Decode a cursor string into pagination position data.
 * Returns null if cursor is invalid.
 */
export function decodeCursor(cursor: string): CursorData | null {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf-8');
    const data = JSON.parse(json) as CursorData;

    // Validate the parsed data
    if (typeof data.c !== 'string' || typeof data.i !== 'string') {
      return null;
    }

    // Validate timestamp format
    const date = new Date(data.c);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

/**
 * Build pagination result from a fetched list.
 * Expects items to be fetched with limit + 1 to determine hasMore.
 *
 * @param items - Items fetched from database (should include limit + 1 if more exist)
 * @param limit - The requested page size
 * @param getCreatedAt - Function to extract createdAt from an item
 * @param getId - Function to extract id from an item
 */
export function buildPaginationResult<T>(
  items: T[],
  limit: number,
  getCreatedAt: (item: T) => Date,
  getId: (item: T) => string
): PaginationResult<T> {
  const hasMore = items.length > limit;
  const pageItems = hasMore ? items.slice(0, limit) : items;

  let cursor: string | null = null;
  if (pageItems.length > 0) {
    const lastItem = pageItems[pageItems.length - 1];
    if (lastItem) {
      cursor = encodeCursor(getCreatedAt(lastItem), getId(lastItem));
    }
  }

  return {
    items: pageItems,
    cursor,
    hasMore,
  };
}

/**
 * Parse cursor from query parameter, returning null for invalid/missing cursors.
 */
export function parseCursor(cursor: string | undefined): CursorData | null {
  if (!cursor) {
    return null;
  }
  return decodeCursor(cursor);
}
