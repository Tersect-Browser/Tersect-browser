tailscale funnel reset

# Root (/) → Angular dev server on 4200
sudo tailscale funnel --https=443 4200             

# /static/… → webpack server on 3000
sudo tailscale funnel --https=443 --set-path=/static/ 3200 