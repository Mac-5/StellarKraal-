# Dependency Scanning

This guide describes how dependencies are scanned for vulnerabilities and how
Software Bills of Materials (SBOMs) are produced for the published Docker
images.

## SBOM generation for Docker images

Every tagged release publishes an SBOM for both the backend and the frontend
Docker images. The SBOMs are generated with
[syft](https://github.com/anchore/syft) and attached to the corresponding
GitHub release as assets.

### Format

SBOMs are generated in **CycloneDX JSON** format (`cyclonedx-json`). This format
is supported by common vulnerability scanners and license-compliance tooling.

### CI workflow

The release workflow builds the backend and frontend images, then runs syft
against each image and uploads the resulting SBOM files as release assets.

```yaml
- name: Generate backend SBOM
  uses: anchore/sbom-action@v0
  with:
    image: ghcr.io/${{ github.repository }}/backend:${{ github.ref_name }}
    format: cyclonedx-json
    output-file: sbom-backend.cyclonedx.json
    artifact-name: sbom-backend

- name: Generate frontend SBOM
  uses: anchore/sbom-action@v0
  with:
    image: ghcr.io/${{ github.repository }}/frontend:${{ github.ref_name }}
    format: cyclonedx-json
    output-file: sbom-frontend.cyclonedx.json
    artifact-name: sbom-frontend
```

The generated files (`sbom-backend.cyclonedx.json` and
`sbom-frontend.cyclonedx.json`) are uploaded as release assets on tagged
releases.

### Running locally

You can generate the same SBOMs locally with the syft CLI:

```bash
syft <image> -o cyclonedx-json > sbom.cyclonedx.json
```

## Auditing an SBOM

The CycloneDX JSON files list every package (OS packages and language
dependencies) contained in the image. Feed them into your preferred scanner to
check for known vulnerabilities or license issues.
