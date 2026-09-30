# SokoHai Product Upload System — Phase 2 Step 1

Date: 2026-09-28
Status: **PRODUCT UPLOAD PHASE — PARTIALLY COMPLETE**

This step locked the additive product-data contract before changing Add Product, Edit Product, or Buyer UI.

## A. Files changed

| File | What changed | Why |
|---|---|---|
| `shared/product-upload-data-core.mjs` | Added additive normalizers for attributes, filters, options, selector types, option values, structured variants, features, additional information, and image inheritance | Establish one small data contract without creating a second product model or Firestore collection |
| `js/app/39-product-core.js` | Integrated the additive contract into existing `buildProductWrite`; exports image resolution helpers | Existing product writes can accept structured data while preserving legacy fields and authorities |
| `js/app/00-bootstrap.js` | Exposed the new helpers through existing `skh` foundation object | Existing UI modules can reuse the same product foundation instead of importing a second runtime |
| `tools/test_product_upload_data_contract.mjs` | Added targeted contract tests | Verify normalization, filter derivation, option values, variant identity, image reuse, features, and additional information |

No HTML UI, Edit UI, Buyer showcase, Firestore authority, POS authority, or Product Taxonomy registry was changed in this step.

## B. Additive data contract

The contract is additive inside the existing `products/{productId}` record:

```js
{
  // Existing fields remain present and compatible.
  productId,
  title,
  category,
  subCategory,
  price,
  stock,
  images,
  sku,
  barcode,
  unitId,
  inventoryKey,
  variantId,

  // New fields are written only when populated.
  attributes: [
    {
      id,
      name,
      value,
      type,           // text | number | boolean | single_select | multi_select | measurement
      source,         // SELLER | SUGGESTION | IMPORTED, etc.
      categoryId,
      subcategoryId,
      display,
      filterable,
      filterKey
    }
  ],

  // Existing filters object remains the buyer/search metadata surface.
  // Eligible structured attributes are derived into this object.
  filters: {
    brand: 'Samsung',
    ram: '8GB'
  },

  options: [
    {
      id,
      name: 'Color',
      selectorType: 'color', // color | button | dropdown | image | swatch | text
      source,
      required,
      display,
      values: [
        {
          id,
          value: 'Black',
          label: 'Black',
          images: [],
          availability: 'available',
          disabled: false
        }
      ]
    }
  ],

  variantsStructured: [
    {
      variantId,
      options: { Color: 'Blue', Size: 'L' },
      sku,
      barcode,
      unitId,
      inventoryKey,
      price,
      stock,
      status,
      available,
      images: []
    }
  ],

  features: [
    {
      id,
      name: 'Wooden handle',
      value: true,
      observable: true,
      images: [],
      source
    }
  ],

  additionalInfo: [
    {
      id,
      name: 'Charging time',
      value: '2 hours',
      source,
      display: true
    }
  ]
}
```

### Compatibility decisions

- Existing `products` collection remains the only product collection.
- Existing `buildProductWrite` remains the write normalization boundary.
- Existing `variantCombinations` and legacy text `variants` are preserved.
- `variantsStructured` is additive and does not replace the existing concrete variant field yet.
- Existing `filters` remains the filter surface; structured filterable attributes derive into it rather than creating `filterColor`, `buyerColor`, or similar duplicate fields.
- Unsupported selector types normalize to a supported `button` selector instead of being stored as a renderer capability that does not exist.
- Variant image resolution follows: explicit variant images → selected option-value images → general product images.
- Option/feature image values are references/URLs; the contract does not duplicate uploaded files.

## C. Tests

Passed:

```text
PRODUCT UPLOAD DATA CONTRACT: passed additive normalization, filter derivation,
option values, variant identity, image inheritance, features, and additional information.

PRODUCT FOUNDATION CONTRACT: 18 passed, 0 failed
Product taxonomy integration contract passed.
Variant + Unit Foundation checks passed.
POS variant product editor behavioral checks passed.
POS product + variant + unit integration checks passed.
POS variant lifecycle integration checks passed.
```

Syntax checks passed for:

```text
js/app/39-product-core.js
js/app/00-bootstrap.js
shared/product-upload-data-core.mjs
tools/test_product_upload_data_contract.mjs
```

## D. Not implemented yet

The following are intentionally not implemented in this step:

- Structured Add Product editor UI
- Structured Edit Product editor UI
- Custom attribute controls
- Option Builder UI
- Selector UI
- Generate → Review → Enable variant flow
- Manual variant UI
- Option-value image picker UI
- Variant image UI
- Feature UI
- Additional information UI
- Buyer dynamic rendering changes
- Buyer selector resolution changes
- Disabled invalid combination UI
- Canonical taxonomy compatibility bridge
- Category-by-category runtime matrix
- POS runtime consumption of `variantsStructured`

## E. Backward compatibility

```text
Old products readable: YES — no migration required by this step
Old products editable: YES — legacy fields remain in place
Product IDs preserved: YES
Variant IDs preserved: YES
POS identity preserved: YES
Existing save authority preserved: YES
Existing Firestore path preserved: YES
Second product collection created: NO
shared/pos-product-identity-core.js modified: NO
```

## F. Risks / follow-up

1. The new contract is not yet used by the seller UI, so no seller-facing option/variant workflow exists yet.
2. `variantsStructured` is additive; existing POS code still consumes its established fields. A later POS compatibility step must explicitly decide how structured selected variants are bridged without changing POS authority.
3. The canonical taxonomy registry is still separate from the live `skh.advancedCategories` UI configuration. The compatibility bridge remains pending.
4. Existing general image upload works, but option/variant/feature image pickers remain pending.
5. Existing Edit Product still exposes raw concrete variant JSON and has not reached Add Product parity.
6. `filters` are derived only when an attribute explicitly has `filterable: true`; UI guidance and mapping controls are pending.

## Explicit completion statement

**PRODUCT UPLOAD PHASE — PARTIALLY COMPLETE**

The additive data contract and its tests are complete for this step. The actual seller builder, Edit parity, buyer rendering, category matrix, and end-to-end option/variant behavior remain to be implemented and verified.
