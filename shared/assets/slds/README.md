# SLDS Icon Assets

This directory contains locally hosted Salesforce Lightning Design System (SLDS) icon assets to avoid CORS issues when loading icons from external CDNs.

## Directory Structure

```
slds/
└── icons/
    ├── standard-sprite/svg/symbols.svg  # Standard Salesforce object icons
    ├── utility-sprite/svg/symbols.svg   # Utility icons (actions, states, etc.)
    ├── action-sprite/svg/symbols.svg    # Action-specific icons
    ├── custom-sprite/svg/symbols.svg    # Custom object icons
    └── doctype-sprite/svg/symbols.svg   # Document type icons
```

## Usage

In HTML files, reference these icons using the local path:

```html
<!-- Example: Using a standard icon -->
<svg class="slds-icon" aria-hidden="true">
    <use xlink:href="/shared/assets/slds/icons/standard-sprite/svg/symbols.svg#account"></use>
</svg>

<!-- Example: Using a utility icon -->
<svg class="slds-icon" aria-hidden="true">
    <use xlink:href="/shared/assets/slds/icons/utility-sprite/svg/symbols.svg#settings"></use>
</svg>
```

## Updating Icons

To download/update the SLDS icon assets:

```bash
npm run download:slds
```

This will:
1. Download the latest SLDS icon sprite files from the CDN
2. Save them to the appropriate directories
3. Update all HTML files to use local paths instead of CDN URLs

## Testing

To verify icons are being served correctly:

```bash
node scripts/test-slds-icons.js
```

## Version

Current SLDS version: 2.24.3

To update to a different version, modify the URL in `scripts/download-slds-icons.js`.