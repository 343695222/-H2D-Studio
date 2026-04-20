/**
 * Frontend type definitions for Knowledge Base data.
 * Mirrors server/src/types.ts knowledge-related types.
 */

export interface DesignSystemKnowledge {
  projectId: string;
  colors: ColorToken[];
  typography: TypographyToken[];
  spacing: SpacingToken[];
  borderRadius: BorderRadiusToken[];
  shadows: ShadowToken[];
  componentPatterns: ComponentPattern[];
  layoutPatterns: LayoutPattern[];
  updatedAt: string;
}

export interface ColorToken {
  value: string;
  usage: 'primary' | 'secondary' | 'accent' | 'background' | 'text' | 'border' | 'unknown';
  frequency: number;
  sourcePages: string[];
  isCustom?: boolean;
}

export interface TypographyToken {
  fontSize: string;
  fontWeight: string;
  fontFamily: string;
  lineHeight: string;
  usage: 'heading' | 'body' | 'caption' | 'label' | 'unknown';
  frequency: number;
  sourcePages: string[];
  isCustom?: boolean;
}

export interface SpacingToken {
  value: number;
  unit: string;
  frequency: number;
  sourcePages: string[];
  isCustom?: boolean;
}

export interface BorderRadiusToken {
  value: string;
  frequency: number;
  sourcePages: string[];
  isCustom?: boolean;
}

export interface ShadowToken {
  value: string;
  frequency: number;
  sourcePages: string[];
  isCustom?: boolean;
}

export interface ComponentPattern {
  name: string;
  description: string;
  structureHash: string;
  typicalStyles: Record<string, string>;
  typicalTag: string;
  childCount: { min: number; max: number };
  frequency: number;
  sourcePages: string[];
}

export interface LayoutPattern {
  name: string;
  description: string;
  direction: 'row' | 'column' | 'mixed';
  childCount: number;
  frequency: number;
  sourcePages: string[];
}
