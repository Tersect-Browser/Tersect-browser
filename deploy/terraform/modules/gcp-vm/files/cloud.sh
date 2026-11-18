# Google Cloud hooks for the boot scripts (deploy/terraform/modules/vm-bootstrap).
# Settings come from /etc/tersect/deploy.env:
#   TERSECT_PROJECT, TERSECT_BUNDLE_ID (secret id), TERSECT_REGISTRY_HOSTS
# Credentials come from the instance's service account, through the metadata
# server; no gcloud is needed.

cloud_access_token() {
    curl -fsS --retry 3 -H 'Metadata-Flavor: Google' \
        'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token' \
        | jq -er '.access_token'
}

cloud_prepare() {
    # curl and jq are installed by setup.sh.
    return 0
}

cloud_fetch_bundle() {
    local token
    token=$(cloud_access_token) || return 1
    curl -fsS --retry 3 -H "Authorization: Bearer $token" \
        "https://secretmanager.googleapis.com/v1/projects/$TERSECT_PROJECT/secrets/$TERSECT_BUNDLE_ID/versions/latest:access" \
        | jq -er '.payload.data' | base64 -d
}

cloud_registry_login() {
    local host token
    token=$(cloud_access_token) || return 1
    for host in $TERSECT_REGISTRY_HOSTS; do
        printf '%s' "$token" \
            | docker login --username oauth2accesstoken --password-stdin "https://$host" >/dev/null
    done
}
