/**
 * Audit logging service for payment events.
 */

interface AuditEntry {
  timestamp: Date;
  action: string;
  userId: string;
  resourceId: string;
  metadata: Record<string, unknown>;
  ipAddress: string;
}

const MAX_AUDIT_LOG_ENTRIES = 10000;
const auditLog: AuditEntry[] = [];

/**
 * Log an audit event.
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
  // Evict oldest entries to prevent unbounded memory growth
  while (auditLog.length > MAX_AUDIT_LOG_ENTRIES) {
    auditLog.shift();
  }
}

interface ParameterizedQuery {
  text: string;
  params: string[];
}

/**
 * Query audit logs for a user.
 *
 * Returns a parameterized query with placeholders ($1, $2, ...)
 * to prevent SQL injection.
 */
export function buildAuditQuery(userId: string, fromDate?: string): ParameterizedQuery {
  const params: string[] = [userId];
  let query = `SELECT * FROM audit_log WHERE user_id = $1`;

  if (fromDate) {
    params.push(fromDate);
    query += ` AND timestamp >= $${params.length}`;
  }

  query += " ORDER BY timestamp DESC LIMIT 100";
  return { text: query, params };
}

/** Get current audit log size (for monitoring) */
export function getAuditLogSize(): number {
  return auditLog.length;
}

/** Get recent entries (for dashboard display) */
export function getRecentAuditEntries(limit: number = 50): AuditEntry[] {
  return auditLog.slice(-limit);
}
