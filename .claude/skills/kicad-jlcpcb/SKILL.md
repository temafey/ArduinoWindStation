---
name: kicad-jlcpcb
description: Search and select JLCPCB parts, check stock and pricing, find alternatives. Use when sourcing components from JLCPCB for PCB assembly.
argument-hint: [part-query]
---

# JLCPCB Parts Selection

You are an expert in electronic component sourcing. Help the user find optimal parts from JLCPCB's catalog.

## First-time setup

The JLCPCB parts database needs to be downloaded once:
```
download_jlcpcb_database()
```
This creates a local SQLite cache for fast searches. It may take a few minutes.

Check database status:
```
get_jlcpcb_database_stats()
```

## Search for parts

### By keyword/description
```
search_jlcpcb_parts(query="100nF capacitor 0402", in_stock=true)
```

### With filters
```
search_jlcpcb_parts(
  query="ESP32",
  package="QFN",
  library_type="basic",   # "basic" = cheapest, "extended" = wider selection
  in_stock=true
)
```

**Library types:**
- **Basic** — cheapest parts, no extra fee for JLCPCB assembly
- **Extended** — wider selection, small per-component fee ($3 per unique extended part)

### Get detailed part info
```
get_jlcpcb_part(lcsc_number="C14663")
```
Returns: description, package, price breaks, stock level, datasheet URL, basic/extended status.

### Find alternatives
```
suggest_jlcpcb_alternatives(lcsc_number="C14663")
```
Returns similar parts — useful when a part is out of stock or too expensive.

## Workflow for a complete BOM

1. **List all components** — `list_schematic_components` to see what's needed
2. **Search for each** — `search_jlcpcb_parts` for each component type
3. **Compare options** — check basic vs extended, pricing, stock
4. **Set LCSC numbers** — `set_schematic_component_property` to add LCSC part numbers
5. **Enrich datasheets** — `enrich_datasheets` to auto-populate datasheet URLs
6. **Export BOM** — `export_bom` in CSV format for JLCPCB upload

## Setting LCSC part numbers on components
```
set_schematic_component_property(
  schematicPath,
  reference="R1",
  property="LCSC",
  value="C25804"
)
```

## Common JLCPCB basic parts (no extra fee)

| Component | LCSC # | Description |
|-----------|--------|-------------|
| 10K 0402 resistor | C25744 | General pull-up/down |
| 100R 0402 resistor | C25076 | LED current limiting |
| 100nF 0402 cap | C14663 | Decoupling |
| 10uF 0805 cap | C19702 | Bulk bypass |
| Red LED 0805 | C84256 | Indicator |
| Green LED 0805 | C2297 | Indicator |
| 1N4148 diode | C81598 | General purpose |
| AMS1117-3.3 | C6186 | 3.3V LDO regulator |

## Cost optimization tips

- Prefer **basic** library parts — no extra assembly fee
- Use common packages (0402, 0805) — better availability and pricing
- Consolidate values — use fewer unique components to reduce setup costs
- Check stock levels — JLCPCB stock changes frequently
- Use `suggest_jlcpcb_alternatives` to find cheaper equivalents

## Important notes

- Always check `in_stock=true` when searching
- Basic parts are significantly cheaper for JLCPCB assembly
- LCSC numbers must be set as component properties before BOM export
- The local database is a snapshot — very new parts may not be included
- Run `download_jlcpcb_database` periodically to refresh the cache
