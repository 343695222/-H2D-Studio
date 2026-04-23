/**
 * SolarWire DSL AST Types
 * 
 * These types represent the Abstract Syntax Tree produced by the SolarWire parser.
 * SolarWire is a Markdown-style UI wireframe DSL supporting rectangles, rounded rectangles,
 * circles, tables, connectors, and style attributes.
 */

export type SolarWireNodeType =
  | 'rectangle'      // ["text"]
  | 'rounded'        // ("text")
  | 'circle'         // (("text"))
  | 'text'           // "text"
  | 'placeholder'    // [?]
  | 'table'          // ## ... ##
  | 'tableRow'       // # ...
  | 'connector'      // --"label"--
  | 'group';         // container / root

export interface SolarWirePosition {
  x: number;
  y: number;
  relative?: boolean; // @(+dx,+dy)
}

export interface SolarWireAttributes {
  w?: number;         // width
  h?: number;         // height
  bg?: string;        // backgroundColor
  c?: string;         // color
  size?: number;      // fontSize
  bold?: boolean;     // fontWeight: 700
  r?: number;         // borderRadius
  position?: SolarWirePosition; // @(x,y)
}

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
