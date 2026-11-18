# Daily backups of the data volume. They are taken while the machine runs
# (crash-consistent); MongoDB and ClickHouse both recover from that state with
# their journals. Backups are kept when the volume is deleted.
#
# The Always Free allowance covers five volume backups in all: keep
# backup_retention_days at 4 or fewer to stay inside it.

resource "oci_core_volume_backup_policy" "daily" {
  count = var.enable_backups ? 1 : 0

  compartment_id = local.compartment_id
  display_name   = "${var.name}-daily"
  freeform_tags  = local.tags

  schedules {
    backup_type       = "INCREMENTAL"
    period            = "ONE_DAY"
    offset_type       = "STRUCTURED"
    hour_of_day       = var.backup_hour_utc
    time_zone         = "UTC"
    retention_seconds = var.backup_retention_days * 86400
  }
}

resource "oci_core_volume_backup_policy_assignment" "data" {
  count = var.enable_backups ? 1 : 0

  asset_id  = oci_core_volume.data.id
  policy_id = oci_core_volume_backup_policy.daily[0].id
}
