# Oracle Cloud hooks for the boot scripts (deploy/terraform/modules/vm-bootstrap).
# Settings come from /etc/tersect/deploy.env:
#   TERSECT_REGION, TERSECT_NAMESPACE, TERSECT_BUNDLE_BUCKET,
#   TERSECT_BUNDLE_OBJECT, TERSECT_REGISTRY_HOSTS
# Credentials come from the instance itself (an instance principal), which
# needs signed requests: hence the OCI command line, in its own virtualenv.

OCI_VENV=/opt/oci-cli

oci_cli() {
    OCI_CLI_AUTH=instance_principal OCI_CLI_REGION="$TERSECT_REGION" \
        "$OCI_VENV/bin/oci" "$@"
}

# Containers have no business with the instance's identity: keep them away
# from the metadata service (HTTP on a link-local address). DNS, which Oracle
# Cloud serves on the same address, is left alone. Docker empties this chain
# when it starts, so the rule is checked before every use of the identity.
oci_shield_metadata() {
    command -v iptables >/dev/null 2>&1 || return 0
    iptables -nL DOCKER-USER >/dev/null 2>&1 || return 0
    iptables -C DOCKER-USER -d 169.254.169.254/32 -p tcp --dport 80 -j REJECT 2>/dev/null \
        || iptables -I DOCKER-USER -d 169.254.169.254/32 -p tcp --dport 80 -j REJECT \
        || echo "could not close the metadata service to containers" >&2
}

cloud_prepare() {
    if [ ! -x "$OCI_VENV/bin/oci" ]; then
        local attempt
        for attempt in 1 2 3 4 5; do
            if apt-get install -y -q python3-venv \
                && python3 -m venv "$OCI_VENV" \
                && "$OCI_VENV/bin/pip" install --quiet oci-cli; then
                break
            fi
            echo "installing the OCI command line failed (attempt $attempt)"
            rm -rf "$OCI_VENV"
            sleep 15
        done
        [ -x "$OCI_VENV/bin/oci" ] || return 1
    fi
    oci_shield_metadata
}

cloud_fetch_bundle() {
    oci_shield_metadata
    oci_cli os object get \
        --namespace "$TERSECT_NAMESPACE" \
        --bucket-name "$TERSECT_BUNDLE_BUCKET" \
        --name "$TERSECT_BUNDLE_OBJECT" \
        --file -
}

cloud_registry_login() {
    local host token
    for host in $TERSECT_REGISTRY_HOSTS; do
        # The registry exchanges a signed request for a short-lived token.
        token=$(oci_cli raw-request --http-method GET \
            --target-uri "https://$host/20180419/docker/token" | jq -er '.data.token') || return 1
        printf '%s' "$token" \
            | docker login --username BEARER_TOKEN --password-stdin "$host" >/dev/null
    done
}
