/**
 * Audit logging service for payment events.
 *
 * BUG: Memory leak — audit log entries are appended to an unbounded
 * in-memory array. In production with high throughput, this grows
 * indefinitely and eventually causes an OOMKilled.
 */

interface AuditEntry {
  timestamp: Date;
  action: string;
  userId: string;
  resourceId: string;
  metadata: Record<string, unknown>;
  ipAddress: string;
}

// BUG: Memory leak — this array grows unbounded, never trimmed
// In production with ~1000 events/sec, this causes OOMKilled within hours
const auditLog: AuditEntry[] = [];

export interface ParameterizedQuery {
  text: string;
  values: string[];
}

/**
 * Log an audit event.
 * BUG: Never evicts old entries — unbounded memory growth
 */
export function logAuditEvent(
  action: string,
  userId: string,
  resourceId: string,
  metadata: Record<string, unknown> = {},
  ipAddress: string = "0.0.0.0"
): void {
  auditLog.push({
    timestamp: new Date(),
    action,
    userId,
    resourceId,
    metadata,
    ipAddress,
  });
  // BUG: Should have maxSize check and eviction, e.g.:
  // if (auditLog.length > MAX_ENTRIES) auditLog.shift();
}

/**
 * Query audit logs for a user.
 *
 * Returns a parameterized query with placeholders ($1, $2, ...)
 * and a separate values array to prevent SQL injection.
 */
export function buildAuditQuery(userId: string, fromDate?: string): ParameterizedQuery {
  const values: string[] = [userId];
  let query = `SELECT * FROM audit_log WHERE user_id = $1`;

  if (fromDate) {
    values.push(fromDate);
    query += ` AND timestamp >= $${values.length}`;
  }

  query += " ORDER BY timestamp DESC LIMIT 100";
  return { text: query, values };
}

/** Get current audit log size (for monitoring) */
export function getAuditLogSize(): number {
  return auditLog.length;
}

/** Get recent entries (for dashboard display) */
export function getRecentAuditEntries(limit: number = 50): AuditEntry[] {
  return auditLog.slice(-limit);
}
