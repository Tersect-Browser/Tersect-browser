# stack-config

Everything that runs *on* the machine, independent of the cloud. It creates no
cloud resources: only generated passwords and rendered text.

It produces:

- **Passwords** for MongoDB (root and application user) and ClickHouse (admin
  and reader): 32 letters and digits each, because they go into connection
  URLs. And the password of the shared login, unless one is supplied.
- **`.env`** with every setting `deploy/compose/docker-compose.yml` reads,
  including `COMPOSE_PROFILES=assistant` when the assistant is on.
- **`site.d/auth.caddy`**: the shared login (`basic_auth` with a bcrypt hash).
- **`site.d/allowlist.caddy`**: only when `allowed_cidrs` is narrower than
  `0.0.0.0/0`.
- **The bundle**: one JSON document holding those files together with
  `docker-compose.yml`, `mongo-init.js` and `clickhouse/{schema.sql,users.sh,low-memory.xml}`
  read from this repository:

  ```json
  { "version": 1, "files": { ".env": { "mode": "0600", "content": "..." }, "site.d/auth.caddy": { ... } } }
  ```

  The cloud modules store it in their secret store, and the machine unpacks it
  into `/opt/tersect` (`modules/vm-bootstrap/files/unpack.py`). It must stay
  under 60 KB (it is about 13 KB).

## Things worth knowing

- **The password hash does not change between plans.** A generated password
  uses the hash the `random` provider keeps with it. A supplied password is
  hashed once and the hash is kept in state (`terraform_data` with
  `ignore_changes`), recomputed only when the password changes. Plain
  `bcrypt()` would salt anew on every plan and show a change every time.
- **The allowlist and the login work together.** With an allowlist, clients
  outside it are never asked for the password (they get "not found" for every
  path), so the password cannot be tried from outside. See the comment in
  `templates/allowlist.caddy.tftpl` for why this is a `rewrite` and not just a
  `respond`.
- **`clickhouse_low_memory = false`** ships an empty `low-memory.xml` instead
  of removing the mount from the compose file, so the compose file stays
  untouched.
- The state holds every password in clear text. Keep it somewhere private.

## Example

```hcl
module "config" {
  source = "../../modules/stack-config"

  public_ip   = module.vm.public_ip
  domain_name = "tersect.example.org"
  images = {
    web      = "registry.example.org/tersect/web:1.0.0"
    backend  = "registry.example.org/tersect/backend:1.0.0"
    pipeline = "registry.example.org/tersect/pipeline:1.0.0"
  }
  allowed_cidrs = ["203.0.113.0/24"]
}
```

## Inputs

| Name | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | `"tersect"` | Name of the deployment. Used in file headers only; the cloud modules use the same value as a resource prefix. |
| `domain_name` | `string` | `null` | Domain the site is served on (for example tersect.example.org). Caddy obtains a certificate for it automatically. Leave null to serve on the IP address with a self-signed certificate. |
| `public_ip` | `string` | **required** | Public IP address of the machine. Used as the site address when domain_name is null. |
| `acme_email` | `string` | `null` | Contact address given to the certificate authority (Let's Encrypt) for expiry notices. Only used with domain_name. |
| `images` | `object` | **required** | Full image references (registry/repository:tag) of the three application images, as pushed by deploy/scripts/push-images.sh. |
| `basic_auth_username` | `string` | `"tersect"` | User name of the shared login. |
| `basic_auth_password` | `string` | `null` | Password of the shared login. Leave null to generate one (read it from the outputs). *(sensitive)* |
| `allowed_cidrs` | `list(string)` | `["0.0.0.0/0"]` | Networks allowed to use the site, in CIDR notation. The default allows everyone; the cloud firewall and the proxy both enforce this list. |
| `data_dir` | `string` | `"/data"` | Directory on the machine that holds all state (the mount point of the data disk). |
| `database_name` | `string` | `"tersect_browser_gp"` | Name of the MongoDB application database. |
| `mongo_username` | `string` | `"tersect"` | Name of the MongoDB application user. |
| `clickhouse_low_memory` | `bool` | `true` | Apply the small-host ClickHouse settings (clickhouse/low-memory.xml). Set to false on a machine with 32 GB of memory or more to run ClickHouse with its own defaults. |
| `enable_assistant` | `bool` | `false` | Run the dataset assistant's local model (the ollama service of the compose file). Needs a machine with an NVIDIA GPU. |
| `assistant_model` | `string` | `"qwen3:14b"` | Ollama model the assistant uses. It is downloaded on the machine at start. |
| `assistant_context_chars` | `number` | `24000` | How many characters of context the builder sends to the model (TB_ASSISTANT_CONTEXT_CHARS). |
| `ollama_context_length` | `number` | `16384` | Context window of the model in tokens (OLLAMA_CONTEXT_LENGTH). |
| `compose_dir` | `string` | `null` | Directory that holds docker-compose.yml and mongo-init.js. Defaults to deploy/compose of this repository. |
| `clickhouse_dir` | `string` | `null` | Directory that holds schema.sql, users.sh and low-memory.xml. Defaults to clickhouse/ of this repository. |

## Outputs

| Name | Description |
|---|---|
| `bundle` | The configuration bundle: a JSON document with every file that sits beside the compose file (.env, docker-compose.yml, site.d/, mongo-init.js, clickhouse/). Store it in the cloud's secret store; the machine fetches and unpacks it. *(sensitive)* |
| `files` | The same files as a map of path => { mode, content }, for inspection or other delivery methods. *(sensitive)* |
| `env_file` | Content of the .env file. *(sensitive)* |
| `url` | Address of the site. |
| `site_address` | Domain or IP address the proxy serves. |
| `uses_self_signed_certificate` | True when no domain is set: browsers warn about the certificate. |
| `basic_auth_username` | User name of the shared login. |
| `basic_auth_password` | Password of the shared login (generated unless supplied). *(sensitive)* |
| `access_restricted` | True when allowed_cidrs limits who can connect. |
