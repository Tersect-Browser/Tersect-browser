# Daily snapshots of the data disk. Snapshots are taken while the machine
# runs (crash-consistent); MongoDB and ClickHouse both recover from that
# state with their journals.

resource "google_compute_resource_policy" "snapshots" {
  count = var.enable_snapshots ? 1 : 0

  project     = var.project_id
  name        = "${var.name}-daily-snapshots"
  region      = var.region
  description = "Tersect Browser ${var.name}: daily snapshot of the data disk"

  snapshot_schedule_policy {
    schedule {
      daily_schedule {
        days_in_cycle = 1
        start_time    = var.snapshot_time_utc
      }
    }

    retention_policy {
      max_retention_days = var.snapshot_retention_days
      # Deleting the disk does not delete its backups.
      on_source_disk_delete = "KEEP_AUTO_SNAPSHOTS"
    }

    snapshot_properties {
      labels = local.labels
    }
  }

  depends_on = [google_project_service.this]
}

resource "google_compute_disk_resource_policy_attachment" "snapshots" {
  count = var.enable_snapshots ? 1 : 0

  project = var.project_id
  name    = google_compute_resource_policy.snapshots[0].name
  disk    = google_compute_disk.data.name
  zone    = var.zone
}
