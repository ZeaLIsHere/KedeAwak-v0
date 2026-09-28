# UMKM Pencatatan Keuangan Design System Library
**Version:** 2.0 (Mobile-First Focus)  
**Target Audience:** Cross-generational UMKM Owners (Gen Z to Baby Boomers)  
**Primary Objective:** High readability, low cognitive load, mistake-proof interface.

---

## 1. DESIGN PRINCIPLES & ACCESSIBILITY (WCAG 2.1 AA)
* **Direct Labeling:** Every icon MUST be accompanied by a clear text label (e.g., An icon of a plus sign is not enough; it must say "Tambah Transaksi").
* **Target Size:** Touch targets must be at least **48x48 dp/px** with a **8px** minimum separation to prevent accidental taps by older users.
* **Contrast Ratio:** Text-to-background contrast ratio must be at least **4.5:1** for normal text and **3:1** for large text.

---

## 2. DESIGN TOKENS

### 2.1 Color Palette (Universal Mental Models)
```json
{
  "color": {
    "brand": {
      "primary": "#0263E0",
      "primary-light": "#E6F0FF"
    },
    "transaction": {
      "income-bg": "#E8F5E9",
      "income-text": "#2E7D32",
      "expense-bg": "#FFEBEE",
      "expense-text": "#C62828"
    },
    "neutral": {
      "background": "#F9FAFB",
      "surface": "#FFFFFF",
      "text-main": "#1F2937",
      "text-muted": "#6B7280",
      "border": "#D1D5DB"
    }
  }
}
```

### 2.2 Typography Scale (Large & Readable)
* **Font Family:** System Fonts (`Roboto` for Android, `SF Pro` for iOS). Avoid custom decorative fonts.
```json
{
  "typography": {
    "screen-title": { "size": "24px", "weight": "700", "line-height": "32px" },
    "section-heading": { "size": "18px", "weight": "700", "line-height": "24px" },
    "body-large": { "size": "16px", "weight": "600", "line-height": "24px" },
    "body-regular": { "size": "14px", "weight": "400", "line-height": "20px" },
    "amount-display": { "size": "28px", "weight": "800", "line-height": "36px" }
  }
}
```

---

## 3. MOBILE-FIRST LAYOUT & SLICING RULES

### 3.1 Mobile Grid & Viewport Scaling
* **Base Resolution:** Design for a baseline width of **360dp to 390dp** (covers standard modern Android & iOS phones). 
* **Responsive Scaling:** Use fractional fluid scaling or layout constraints (`match_parent` / `w-full`) instead of fixed pixel widths for layout structures.
* **Safe Areas:** Keep all critical text, buttons, and inputs within the top and bottom OS safe areas (avoid notch and bottom navigation bar overlaps).

### 3.2 Slicing Framework (Atomic Hierarchy)
When slicing design files into production code, follow this asset & component partitioning strategy:
1. **Global Assets Slicing:**
   * Export all icons as crisp **vector SVGs** (do not use PNG/JPG for interface icons).
   * Bundle typography configurations strictly into global themes/styles.
2. **Component Slicing Boundaries:**
   * **Atomic Components:** Inputs, Buttons, Badges. Slice them as isolated, stateful widgets (Default, Focused, Error, Disabled).
   * **Molecular Components:** Form Blocks, List Cards. Slice them with strict structural padding boundaries. Never hardcode child positions; rely on Flexbox/Stack layouts.

### 3.3 Layout Constraints (Flexbox/Grid Blueprints)
* **Screen Padding:** Standardized global screen margin is **16px** on both left and right edges.
* **Component Spacing:** Use vertical stacks with **12px** or **16px** spacing intervals to separate items cleanly without clutter.
* **Sticky Layout Pattern:** Primary action containers (like "Simpan" buttons) should either be pinned to the bottom of the viewport using a sticky layout wrapper or placed cleanly at the absolute end of a short, non-scrolling screen.

---

## 4. DESIGN BLUEPRINTS (JSON SCHEMAS)

### 4.1 Quick Transaction Button Component
```json
{
  "component": "QuickTransactionButton",
  "layout": {
    "type": "FlexRow",
    "width": "match_parent",
    "height": "64px",
    "padding": "16px",
    "gap": "12px"
  },
  "states": {
    "income": {
      "background-color": "color.transaction.income-bg",
      "text-color": "color.transaction.income-text",
      "icon": "arrow-down-left-green.svg",
      "label": "Uang Masuk (+)"
    },
    "expense": {
      "background-color": "color.transaction.expense-bg",
      "text-color": "color.transaction.expense-text",
      "icon": "arrow-up-right-red.svg",
      "label": "Uang Keluar (-)"
    }
  }
}
```

### 4.2 Linear Transaction Card Component
```json
{
  "component": "TransactionHistoryCard",
  "layout": {
    "type": "FlexRow",
    "justify": "space-between",
    "align": "center",
    "padding": "16px",
    "border-bottom": "1px solid color.neutral.border",
    "background": "color.neutral.surface"
  },
  "left-slot": {
    "type": "FlexColumn",
    "gap": "4px",
    "children": [
      { "type": "Text", "style": "typography.body-large", "source": "transaction.title" },
      { "type": "Text", "style": "typography.body-regular", "color": "color.neutral.text-muted", "source": "transaction.date" }
    ]
  },
  "right-slot": {
    "type": "Text",
    "style": "typography.body-large",
    "conditional-color": {
      "if": "transaction.type == income",
      "then": "color.transaction.income-text",
      "else": "color.transaction.expense-text"
    },
    "source": "transaction.amount"
  }
}
```

---

## 5. UX FLOW GUARDRAILS FOR THE AI AGENT
1. **Rule 1 (The 3-Field Limit):** Any input form screen must contain a maximum of **3 visible input fields** at a time (e.g., 1. Nominal, 2. Keterangan, 3. Tanggal). If more fields are added, it must use step-by-step disclosure.
2. **Rule 2 (No Infinite Scroll for History):** The dashboard history list must only display a maximum of the **5 most recent transactions** with a heavy, highly visible "Lihat Semua Riwayat" button below it.
3. **Rule 3 (Sticky Error Prevention):** When an validation error occurs on a form input, the error text must be displayed directly below the active field in `#C62828`, and the keyboard must not obstruct the view of the error message.