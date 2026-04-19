/**
 * Capture types - mirrored from src/lib/types.ts
 */

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Quad {
  p1: Point;
  p2: Point;
  p3: Point;
  p4: Point;
}

export interface ElementRect extends Rect {
  cssWidth: number;
  cssHeight: number;
  quad?: Quad;
}

export interface SimpleMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

// ---------------------------------------------------------------------------
// Source annotations
// ---------------------------------------------------------------------------

export type AnnotationType = "element" | "text" | "expression";

interface BaseAnnotation {
  sourceId: string;
  fileGuid: string;
  filePath: string;
  fileVersion: string;
  line: number;
  column: number;
  pos: number;
  len: number;
}

export interface ElementAnnotation extends BaseAnnotation {
  type: "element";
  name: string;
  childTypes?: string[];
  isComponentDefinition?: true;
  assetKey?: string;
  makeLibraryId?: string;
  libraryId?: string;
  componentId?: string;
  isLibraryInstance?: true;
}

export interface TextAnnotation extends BaseAnnotation {
  type: "text";
}

export interface ExpressionAnnotation extends BaseAnnotation {
  type: "expression";
}

export type SourceAnnotation =
  | ElementAnnotation
  | TextAnnotation
  | ExpressionAnnotation;

// ---------------------------------------------------------------------------
// Serialized fiber tree
// ---------------------------------------------------------------------------

export interface SerializedFiberNode {
  h2dId: string | undefined;
  name: string | undefined;
  fiberTag: number | null;
  props: Record<string, unknown> | undefined;
  children: SerializedFiberNode[];
}

// ---------------------------------------------------------------------------
// Serialized snapshot nodes
// ---------------------------------------------------------------------------

export type LayoutSizing = "FILL" | "HUG" | "FIXED";

export interface ElementSnapshot {
  nodeType: 1;
  id: string;
  tag: string;
  attributes: Record<string, string>;
  styles: Record<string, string>;
  rect: ElementRect;
  childNodes: SnapshotNode[];
  content?: string;
  placeholderUrl?: string;
  pseudoElementStyles?: Record<string, Record<string, string>>;
  owningReactComponent?: string;
  sources?: SourceAnnotation[];
  selectionSourceId?: string;
  relativeTransform?: SimpleMatrix;
  declaredStyles?: Record<string, string>;
  layoutSizingHorizontal?: LayoutSizing;
  layoutSizingVertical?: LayoutSizing;
}

export interface TextSnapshot {
  nodeType: 3;
  id: string;
  text: string;
  rect: Rect;
  lineCount: number;
  sources?: SourceAnnotation[];
}

export type SnapshotNode = ElementSnapshot | TextSnapshot;

// ---------------------------------------------------------------------------
// Capture tree (top-level result)
// ---------------------------------------------------------------------------

export interface CaptureTree {
  root: ElementSnapshot;
  documentTitle?: string;
  experimental?: {
    reactFiberTree: SerializedFiberNode | null;
  };
  documentRect: Rect;
  viewportRect: Rect;
  devicePixelRatio: number;
  // assets and fonts are not needed in editor
}
