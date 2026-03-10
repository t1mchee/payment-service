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

export interface ParameterizedQuery {
  text: string;
  params: string[];
}

/**
 * Query audit logs for a user.
 *
 * Returns a parameterized query with placeholder values to prevent
 * SQL injection. Callers must pass `query.params` as bind parameters
 * when executing the query against the database.
 */
export function buildAuditQuery(userId: string, fromDate?: string): ParameterizedQuery {
  const params: string[] = [userId];
  let text = `SELECT * FROM audit_log WHERE user_id = $1`;

  if (fromDate) {
    params.push(fromDate);
    text += ` AND timestamp >= $${params.length}`;
  }

  text += " ORDER BY timestamp DESC LIMIT 100";
  return { text, params };
}

/** Get current audit log size (for monitoring) */
export function getAuditLogSize(): number {
  return auditLog.length;
}

/** Get recent entries (for dashboard display) */
export function getRecentAuditEntries(limit: number = 50): AuditEntry[] {
  return auditLog.slice(-limit);
}
