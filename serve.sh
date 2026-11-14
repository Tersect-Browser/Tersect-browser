#!/bin/sh
# Expose the local web app (port 4200) over HTTPS with Tailscale Funnel.
tailscale funnel reset
sudo tailscale funnel --https=443 4200
