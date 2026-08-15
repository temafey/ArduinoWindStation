---
name: kicad-export
description: Export KiCAD manufacturing files — Gerber, BOM, pick-and-place, 3D models, PDF. Use when preparing a PCB design for fabrication or documentation.
argument-hint: [format]
---

# KiCAD Manufacturing Export

You are an expert in PCB manufacturing preparation. Help the user generate production-ready output files.

## What to ask the user (if not provided)

1. **What do they need?** (Gerber for fab, BOM for ordering, 3D for review, PDF for docs?)
2. **PCB fabricator** — JLCPCB, PCBWay, OSHPark, etc.? (affects Gerber settings)
3. **Output directory** — where to save files?

## Export types

### Gerber Files (for PCB fabrication)
```
export_gerber(boardPath, outputDir, generateDrillFiles=true, generateMapFile=true)
```
- Generates copper, mask, paste, silkscreen, and edge cut layers
- Includes drill files (Excellon format)
- Optional: `useProtelExtensions=true` for JLCPCB/PCBWay compatibility
- Optional: `layers` array to export specific layers only

**JLCPCB recommended settings:**
- useProtelExtensions: true
- generateDrillFiles: true
- generateMapFile: true

### Bill of Materials (for component ordering)
```
export_bom(boardPath, outputPath, format="csv")
```
- Formats: csv, xml, html, json
- Includes reference, value, footprint, and custom properties
- For JLCPCB assembly: CSV format with LCSC part numbers

### Pick and Place (for assembly)
```
export_position_file(boardPath, outputPath, format="csv")
```
- Formats: ascii, csv
- Contains component positions, rotations for SMT assembly
- Required for JLCPCB/PCBWay assembly service

### PDF (for documentation/review)
```
export_pdf(boardPath, outputPath)
export_schematic_pdf(schematicPath, outputPath)
```

### SVG (for web/vector graphics)
```
export_svg(boardPath, outputPath)
export_schematic_svg(schematicPath, outputPath)
```

### 3D Model (for mechanical review)
```
export_3d(boardPath, outputPath, format="step")
```
- Formats: step, stl, vrml, obj
- STEP is preferred for mechanical CAD integration
- STL for 3D printing enclosures

### Netlist (for simulation/cross-check)
```
export_netlist(boardPath, outputPath, format="kicad")
```
- Formats: kicad, spice, cadstar

### VRML (for 3D visualization)
```
export_vrml(boardPath, outputPath)
```

## Complete manufacturing package workflow

For a typical PCB order, export all of these:

1. **Run DRC first** — `run_drc` to verify no errors
2. **Gerber + drill** — `export_gerber` (required for fabrication)
3. **BOM** — `export_bom` as CSV (required for assembly)
4. **Position file** — `export_position_file` as CSV (required for SMT assembly)
5. **PDF** — `export_pdf` and `export_schematic_pdf` (for documentation)
6. **3D model** — `export_3d` as STEP (optional, for mechanical review)

## Important notes

- Always run DRC before exporting — catch errors before sending to fab
- JLCPCB expects Protel filename extensions for Gerber files
- BOM should include LCSC part numbers if using JLCPCB assembly
- Position files may need rotation corrections for specific assemblers
- Create a dedicated output directory (e.g., "manufacturing/") to keep files organized
