# The first-boot script of the machine, shared by every cloud. It only places
# files and hands over to them; the logic lives in files/ as plain scripts
# (no templating, so they can be linted and read as they are).
#
#   /etc/tersect/deploy.env            names of things (no secrets)
#   /usr/local/lib/tersect/cloud.sh    the cloud's hooks
#   /usr/local/lib/tersect/setup.sh    disk, Docker, systemd units (idempotent)
#   /usr/local/lib/tersect/gpu.sh      NVIDIA driver and container toolkit
#   /usr/local/lib/tersect/unpack.py   unpacks the configuration bundle
#   /usr/local/sbin/tersect-sync       fetch bundle, pull images, compose up

locals {
  settings = merge(var.cloud_settings, {
    NAME         = var.name
    DATA_DIR     = var.data_dir
    DATA_DEVICES = join(" ", var.data_device_candidates)
    POLL_MINUTES = tostring(var.config_poll_minutes)
  })

  deploy_env = join("", [
    for key in sort(keys(local.settings)) : "TERSECT_${key}=\"${local.settings[key]}\"\n"
  ])

  # path => { mode, content }
  files = {
    "/etc/tersect/deploy.env"          = { mode = "0644", content = local.deploy_env }
    "/usr/local/lib/tersect/cloud.sh"  = { mode = "0644", content = var.cloud_hooks }
    "/usr/local/lib/tersect/setup.sh"  = { mode = "0755", content = file("${path.module}/files/setup.sh") }
    "/usr/local/lib/tersect/gpu.sh"    = { mode = "0755", content = file("${path.module}/files/gpu.sh") }
    "/usr/local/lib/tersect/unpack.py" = { mode = "0644", content = file("${path.module}/files/unpack.py") }
    "/usr/local/sbin/tersect-sync"     = { mode = "0755", content = file("${path.module}/files/tersect-sync.sh") }
  }

  script = templatefile("${path.module}/templates/bootstrap.sh.tftpl", {
    files = local.files
  })
}
