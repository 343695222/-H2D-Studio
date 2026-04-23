/**
 * SolarWire DSL Library (Local Stub)
 * 
 * This is a local implementation of the SolarWire library since the
 * npm package (github:SolarWire/SolarWire) is not available.
 * 
 * Provides:
 *   - parse(dsl: string): SolarWireAST — Parse DSL text into AST
 *   - render(ast: SolarWireAST): string — Render AST to SVG string
 *   - All AST type definitions
 */

export { parse } from './parser.js';
export { render } from './renderer-svg.js';
export type {
  SolarWireAST,
  SolarWireNode,
  SolarWireNodeType,
  SolarWireAttributes,
  SolarWirePosition,
  SolarWireParseError,
} from './types.js';
