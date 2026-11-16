Access control for the proxy. Every `*.caddy` file here is imported into the
site block of `deploy/docker/Caddyfile`. The Terraform modules write these;
by hand:

`auth.caddy` (password; make the hash with `docker run --rm caddy:2.10-alpine caddy hash-password`):

    basic_auth {
        tersect $2a$14$...
    }

`allowlist.caddy` (only these networks may connect):

    @outside not remote_ip 203.0.113.0/24 198.51.100.7
    respond @outside "Forbidden" 403

With no files here the site is open to anyone who can reach it.
