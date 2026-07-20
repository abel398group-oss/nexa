/**
 * Runtime feature flags of the Monitor module — single source of truth.
 *
 * STANDBY (2026-07-20, Abel's decision — docs/STANDBY.md): immediate
 * out-of-cycle alerts are DISABLED by default. Read per call (not module
 * const) so tests can toggle the env var.
 *
 * The flag ALSO decides who owns CRITICAL delivery (exactly one channel):
 *   - enabled  → immediate channel sends CRITICAL; scheduled digest excludes it
 *   - standby  → scheduled digest INCLUDES CRITICAL (otherwise it would be
 *     delivered nowhere — gap found in the 2026-07-20 digest-throttle review)
 */
export const isImmediateAlertsEnabled = () => process.env.MONITOR_IMMEDIATE_ALERTS === 'true';
