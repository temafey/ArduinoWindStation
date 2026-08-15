---
name: kicad-new-project
description: Create a new KiCAD PCB project with board outline, mounting holes, and design rules. Use when starting a new PCB design from scratch.
argument-hint: [project-name] [directory]
---

# Create a New KiCAD Project

You are an expert KiCAD PCB designer. Create a new project and set up the board foundation.

## What to ask the user (if not provided)

1. **Project name** and **directory** to create it in
2. **Board dimensions** (width x height in mm)
3. **Board shape** (rectangular, or custom outline)
4. **Mounting holes** — how many, diameter (typically 3mm or 3.2mm), positions
5. **Layer count** (2-layer or 4-layer)
6. **Design rules** — trace width, clearance, via size (or use defaults below)

## Default design rules (if user doesn't specify)

- Track width: 0.25mm
- Clearance: 0.2mm
- Via diameter: 0.8mm
- Via drill: 0.4mm
- Min track width: 0.15mm

## Workflow

1. Call `create_project` with the project name and directory
2. Call `open_project` to load the generated files
3. Call `set_board_size` with the board dimensions
4. Call `add_board_outline` to create the edge cuts
5. Call `add_mounting_hole` for each mounting hole (typically 3mm from board edges)
6. Call `set_design_rules` with the design rules
7. Call `save_project`
8. Report back what was created, including file paths for .kicad_pro, .kicad_pcb, and .kicad_sch

## Common board sizes for reference

- Arduino Uno shield: 68.6 x 53.3mm
- Raspberry Pi HAT: 65 x 56mm
- Credit card: 85.6 x 53.98mm
- Small breakout: 25 x 25mm
- Medium project: 50 x 50mm or 100 x 100mm

## Important notes

- Mounting holes at corners should be inset 3mm from edges (both X and Y)
- For 4 mounting holes on a rectangular board, place at: (inset, inset), (W-inset, inset), (inset, H-inset), (W-inset, H-inset)
- Always save the project after setup
