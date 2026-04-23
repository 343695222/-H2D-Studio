/**
 * Type declarations for the SolarWire DSL library.
 * 
 * Since the SolarWire npm package (github:SolarWire/SolarWire) is not available,
 * a local stub implementation is provided at server/src/lib/solarwire/.
 * 
 * These declarations cover the two import paths used in the design doc:
 *   import { parse } from 'solarwire';
 *   import { render } from 'solarwire/renderer-svg';
 * 
 * In practice, code should import from the local module:
 *   import { parse, render } from '../lib/solarwire/index.js';
 */

declare module 'solarwire' {
  export interface SolarWirePosition {
    x: number;
    y: number;
    relative?: boolean;
  }

  export interface SolarWireAttributes {
    w?: number;
    h?: number;
    bg?: string;
    c?: string;
    size?: number;
    bold?: boolean;
    r?: number;
    position?: SolarWirePosition;
  }

  export type SolarWireNodeType =
    | 'rectangle'
    | 'rounded'
    | 'circle'
    | 'text'
    | 'placeholder'
    | 'table'
    | 'tableRow'
    | 'connector'
    | 'group';

  export interface SolarWireNode {
    type: SolarWireNodeType;
    text?: string;
    attributes?: SolarWireAttributes;
    children?: SolarWireNode[];
  }

  export interface SolarWireAST {
    type: 'root';
    children: SolarWireNode[];
  }

  export interface SolarWireParseError {
    message: string;
    line?: number;
    column?: number;
  }

  /**
   * Parse SolarWire DSL text into an AST.
   * @throws {Error} with message, line, column on syntax errors
   */
  export function parse(dsl: string): SolarWireAST;
}

declare module 'solarwire/renderer-svg' {
  import type { SolarWireAST } from 'solarwire';

  /**
   * Render a SolarWire AST to an SVG string.
   * @throws {Error} if the AST is invalid
   */
  export function render(ast: SolarWireAST): string;
}
