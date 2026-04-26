# Merchant logo SVGs

Filename convention: `{logo_slug}.svg` (kebab-case). The `logo_slug` column on the `merchants` table maps here.

Current files are placeholders (color circle + initials). Replace any of them with an officially-cleared SVG when you have it — keep the file name and the rough viewBox proportions (64×64) so the rounded crop in `MerchantAvatar` still looks right.

If a slug is set on a merchant row but no file exists at the matching path, the avatar component falls back to runtime initials (the same render path as merchants without a slug).
