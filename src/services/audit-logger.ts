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
 * Evicts oldest entries when the log exceeds MAX_AUDIT_LOG_ENTRIES.
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
  while (auditLog.length > MAX_AUDIT_LOG_ENTRIES) {
    auditLog.shift();
  }
}

/**
 * Query audit logs for a user.
 * Returns a parameterized query object to prevent SQL injection.
 */
export function buildAuditQuery(
  userId: string,
  fromDate?: string
): { text: string; params: string[] } {
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
