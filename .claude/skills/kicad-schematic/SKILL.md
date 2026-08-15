---
name: kicad-schematic
description: Design a KiCAD schematic — add components, wire connections, net labels, and validate with ERC. Use when building or editing a circuit schematic.
argument-hint: [circuit-description]
---

# KiCAD Schematic Design

You are an expert circuit designer. Help the user design a schematic in KiCAD.

## What to ask the user (if not provided)

1. **What circuit** are they building? (LED driver, sensor board, microcontroller breakout, etc.)
2. **Which components** do they need? (or should you suggest based on the circuit?)
3. **Power supply** — voltage levels, regulators needed?
4. **Connectors** — type and pin count?

## Step-by-step workflow

### 1. Open the project
- Use `open_project` if not already open
- The schematic file is the .kicad_sch in the project directory

### 2. Add components
Use `add_schematic_component` for each part. Common symbol references:

| Component | Library:Symbol | Typical footprint |
|-----------|---------------|-------------------|
| Resistor | Device:R | Resistor_SMD:R_0402_1005Metric |
| Capacitor | Device:C | Capacitor_SMD:C_0402_1005Metric |
| LED | Device:LED | LED_SMD:LED_0805_2012Metric |
| NPN transistor | Device:Q_NPN_BEC | Package_TO_SOT_SMD:SOT-23 |
| Diode | Device:D | Diode_SMD:D_SOD-123 |
| 2-pin connector | Connector_Generic:Conn_01x02 | - |
| 4-pin connector | Connector_Generic:Conn_01x04 | - |
| USB-C | Connector:USB_C_Receptacle_USB2.0 | - |
| Power flag | power:PWR_FLAG | - |
| GND symbol | power:GND | - |
| VCC symbol | power:VCC | - |

### 3. Place components with spacing
- Space components ~20-30mm apart for readability
- Group related components (e.g., decoupling caps near ICs)
- Place power symbols (VCC, GND) near the components they connect to

### 4. Wire the circuit
Use these tools in order of preference:

1. **`connect_to_net`** — connect a component pin to a named net (VCC, GND, etc.)
2. **`add_schematic_net_label`** — place net labels to name connections
3. **`add_schematic_wire`** — draw explicit wires between points
4. **`connect_passthrough`** — for connector-to-connector wiring (FFC adapters, etc.)
5. **`add_no_connect`** — mark intentionally unconnected pins

### 5. Add power connections
- Every VCC pin needs a connection to the VCC net
- Every GND pin needs a connection to the GND net
- Add `PWR_FLAG` on power nets to avoid ERC warnings

### 6. Annotate
- Call `annotate_schematic` to auto-assign references (R1, R2, C1, C2, etc.)

### 7. Validate
- Call `run_erc` to check for electrical errors
- Call `list_floating_labels` to find unconnected labels
- Call `find_orphaned_wires` to find disconnected wires
- Fix any issues found

### 8. Inspect
- Call `get_schematic_view` to render a visual of the schematic
- Call `list_schematic_components` to verify all parts are present
- Call `list_schematic_nets` to verify all nets

### 9. Save
- Call `save_project`

## Important notes

- Symbol format is always "Library:SymbolName" (e.g., "Device:R")
- Component positions use schematic coordinates (not PCB coordinates)
- After schematic is complete, use `sync_schematic_to_board` (F8 equivalent) before doing any PCB layout work
- Always add PWR_FLAG symbols on power nets to suppress ERC warnings
- The `connect_to_net` tool is the easiest way to hook up power pins
