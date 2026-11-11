// Our ids are Postgres UUID columns. An id from a URL that isn't a UUID can't match any
// row, and passing it to Postgres raises an error (a 500) instead of simply finding
// nothing. Repositories check with this first and treat a bad id as "not found".
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: string) => UUID_PATTERN.test(value);
