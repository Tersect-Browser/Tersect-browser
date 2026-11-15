"""Builder service: uploads, file inspection and dataset builds for the web UI.

    python -m tbpipeline.server          (port TB_BUILDER_PORT, default 4310)

Routes are under /api (the web dev server strips its base path when proxying).
Contract: web/src/features/datasets/types.ts. Spec: docs/design/HANDOFF-dataset-upload.md.
"""
