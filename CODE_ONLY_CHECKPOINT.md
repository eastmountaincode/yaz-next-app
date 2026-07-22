# Code-only layout branch

This branch preserves the application source, composite definitions, saved wall positions, and non-LFS media without adding the local 3D-model library to GitHub.

Production builds set `NEXT_PUBLIC_R2_ASSET_BASE_URL` to an immutable Cloudflare R2 release. The asset resolver then loads every `/3d-models/...` path from that release, while local development can continue using the complete model checkout on `layout/yaz-rearrangement`.

The verified R2 release for this checkpoint is `yaz-5cde16eb095e`.

The R2 preparation script reads `src/content/environment.json`, includes only the models used by the saved scene plus their dependent textures, compresses them into `.r2-assets`, and produces a content-addressed release ID.
